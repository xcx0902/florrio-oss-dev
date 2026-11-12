#include "app/garden_session.hpp"
#include "wire/bootstrap.hpp"
#include "wire/economy_cache.hpp"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <future>
#include <iostream>
#include <numeric>
#include <stdexcept>
using namespace wave;
wire::Bytes bytes(std::string_view hex) {
  wire::Bytes r;
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    auto v = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    r.push_back(v(hex[i]) * 16 + v(hex[i + 1]));
  }
  return r;
}
void check(bool v, const char* why) {
  if (!v) {
    throw std::runtime_error(why);
  }
}
wire::ReliableAction decode(std::string_view hex) {
  wire::Bootstrap b;
  auto result = b.receive(bytes(hex));
  check(result.has_value(), "economic request decoded");
  return std::get<wire::Startup>(*result).requests.front().action;
}

// Independent capture-envelope reader: only inspect the reliable ACK, without
// depending on Session internals or decoding the private profile record body.
struct SnapshotHeaders {
  std::uint32_t state = 0x13bde6d7;
  std::uint32_t epoch = 0;
  std::array<std::uint8_t, 100> inverse{};

  static std::uint32_t next(std::uint32_t value) {
    return static_cast<std::uint32_t>((std::uint64_t{value} * 83875 + 1323) % 2147171462);
  }
  SnapshotHeaders() {
    std::array<std::uint8_t, 100> table;
    std::iota(table.begin(), table.end(), 0);
    std::uint32_t seed = 3056761215;
    for (std::size_t i = table.size() - 1; i; --i) {
      seed = next(seed);
      std::swap(table[i], table[seed % (i + 1)]);
    }
    for (const auto fixed : {0, 64, 4}) {
      std::swap(table[fixed], *std::ranges::find(table, fixed));
    }
    for (std::size_t i = 0; i < table.size(); ++i) {
      inverse[table[i]] = i;
    }
  }
  std::optional<std::uint32_t> consume(const app::Reply& reply) {
    check(!reply.close, "backpressure must not close the reliable session");
    std::optional<std::uint32_t> acknowledged;
    for (auto frame : reply.frames) {
      check(!frame.empty(), "server frame is nonempty");
      if (frame[0] == 0 || frame[0] == 64 || frame[0] == 4) {
        continue;
      }
      state = next(state);
      for (auto rounds = state % 12 + 1; rounds; --rounds) {
        check(frame[0] < inverse.size(), "captured envelope opcode is bounded");
        frame[0] = inverse[frame[0]];
      }
      std::array<std::uint8_t, 22> key;
      for (auto& value : key) {
        state = next(state);
        value = state & 255;
      }
      for (std::size_t i = 1; i < frame.size(); ++i) {
        frame[i] ^= key[i % key.size()];
      }
      if (frame[0] != 1) {
        continue;  // Guest-token command shares this cipher state.
      }
      check(frame.size() >= 4, "snapshot header is present");
      std::size_t offset = 1;
      epoch = 0;
      for (unsigned shift = 0;; shift += 7) {
        check(offset < frame.size() && shift <= 28, "snapshot epoch varint is present");
        const auto byte = frame[offset++];
        epoch |= std::uint32_t{byte & 127u} << shift;
        if (!(byte & 128)) {
          break;
        }
      }
      do {
        check(offset < frame.size(), "snapshot tick varint is present");
      } while (frame[offset++] & 128);
      check(offset < frame.size(), "snapshot reliable ACK is present");
      // These fixtures use sequences 0..2. The first masked payload byte uses
      // 0x13 from the captured October payload key, after the unmasked tick.
      acknowledged = frame[offset] ^ 0x13;
      check(*acknowledged < 128, "fixture reliable ACK fits one byte");
    }
    return acknowledged;
  }
};

void abandon_reentry() {
  app::Garden garden;
  app::GardenSession session(garden, 1);
  SnapshotHeaders headers;
  wire::Bytes hello{48};
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  hello.insert(hello.end(), build.begin(), build.end());
  hello.insert(hello.end(), 2, 0);
  check(headers.consume(session.receive(hello)) == 0, "reentry hello is accepted");
  // Independent CaptureCodec envelopes in cipher order: Identify, Ready,
  // Abandon + completion, delayed old Ready, fresh Identify, fresh Ready.
  check(headers.consume(session.receive(bytes("051eab7a7d0486e57d"))) == 1,
        "initial identity is accepted");
  check(headers.consume(session.receive(bytes("1705b38352"))) == 2,
        "initial Ready is acknowledged");
  check(garden.rooms().size() == 1 && garden.rooms().begin()->second.match,
        "first Ready creates a match");
  const auto first = garden.rooms().begin()->second.match->id();
  check(headers.consume(session.receive(bytes("04c251287eb3"))) == 0 && headers.epoch == 1,
        "Abandon resets the native world epoch and reliable sequence");
  check(garden.rooms().empty(), "Abandon leaves the first match");
  const auto old = session.receive(bytes("0421225936"));
  check(!old.close && old.frames.empty() && garden.rooms().empty(),
        "in-flight requests from the abandoned world cannot start another match");
  check(headers.consume(session.receive(bytes("16cbd1f08108740721"))) == 1 && headers.epoch == 1,
        "native world initialization reuses the same admitted identity");
  check(headers.consume(session.receive(bytes("0082fde9c0"))) == 2 && headers.epoch == 1,
        "Ready after Abandon works on the same connection");
  check(garden.rooms().size() == 1 && garden.rooms().begin()->second.match &&
            garden.rooms().begin()->second.match->id() != first,
        "second Ready creates a distinct playable match");

  wire::Bootstrap wide;
  for (unsigned i = 0; i < 128; ++i) {
    wide.next_world();
  }
  const auto ready = wide.receive(bytes("059eb87c15ae"));
  check(ready && std::get<wire::Ready>(std::get<wire::Startup>(*ready).requests[0].action).value,
        "world epochs remain valid past the single-byte boundary");
  SnapshotHeaders wide_headers;
  check(wide_headers.consume({{wide.world(1, 0)}, false}) == 0 && wide_headers.epoch == 128,
        "multi-byte world epochs preserve the snapshot payload mask boundary");
}

void session_queue_backpressure() {
  using namespace std::chrono_literals;
  struct Gate {
    std::atomic<bool> armed = false, entered = false, released = false;
    std::promise<void> reached, release;
    std::shared_future<void> ready = release.get_future().share();
    void open() {
      if (!released.exchange(true)) {
        release.set_value();
      }
    }
  };
  const auto gate = std::make_shared<Gate>();
  store::Options options;
  options.allow_test_seed = true;
  options.random_word = [] { return 1000000u; };  // Accepted word, guaranteed Common success.
  options.fault = [gate](store::FaultPoint point) {
    if (point == store::FaultPoint::before_commit && gate->armed && !gate->entered.exchange(true)) {
      gate->reached.set_value();
      gate->ready.wait();
    }
  };
  const auto db = std::make_shared<store::Store>(":memory:", options);
  const auto guest = db->create_guest();
  const store::Item rose{5, 0}, unusual_rose{5, 1};
  store::TestSeed seed;
  seed.inventory = guest.inventory;
  seed.inventory[rose] = 15;
  seed.slots = guest.slots;
  const auto initial = db->seed_for_testing(guest.guest_token, seed);
  std::size_t reads = 0;  // Outlive Garden callbacks during assertion unwinding.
  app::Garden garden(sim::garden_rules(), 7, {}, db);
  app::GardenSession session(garden, 1);
  // Release the worker before either owner is destroyed, even on an assertion.
  struct ReleaseOnExit {
    std::shared_ptr<Gate> gate;
    ~ReleaseOnExit() { gate->open(); }
  } release_on_exit{gate};
  SnapshotHeaders headers;
  wire::Bytes hello{48};
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  hello.insert(hello.end(), build.begin(), build.end());
  hello.push_back(0);
  hello.insert(hello.end(), initial.guest_token.begin(), initial.guest_token.end());
  hello.push_back(0);
  check(headers.consume(session.receive(hello)) == 0, "hello ACK starts at zero");
  // CaptureCodec-generated real encrypted envelopes, in connection cipher order:
  // Identify seq1; single Rose craft seq2; changed all=true duplicate seq2;
  // original single-craft duplicate seq2 after the queue drains.
  check(headers.consume(session.receive(bytes("051eab7a7d37e39314e7776d4c15"))) == 1,
        "encrypted identity establishes reliable sequence one");
  auto& member = garden.admit(initial.guest_token, 1);
  gate->armed = true;
  check(garden.command(member, wire::Craft{false, 0, rose.kind, 0}, {}, "queue-blocker"),
        "blocking craft accepted on worker");
  check(gate->reached.get_future().wait_for(2s) == std::future_status::ready,
        "worker reaches blocked transaction");
  for (std::size_t i = 1; i < app::Garden::storage_capacity; ++i) {
    check(garden.request_profile(
              initial.guest_token, [&](auto) { ++reads; }, false),
          "profile read fills remaining Garden capacity");
  }
  check(garden.storage_pending() == app::Garden::storage_capacity,
        "running transaction and queued reads reach exact capacity");
  check(headers.consume(session.receive(bytes("1705b38153e03266"))) == 1,
        "queue-full craft remains unacknowledged until Garden accepts it");
  check(headers.consume(session.receive(bytes("04c250267b91e74d"))) == 1,
        "duplicate queued sequence neither replaces the first payload nor advances ACK");
  check(garden.storage_pending() == app::Garden::storage_capacity && member.profile == initial &&
            member.craft_results.empty(),
        "backpressure publishes no uncommitted craft result or profile");

  gate->open();
  check(garden.wait_storage(), "accepted blocking craft and reads drain");
  check(reads == app::Garden::storage_capacity - 1 && member.profile->inventory.at(rose) == 10 &&
            member.craft_results.size() == 1,
        "only the blocking craft ran before Session is polled");
  // No client retransmission is needed: publish alone must admit the retained request.
  check(headers.consume(session.publish()) == 2,
        "publish admits retained craft and advances ACK once");
  check(garden.wait_storage(), "retained reliable craft commits");
  check(headers.consume(session.publish()) == 2, "committed craft retains reliable ACK");
  check(member.profile->inventory.at(rose) == 5 &&
            member.profile->inventory.at(unusual_rose) == 2 &&
            member.profile->version == initial.version + 2 && member.craft_results.size() == 2 &&
            member.craft_results.back().second.code == store::Code::ok &&
            member.craft_results.back().second.craft.successes == 1,
        "first queued single-craft semantics commit once despite changed duplicate payload");
  const auto committed = *member.profile;
  check(headers.consume(session.receive(bytes("0421255b37baa660"))) == 2 && garden.wait_storage(),
        "retransmitted accepted sequence is acknowledged without reexecution");
  check(headers.consume(session.publish()) == 2 && member.profile == committed &&
            member.craft_results.size() == 2,
        "repeated publish and retransmission conserve inventory, version and result count");
}

int main() {
  try {
    const auto craft = std::get<wire::Craft>(decode("051eab727c4583e5"));
    check(!craft.all && craft.keep == 0 && craft.kind == 5 && craft.rarity == 0,
          "original Common Rose five-to-one");
    const auto batch = std::get<wire::Craft>(decode("051eab727d4783e4"));
    check(batch.all && batch.keep == 2 && batch.rarity == 1, "original batch preserves count");
    const auto equip = std::get<wire::Equip>(decode("051eab7b794486e57d82006d4c152540a1db3b5ceb"));
    check(equip.slots[0] == std::pair<std::uint32_t, std::uint8_t>{5, 1} &&
              equip.slots[15].first == 0,
          "sixteen menu equipment slots");
    const auto swap = std::get<wire::Swap>(decode("051eab6b7c4087ed7c82"));
    check(swap.first == 0 && swap.second == 8 && swap.first_item.first == 5 &&
              swap.second_item.first == 1,
          "live main/reserve swap");
    for (auto malformed : {"051eab727e4583e5", "051eab727c45a8e5", "051eab727c4583e3",
                           "051eab7b7c4586e57d82006d4c152540a1db3b", "051eab727cba791a82fd056d",
                           "051eab6b6c4087ed7c82"}) {
      wire::Bootstrap b;
      check(!b.receive(bytes(malformed)), "malformed economic request rejected");
    }
    store::Slots slots;
    slots[0] = store::Item{5, 0};
    check(wire::equipped_cache(slots) == "BQAAAAAAAAAAAAAAAAAAAADV/Iq1vrWGm7QB2ay4wcysxuMI",
          "normal original $384 equipment cache capture");
    check(wire::signed_cache(10) == "FPr+g4XqtI7LDNDnt4b2/vGLUw==",
          "original signed level cache capture");
    check(wire::signed_cache(5, "cached_num_petals") == "Ctij352j+Ou27AG9uO7BzZfnhzA=",
          "original slot-count cache capture");
    store::Inventory inventory{{{1, 0}, 125}, {{1, 1}, 25}, {{1, 2}, 10},
                               {{1, 3}, 5},   {{1, 4}, 5},  {{5, 0}, 20}};
    check(wire::inventory_cache(inventory) ==
              "BgEAfQUAFAEBGQECCgEDBQEEBeSsqKf94N//NtWW5on/yIH9fg==",
          "original sparse inventory cache capture");
    for (auto level : {1u, 15u, 30u, 45u}) {
      store::Profile profile;
      profile.level = level;
      profile.slots[8] = store::Item{5, 1};
      const auto packed = wire::client_equipment(profile);
      check(packed[store::unlocked_main_slots(level)] == profile.slots[8],
            "reserve follows current main-slot count");
    }
    session_queue_backpressure();
    abandon_reentry();
    std::cout
        << "W3-03/W3-05 economic decoder, bounded fields, original equipment cache and Session backpressure passed\n";
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
