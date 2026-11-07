#include "app/garden_session.hpp"
#include "scenarios/garden-w2.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string_view>

namespace {
void check(bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    std::exit(1);
  }
}
const wave::sim::PlayerView& player(const wave::sim::MatchView& view, wave::sim::PlayerId id) {
  const auto it = std::ranges::find(view.players, id, &wave::sim::PlayerView::id);
  check(it != view.players.end(), "Player present in authoritative room");
  return *it;
}

wave::wire::Bytes bytes(std::string_view hex) {
  wave::wire::Bytes result;
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    const auto nibble = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    result.push_back(static_cast<std::uint8_t>(nibble(hex[i]) * 16 + nibble(hex[i + 1])));
  }
  return result;
}

void session_life_boundary() {
  using namespace wave;
  auto rules = fixtures::wire_garden_rules();
  for (auto& wave : rules.waves) {
    wave.deadline = 100;
  }
  app::Garden garden(rules, 20221030, {{sim::Petal::rose}});
  auto& member = garden.admit("", 1);
  wire::Bytes hello{48};
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  hello.insert(hello.end(), build.begin(), build.end());
  hello.push_back(0);
  hello.insert(hello.end(), member.token.begin(), member.token.end());
  hello.push_back(0);
  // Original-client startup capture, followed by independent encrypted ACK/input fixtures.
  const auto startup = bytes("1705b09d51ed3631dffbf0d0ea92040375425c94ca7554135a3a71f6e6439e7a"
                             "02bb39b32ee351683424b43e63e0068cb5eedf2b93ff5760fe6f461e988bf5fb"
                             "c8d27c798b356a80986380e42e7dabce056ddfd6eb84743db33ef0d775876f37"
                             "80b9dcccf77a824e8692735b2fb90c4f7fdfe028232098598ac6d28dbdfab9b1"
                             "9cf4288c50c1775b89");
  app::GardenSession session(garden, 2);
  check(!session.receive(hello).close && !session.receive(bytes("201eb8")).close,
        "Reconnecting session consumes original hello and first ACK");
  check(session.receive(startup).frames.size() == 4, "Original identity batch restores member");
  auto& survivor = garden.admit("", 99);
  check(garden.command(member, wire::CreateSquad{true}, {}) &&
            garden.command(survivor, wire::JoinSquad{member.room}, {}) &&
            garden.command(survivor, wire::Ready{true}, {}) &&
            garden.command(member, wire::Ready{true}, {}),
        "Session fixture starts shared Garden");
  garden.step();
  auto view = garden.room(member)->match->view();
  const auto old_life = player(view, member.id).life;
  check(session.publish().frames.size() == 1, "Tick 5 binds initial life");
  check(!session.receive(bytes("2ac244")).close, "Original ACK binds tick 5 life");
  const auto target =
      *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
  for (unsigned i = 0; i < 50 && player(view, member.id).state == sim::LifeState::alive; ++i) {
    const auto body =
        std::ranges::find(view.entities, *player(view, member.id).body, &sim::EntityView::id);
    const auto delta = target.position - body->position;
    garden.command(member, wire::Move{0, float(std::atan2(delta.y, delta.x)), 100}, old_life);
    garden.step();
    view = garden.room(member)->match->view();
  }
  check(player(view, member.id).state == sim::LifeState::waiting, "Session fixture dies in W1");
  while (view.wave.number == 1 || view.phase == sim::Phase::waiting) {
    garden.step();
    view = garden.room(member)->match->view();
  }
  check(player(view, member.id).life != old_life, "Session fixture respawns with a new life");
  check(session.publish().frames.size() == 1, "Tick 6 binds respawned life");
  const auto rejected = garden.rejected_inputs;
  check(!session.receive(bytes("0421235737baa36086c783609d")).close &&
            garden.rejected_inputs == rejected + 1,
        "Delayed sequence 4 retains stale ACK life and is denied");
  check(!session.receive(bytes("16cad4f48049740721eaf877a0")).close &&
            garden.rejected_inputs == rejected + 1,
        "Reliable duplicate is consumed only once");
  check(!session.receive(bytes("4c83ea")).close && !session.receive(bytes("459cc8")).close,
        "Fresh ACK followed by delayed older ACK preserves new life");
  const auto accepted = garden.accepted_inputs;
  check(!session.receive(bytes("13757a83390ef9fe02fd75d427")).close &&
            garden.accepted_inputs == accepted + 1,
        "Fresh life ACK restores original wire input");
  app::GardenSession replacement(garden, 3);
  check(!replacement.receive(hello).close && !replacement.receive(bytes("201eb8")).close &&
            !replacement.receive(startup).close,
        "Replacement socket restores original guest");
  check(session.publish().close && garden.active(member.token, 3),
        "Displaced socket cannot publish or disconnect its replacement");
}
}  // namespace

int main() {
  using namespace wave;
  auto rules = fixtures::wire_garden_rules();
  for (auto& wave : rules.waves) {
    wave.deadline = 100;
  }
  app::Garden garden(rules, 20221030, {{sim::Petal::rose}, {sim::Petal::basic}});
  auto& a = garden.admit("", 1);
  auto& b = garden.admit("", 2);
  check(a.id != b.id && a.token != b.token, "Independent guest identities");
  check(garden.command(a, wire::Nickname{"Wave A"}, {}), "Nickname action");
  check(garden.command(a, wire::CreateSquad{true}, {}), "Create private room");
  const auto room_code = a.room;
  check(!garden.command(b, wire::JoinSquad{"missing"}, {}), "Unknown invite denied");
  check(garden.command(b, wire::JoinSquad{room_code}, {}), "Join by original room code");
  auto& c = garden.admit("", 3);
  check(!garden.command(c, wire::JoinSquad{room_code}, {}), "Local two-seat capacity");
  check(garden.command(a, wire::Ready{true}, {}), "First ready");
  check(!garden.room(a)->match, "First player cannot start an unready two-person room");
  check(garden.command(b, wire::Ready{true}, {}), "Second ready starts shared match");
  check(garden.command(b, wire::JoinSquad{room_code}, {}), "Repeated join cannot duplicate seat");
  check(garden.room(a) == garden.room(b), "One shared room object");
  wire::GardenProjection projection;
  garden.step();
  auto view = garden.room(a)->match->view();
  check(view.next_tick == 1 && view.wave.counts.spawned == 2 && view.wave.counts.pending == 4,
        "One room update, first spawn batch only");
  const auto life = player(view, a.id).life;
  const auto initial = projection.build(garden, a);
  check(initial.control == life && !initial.records.empty(), "Authoritative local life projected");
  check(!garden.command(a, wire::Move{0, 0, 100}, {}),
        "Input requires a consumed life snapshot ACK");
  auto target = *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
  for (unsigned i = 0; i < 50 && player(view, a.id).state == sim::LifeState::alive; ++i) {
    const auto body =
        std::ranges::find(view.entities, *player(view, a.id).body, &sim::EntityView::id);
    check(body != view.entities.end(), "Live body exists");
    const auto delta = target.position - body->position;
    check(garden.command(a, wire::Move{0, float(std::atan2(delta.y, delta.x)), 100}, life),
          "Current-life original movement admitted");
    garden.step();
    view = garden.room(a)->match->view();
  }
  check(player(view, a.id).state == sim::LifeState::waiting, "W1 contact damage kills A");
  check(player(view, b.id).state == sim::LifeState::alive, "B survives independently");
  const auto dead = projection.build(garden, a);
  check(!dead.control && !dead.removed.empty(), "Death removes controlled body and petals");
  check(!garden.command(a, wire::Move{0, 0, 100}, life), "Old life rejected while waiting");
  while (view.wave.number == 1 || view.phase == sim::Phase::waiting) {
    garden.step();
    view = garden.room(a)->match->view();
  }
  const auto next_life = player(view, a.id).life;
  check(next_life.generation > life.generation, "Next wave creates a new life generation");
  check(!garden.command(a, wire::Move{0, 0, 100}, life),
        "Stale input cannot control a respawned body");
  check(garden.command(a, wire::Move{0, 0, 0}, next_life),
        "Fresh acknowledged life regains control");
  const auto reborn = projection.build(garden, a);
  check(reborn.control == next_life, "Respawn profile carries the new controlling reference");
  const auto id = b.id;
  const auto token = b.token;
  garden.disconnect(token, 2);
  garden.step();
  check(!player(garden.room(a)->match->view(), id).connected, "Disconnect reaches W1 exactly once");
  auto& resumed = garden.admit(token, 4);
  check(resumed.id == id && resumed.room == room_code,
        "Reconnect restores room and player identity");
  check(!garden.active(token, 2) && garden.active(token, 4), "Old socket loses identity ownership");
  garden.disconnect(token, 2);
  garden.step();
  check(player(garden.room(a)->match->view(), id).connected,
        "Old socket teardown cannot disconnect replacement");
  const auto first_tick = garden.room(a)->match->view().next_tick;
  check(garden.command(c, wire::CreateSquad{true}, {}) && garden.command(c, wire::Ready{true}, {}),
        "Second isolated room starts");
  garden.step();
  check(garden.room(a)->match->view().next_tick == first_tick + 1 &&
            garden.room(c)->match->view().next_tick == 1,
        "Each room advances once on the host clock");
  check(garden.room(a)->match->view().id != garden.room(c)->match->view().id,
        "Distinct authoritative match identities");
  session_life_boundary();
  std::cout
      << "W2 rooms, batched spawns, life bindings, projection removals, reconnect and isolation passed\n";
}
