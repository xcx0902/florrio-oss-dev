#include "app/garden.hpp"
#include "net/dev_inventory.hpp"
#include "store/store.hpp"

#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
using namespace wave::store;
void check(bool value, const char* message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}

void edits() {
  Store production(":memory:");
  const auto original = production.create_guest();
  check(production
                .debug_set_inventory(original.guest_token, {"debug", "disabled", original.version},
                                     {5, 0}, 100)
                .code == Code::protected_item,
        "Production Store rejects debug writes");
  check(*production.recover_guest(original.guest_token) == original,
        "Disabled write changes nothing");

  Options options;
  options.allow_debug_inventory = true;
  options.allow_test_seed = true;
  Store store(":memory:", options);
  auto profile = store.create_guest();
  const auto token = profile.guest_token;
  TestSeed seed;
  seed.xp = 150;
  seed.highest_wave = 7;
  seed.inventory = profile.inventory;
  seed.slots = profile.slots;
  seed.slots[8] = Item{1, 0};
  seed.inventory[{1, 0}] = 6;
  seed.discoveries.insert({4, 2});
  profile = store.seed_for_testing(token, seed);
  const auto before = profile;
  const Command command{"dev-inventory", "reduce", profile.version};
  const auto reduced = store.debug_set_inventory(token, command, {1, 0}, 2);
  check(reduced.code == Code::ok && reduced.profile.inventory.at({1, 0}) == 2,
        "Exact count can be reduced below equipped count");
  check(reduced.profile.slots[0] == Item{1, 0} && reduced.profile.slots[1] == Item{1, 0},
        "Main slots retained first");
  for (std::size_t i = 2; i < 16; ++i) {
    check(!reduced.profile.slots[i], "Excess equipment cleared atomically");
  }
  check(reduced.profile.xp == before.xp && reduced.profile.highest_wave == before.highest_wave &&
            reduced.profile.discoveries == before.discoveries &&
            reduced.profile.guest_token == before.guest_token,
        "Inventory editing preserves other profile fields");
  check(store.debug_set_inventory(token, command, {1, 0}, 2).replayed, "Exact retry replays");
  check(store.recover_guest(token)->version == reduced.profile.version,
        "Replay increments no version");
  check(store.debug_set_inventory(token, command, {1, 0}, 3).code == Code::key_conflict,
        "Changed replay semantics rejected");
  check(store.debug_set_inventory(token, {"dev-inventory", "stale", before.version}, {5, 0}, 50)
                .code == Code::version_conflict,
        "Concurrent stale edit rejected");
  profile = reduced.profile;
  unsigned key = 0;
  // Every registered kind and rarity can be held, even before effects are implemented.
  for (std::uint32_t kind = 1; kind <= 45; ++kind) {
    for (std::uint8_t rarity = 0; rarity < 6; ++rarity) {
      const auto result = store.debug_set_inventory(
          token, {"dev-inventory", std::to_string(++key), profile.version}, {kind, rarity}, 123);
      check(result.code == Code::ok, "All inventory identities editable");
      profile = result.profile;
    }
  }
  auto result =
      store.debug_set_inventory(token, {"dev-inventory", "zero", profile.version}, {1, 0}, 0);
  check(result.code == Code::ok && !result.profile.inventory.contains({1, 0}), "Zero removes item");
  check(!result.profile.slots[0] && !result.profile.slots[1], "Zero removes equipped copies");
  profile = result.profile;
  for (const Item bad : {Item{0, 0}, Item{46, 0}, Item{5, 6}}) {
    check(store.debug_set_inventory(
                   token, {"dev-inventory", std::to_string(++key), profile.version}, bad, 1)
                  .code == Code::invalid_request,
          "Unknown identity rejected");
  }
  check(store.debug_set_inventory(token, {"dev-inventory", "overflow", profile.version}, {5, 0},
                                  Count{std::numeric_limits<std::uint32_t>::max()} + 1)
                .code == Code::invalid_request,
        "Unrepresentable client count rejected");
  check(store.debug_set_inventory(std::string(64, 'a'), {"dev-inventory", "unknown", 0}, {5, 0}, 1)
                .code == Code::unknown_guest,
        "Unknown token never creates a guest");
}

void queued_edit() {
  Options options;
  options.allow_debug_inventory = true;
  auto db = std::make_shared<Store>(":memory:", options);
  const auto before = db->create_guest();
  wave::app::Garden garden(wave::sim::garden_rules(), 42, {}, db);
  auto& member = garden.admit(before.guest_token, 1);
  bool done = false;
  check(garden.debug_inventory(before.guest_token, {"dev-inventory", "queued", before.version},
                               {5, 5}, 400,
                               [&](Result result) {
                                 check(result.code == Code::ok, "Queued edit commits");
                                 done = true;
                               }),
        "Queue accepts edit");
  check(garden.wait_storage() && done, "Queue completion delivered");
  check(member.profile->inventory.at({5, 5}) == 400, "Active member receives committed inventory");
  check(db->recover_guest(before.guest_token)->inventory.at({5, 5}) == 400,
        "Database receives edit");
}

void http_validation() {
  const std::string good = "kind=45&rarity=5&count=4294967295&version=0&key=test-123";
  check(wave::dev::parse_inventory_edit(good).has_value(), "Full range parses");
  for (const auto* bad : {
           "kind=0&rarity=0&count=1&version=0&key=k",
           "kind=46&rarity=0&count=1&version=0&key=k",
           "kind=5&rarity=6&count=1&version=0&key=k",
           "kind=5&rarity=0&count=-1&version=0&key=k",
           "kind=5&rarity=0&count=1.5&version=0&key=k",
           "kind=5&rarity=0&count=4294967296&version=0&key=k",
           "kind=5&rarity=0&count=1&version=0&key=",
           "kind=5&rarity=0&count=1&version=0&key=k&count=9",
           "kind=5&rarity=0&count=1&version=0&key=k&",
           "kind=5&rarity=0&count=1&version=0",
           "kind=5&rarity=0&count=1&version=0&key=%00",
       }) {
    check(!wave::dev::parse_inventory_edit(bad), "Malformed edit rejected");
  }
}
}  // namespace

int main() {
  try {
    edits();
    queued_edit();
    http_validation();
    std::cout
        << "PASS dev inventory: isolation, 270 identities, equipment, replay, CAS and queue\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
