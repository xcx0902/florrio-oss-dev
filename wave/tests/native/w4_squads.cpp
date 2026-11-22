#include "app/room_manager.hpp"
#include "scenarios/wire_match.hpp"
#include "wire/world_projection.hpp"

#include <algorithm>
#include <array>
#include <iostream>
#include <stdexcept>

namespace {
using namespace wave;

void check(bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void private_lifecycle() {
  app::RoomManager rooms(fixtures::wire_fixture_rules());
  auto& a = rooms.admit("", 1);
  auto& b = rooms.admit("", 2);
  auto& c = rooms.admit("", 3);
  auto& d = rooms.admit("", 4);
  auto& e = rooms.admit("", 5);
  check(rooms.command(a, wire::CreateSquad{true}, {}), "Host creates a private squad");
  check(rooms.command(e, wire::CreateSquad{true}, {}), "Challenger has a private lobby");
  const auto code = a.room;
  const auto previous = e.room;
  check(rooms.join_squad(b, code) == app::JoinResult::joined &&
            rooms.join_squad(c, code) == app::JoinResult::joined,
        "Two invited guests join");
  check(rooms.join_squad(d, code) == app::JoinResult::joined &&
            rooms.join_squad(e, code) == app::JoinResult::full && e.room == previous &&
            rooms.join_squad(d, code) == app::JoinResult::joined &&
            rooms.room(a)->members.size() == 4,
        "One winner for the last seat; denial preserves the old lobby; replay is idempotent");
  rooms.command(d, wire::Leave{}, {});
  check(rooms.join_squad(e, code) == app::JoinResult::joined &&
            rooms.join_squad(d, previous) == app::JoinResult::unavailable,
        "Cancellation releases exactly one seat and the old code expires");

  rooms.command(b, wire::Ready{true}, {});
  rooms.command(c, wire::Ready{true}, {});
  rooms.command(c, wire::Ready{false}, {});
  check(b.ready && !c.ready && !rooms.room(a)->match, "Ready can be cancelled before start");
  rooms.disconnect(a.token, 1);
  check(!b.ready && !c.ready && !rooms.room(a) && rooms.room(b)->members.front() == b.token &&
            !rooms.command(c, wire::SetSquadPublic{true}, {}) &&
            rooms.command(b, wire::SetSquadPublic{true}, {}) &&
            rooms.command(b, wire::SetSquadPublic{false}, {}),
        "Host departure clears readiness and passes lobby ownership to the next seat");
  rooms.admit(a.token, 6);
  check(rooms.join_squad(a, code) == app::JoinResult::joined, "Former host can join the open seat");
  for (auto* member : {&a, &b, &c, &e}) {
    check(rooms.command(*member, wire::Ready{true}, {}), "Each of four members can ready");
  }
  const auto id = rooms.room(b)->match->id();
  rooms.command(b, wire::Ready{true}, {});
  rooms.step();
  check(rooms.room(b)->match->id() == id && rooms.room(b)->match->view().players.size() == 4,
        "A single match starts with all four seats");
  rooms.command(e, wire::Leave{}, {});
  rooms.step();
  check(rooms.join_squad(d, code) == app::JoinResult::started &&
            rooms.room(b)->match->view().players.size() == 3,
        "A running private game retains its players and reports an expired invitation");
}

void public_selection_and_recovery() {
  auto db = std::make_shared<store::Store>(":memory:", store::Options{.allow_test_seed = true});
  app::RoomManager rooms(std::nullopt, 20221030, {}, db, sim::Biome::desert,
                         {.reconnect_grace = std::chrono::seconds(5)});
  std::uint64_t connection = 0;
  const auto guest = [&](unsigned best, sim::Biome biome = sim::Biome::garden) -> app::Member& {
    const auto profile = db->create_guest();
    store::TestSeed seed;
    seed.inventory = profile.inventory;
    seed.slots = profile.slots;
    seed.highest_waves.fill(best);
    (void)db->seed_for_testing(profile.guest_token, seed);
    return rooms.admit(profile.guest_token, ++connection, biome);
  };
  const auto start = [&](unsigned best, bool private_room = false,
                         sim::Biome biome = sim::Biome::garden) -> app::Member& {
    auto& member = guest(best, biome);
    if (private_room) {
      check(rooms.command(member, wire::CreateSquad{true}, {}), "Seeded guest creates a private squad");
    }
    check(rooms.command(member, wire::Ready{true}, {}) && rooms.room(member)->match &&
              rooms.room(member)->private_room == private_room,
          "Ready starts a match with the intended visibility");
    return member;
  };
  auto& wave4 = start(6);
  auto& wave8 = start(12);
  auto& tie = start(12);
  auto& wave11 = start(17);
  auto& hidden = start(15, true);
  auto& rotated = start(15, false, sim::Biome::desert);
  auto& entrant = guest(10);
  rooms.step();
  check(rooms.room(wave4)->match->view().wave.number == 4 &&
            rooms.room(wave8)->match->view().wave.number == 8 &&
            rooms.room(wave11)->match->view().wave.number == 11,
        "Fixture contains running waves 4, 8 and 11");
  const auto& match = *rooms.room(wave8)->match;
  const auto before = match.view();
  check(rooms.command(entrant, wire::FindPublicSquad{}, {}) && !rooms.room(entrant)->match &&
            !rooms.room(entrant)->private_room,
        "Find Public creates a waiting lobby even with an eligible running match");
  auto& waiting = guest(10);
  check(rooms.command(waiting, wire::FindPublicSquad{}, {}) && waiting.room == entrant.room,
        "Find Public fills the waiting lobby");
  check(rooms.command(entrant, wire::Ready{true}, {}) && entrant.ready && !rooms.room(entrant)->match,
        "Ready in a squad keeps its members together");
  rooms.command(entrant, wire::Leave{}, {});
  check(rooms.command(entrant, wire::Ready{true}, {}) && entrant.room == wave8.room &&
            match.view().next_tick == before.next_tick && match.view().wave.number == 8,
        "Unteamed Ready picks the oldest highest eligible running match at the same tick");
  const auto projection = wire::WorldProjection{}.build(rooms, entrant);
  check(projection.control && projection.control->player == entrant.id &&
            !rooms.command(entrant, wire::Move{0, 0, 200}, {}) &&
            rooms.command(entrant, wire::Move{0, 0, 200}, projection.control),
        "The same wave grants control immediately and still requires a life ACK for input");
  check(rooms.room(wave8)->members.size() == 2 && rooms.room(tie)->members.size() == 1 &&
            rooms.room(hidden)->members.size() == 1 && rooms.room(rotated)->members.size() == 1,
        "Tie, private and wrong-biome rooms retain their rosters");

  auto& third = guest(10);
  auto& fourth = guest(10);
  rooms.disconnect(entrant.token, entrant.connection);
  rooms.step();
  check(rooms.command(third, wire::Ready{true}, {}) && third.room == wave8.room &&
            rooms.command(fourth, wire::Ready{true}, {}) && fourth.room == wave8.room,
        "Disconnected reservation counts toward capacity while others can join");
  auto& overflow = guest(10);
  check(rooms.command(overflow, wire::Ready{true}, {}) && overflow.room == tie.room &&
            rooms.room(wave8)->members.size() == 4,
        "A full running match is skipped in public search");
  const auto token = entrant.token;
  const auto old_connection = entrant.connection;
  auto& resumed = rooms.admit(token, ++connection);
  rooms.step();
  check(!rooms.active(token, old_connection) && resumed.room == wave8.room &&
            wire::WorldProjection{}.build(rooms, resumed).control == projection.control,
        "Reconnect restores the same life and seat, superseding the old socket");
  rooms.disconnect(token, connection);
  rooms.reap_disconnected(false, std::chrono::steady_clock::now() + std::chrono::seconds(6));
  rooms.step();
  check(!rooms.member(token) && rooms.room(wave8)->members.size() == 3,
        "Expired reservation departs on the next step");
  auto& returned = rooms.admit(token, ++connection);
  check(returned.room.empty() && rooms.command(returned, wire::Ready{true}, {}) &&
            returned.room == wave8.room &&
            wire::WorldProjection{}.build(rooms, returned).control != projection.control,
        "Expired guest can join again with a fresh life");

  auto& fresh = guest(0);
  check(rooms.command(fresh, wire::Ready{false}, {}) && fresh.room.empty(),
        "Cancelling Ready leaves an unteamed guest in the menu");
  check(rooms.command(fresh, wire::Ready{true}, {}) && fresh.room != waiting.room &&
            rooms.room(fresh)->match && !rooms.room(fresh)->private_room,
        "No eligible running match starts a public solo match without joining a waiting lobby");
  rooms.step();
  auto& other_fresh = guest(0);
  check(rooms.command(other_fresh, wire::Ready{true}, {}) && other_fresh.room != fresh.room,
        "A fresh guest has no late entry to a running wave one");
  auto& eligible = guest(1);
  check(rooms.command(eligible, wire::Ready{true}, {}) && eligible.room == fresh.room &&
            wire::WorldProjection{}.build(rooms, eligible).control,
        "A guest who cleared wave one can immediately join the public solo match");
}
}  // namespace

int main() {
  try {
    private_lifecycle();
    public_selection_and_recovery();
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
