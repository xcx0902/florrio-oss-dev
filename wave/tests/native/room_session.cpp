#include "app/client_session.hpp"
#include "scenarios/wire_match.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <span>
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

void leech_wave_count() {
  using namespace wave;
  auto rules = sim::scenario_rules(sim::Biome::garden);
  rules.progressive_waves = false;
  rules.special_chance = 0;
  rules.remaining_threshold = 0;
  rules.waves = {{1, {sim::Mob::leech}, sim::Rarity::common, 1, {{0, 1}}, 200}};
  app::RoomManager rooms(rules);
  auto& member = rooms.admit("", 1);
  check(rooms.command(member, wire::Ready{true}, {}), "Leech count fixture starts");
  rooms.step();
  const auto view = rooms.room(member)->match->view();
  check(view.population[static_cast<unsigned>(sim::Group::segment)] == 5,
        "The Leech still has all five body sections in the world");
  const auto snapshot = wire::WorldProjection{}.build(rooms, member);
  // The last record ends in 216 mob counts (each a single byte here) and spawn progress.
  constexpr std::size_t entries = 216;
  check(snapshot.records.size() >= entries + 1, "Wave count record is present");
  const auto counts = std::span(snapshot.records).last(entries + 1).first(entries);
  check(counts[34 * 6] == 1 && std::ranges::count(counts, 0) == entries - 1,
        "The wave HUD counts the whole Common Leech once, at client mob ID 34");
}

void session_life_boundary() {
  using namespace wave;
  auto rules = fixtures::wire_fixture_rules();
  for (auto& wave : rules.waves) {
    wave.deadline = 100;
  }
  app::RoomManager rooms(rules, 20221030, {{sim::Petal::rose}});
  auto& member = rooms.admit("", 1);
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
  app::ClientSession session(rooms, 2);
  check(!session.receive(hello).close && !session.receive(bytes("201eb8")).close,
        "Reconnecting session consumes original hello and first ACK");
  check(session.receive(startup).frames.size() == 4, "Original identity batch restores member");
  auto& survivor = rooms.admit("", 99);
  check(rooms.command(member, wire::CreateSquad{true}, {}) &&
            rooms.command(survivor, wire::JoinSquad{member.room}, {}) &&
            rooms.command(survivor, wire::Ready{true}, {}) &&
            rooms.command(member, wire::Ready{true}, {}),
        "Session fixture starts the shared match");
  rooms.step();
  auto view = rooms.room(member)->match->view();
  const auto old_life = player(view, member.id).life;
  check(session.publish().frames.size() == 1, "Tick 5 binds initial life");
  check(!session.receive(bytes("2ac244")).close, "Original ACK binds tick 5 life");
  const auto target =
      *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
  for (unsigned i = 0; i < 50 && player(view, member.id).state == sim::LifeState::alive; ++i) {
    const auto body =
        std::ranges::find(view.entities, *player(view, member.id).body, &sim::EntityView::id);
    const auto delta = target.position - body->position;
    rooms.command(member, wire::Move{0, float(std::atan2(delta.y, delta.x)), 100}, old_life);
    rooms.step();
    view = rooms.room(member)->match->view();
  }
  check(player(view, member.id).state == sim::LifeState::waiting, "Session fixture dies in W1");
  while (view.wave.number == 1 || view.phase == sim::Phase::waiting) {
    rooms.step();
    view = rooms.room(member)->match->view();
  }
  check(player(view, member.id).life != old_life, "Session fixture respawns with a new life");
  check(session.publish().frames.size() == 1, "Tick 6 binds respawned life");
  const auto rejected = rooms.rejected_inputs;
  check(!session.receive(bytes("0421235737baa36086c783609d")).close &&
            rooms.rejected_inputs == rejected + 1,
        "Delayed sequence 4 retains stale ACK life and is denied");
  check(!session.receive(bytes("16cad4f48049740721eaf877a0")).close &&
            rooms.rejected_inputs == rejected + 1,
        "Reliable duplicate is consumed only once");
  check(!session.receive(bytes("4c83ea")).close && !session.receive(bytes("459cc8")).close,
        "Fresh ACK followed by delayed older ACK preserves new life");
  const auto accepted = rooms.accepted_inputs;
  check(!session.receive(bytes("13757a83390ef9fe02fd75d427")).close &&
            rooms.accepted_inputs == accepted + 1,
        "Fresh life ACK restores original wire input");
  app::ClientSession replacement(rooms, 3);
  check(!replacement.receive(hello).close && !replacement.receive(bytes("201eb8")).close &&
            !replacement.receive(startup).close,
        "Replacement socket restores original guest");
  const auto displaced = session.publish();
  check(displaced.close && displaced.reason == app::CloseReason::superseded &&
            displaced.frames.empty() && rooms.active(member.token, 3),
        "A replaced socket closes without a forced reload or affecting its replacement");
}

void orbit_buttons() {
  using namespace wave;
  auto rules = fixtures::wire_fixture_rules();
  rules.lifecycle.end_on_last_disconnect = false;
  app::RoomManager rooms(rules);
  auto& member = rooms.admit("", 1);
  check(rooms.command(member, wire::Ready{true}, {}), "Solo orbit fixture ready");
  rooms.step();
  const auto life = rooms.room(member)->match->view().players.front().life;
  const auto distance = [&] {
    const auto view = rooms.room(member)->match->view();
    const auto body = std::ranges::find(view.entities, sim::Group::player, &sim::EntityView::group);
    const auto petal = std::ranges::find(view.entities, sim::Group::petal, &sim::EntityView::group);
    check(body != view.entities.end() && petal != view.entities.end(), "Live orbit entities");
    return (petal->position - body->position).length();
  };
  const auto orbit_for = [&](unsigned buttons) {
    check(rooms.command(member, wire::Move{buttons, 0, 0}, life), "Orbit input accepted");
    rooms.step();
    return distance();
  };
  const auto idle = orbit_for(0);
  const auto attack = orbit_for(1);
  const auto defend = orbit_for(2);
  check(attack > idle && defend < idle, "Attack expands and defense contracts the orbit");
  check(std::abs(orbit_for(3) - defend) < 1e-8, "Defense wins if both buttons are held");
  check(std::abs(orbit_for(256) - idle) < 1e-8, "Unrelated buttons leave orbit unchanged");
  orbit_for(1);
  rooms.disconnect(member.token, 1);
  rooms.step();
  check(std::abs(distance() - idle) < 1e-8, "Disconnect clears held orbit mode");
}

void squad_departure() {
  using namespace wave;
  auto rules = fixtures::wire_fixture_rules();
  app::RoomManager rooms(rules);
  auto& a = rooms.admit("", 1);
  auto& b = rooms.admit("", 2);
  check(rooms.command(a, wire::CreateSquad{true}, {}) &&
            rooms.command(b, wire::JoinSquad{a.room}, {}) &&
            rooms.command(a, wire::Ready{true}, {}) && rooms.command(b, wire::Ready{true}, {}),
        "Departure fixture starts a squad");
  rooms.step();
  const auto before = rooms.room(a)->match->view();
  const auto old_life = player(before, a.id).life;
  const auto survivor = player(before, b.id);
  // Socket loss must retain the same flower for a subsequent reconnect.
  rooms.disconnect(a.token, 1);
  rooms.step();
  check(player(rooms.room(b)->match->view(), a.id).body == player(before, a.id).body,
        "Temporary disconnect retains the flower in its arena");
  rooms.admit(a.token, 3);
  rooms.step();
  auto& match = *rooms.room(b)->match;
  check(rooms.command(a, wire::Leave{}, {}), "Abandon releases the member's room");
  check(!rooms.room(a) && rooms.room(b)->members.size() == 1,
        "Only the departing member loses its squad seat");
  // These were valid when queued but must not dereference a departed player.
  check(match.queue(sim::Departure{a.id}) && match.queue(sim::Connection{a.id, true}) &&
            match.queue(sim::Input{old_life, {1, 0}}) &&
            match.queue(sim::Equip{old_life, {sim::Petal::basic}, {}}),
        "Delayed commands can share the departure tick");
  rooms.step();
  const auto after = match.view();
  check(after.id == before.id && after.phase != sim::Phase::ended && after.players.size() == 1 &&
            player(after, b.id).life == survivor.life && player(after, b.id).body == survivor.body,
        "The surviving teammate continues the original match and life");
  check(std::ranges::none_of(
            after.entities,
            [&](const auto& entity) { return entity.owner && entity.owner->player == a.id; }),
        "Abandon removes the flower and every entity owned by the departing life");
  check(!match.queue(sim::Connection{a.id, true}) && !match.queue(sim::Input{old_life, {1, 0}}),
        "A permanently departed player cannot reconnect into the old arena");
  check(rooms.command(a, wire::Ready{true}, {}) && rooms.room(a) != rooms.room(b),
        "The departing player can start a separate new match");
  rooms.command(a, wire::Leave{}, {});
  rooms.command(b, wire::Leave{}, {});
  check(rooms.rooms().empty(), "The last departure removes the old arena room");
}

void public_squads() {
  using namespace wave;
  app::RoomManager rooms(fixtures::wire_fixture_rules());
  auto& a = rooms.admit("", 1);
  auto& b = rooms.admit("", 2);
  auto& desert = rooms.admit("", 3, sim::Biome::desert);
  check(rooms.command(a, wire::CreateSquad{true}, {}), "New creates a private squad");
  const auto code = a.room;
  check(rooms.command(b, wire::FindPublicSquad{}, {}) && b.room != code &&
            !rooms.room(b)->private_room,
        "Find Public skips private squads and creates a public fallback");
  check(rooms.command(desert, wire::FindPublicSquad{}, {}) &&
            rooms.room(desert)->biome == sim::Biome::desert && desert.room != b.room &&
            !rooms.command(desert, wire::JoinSquad{code}, {}),
        "Public search and invites cannot mix biomes");
  check(rooms.command(desert, wire::Ready{true}, {}) &&
            rooms.room(desert)->match->view().biome == sim::Biome::desert,
        "A room in another biome starts with its own scenario rules");
  check(rooms.command(a, wire::SetSquadPublic{true}, {}) && a.room == code &&
            !rooms.room(a)->private_room,
        "Public toggles the existing squad without changing its invitation");
  check(rooms.command(b, wire::FindPublicSquad{}, {}) && rooms.room(a) == rooms.room(b),
        "Find Public joins the existing open squad");
  auto& c = rooms.admit("", 4);
  check(rooms.command(c, wire::FindPublicSquad{}, {}) && c.room != code,
        "Find Public skips a full squad");
  check(rooms.command(b, wire::Ready{true}, {}) && !rooms.room(a)->match,
        "One ready player cannot start the public match");
  rooms.disconnect(b.token, 2);
  check(b.room.empty() && !b.ready && rooms.room(a)->members.size() == 1,
        "A disconnected lobby member releases the seat and Ready state");
  check(rooms.command(c, wire::FindPublicSquad{}, {}) && c.room == code,
        "The public search can fill the released seat");
  check(rooms.command(a, wire::Ready{true}, {}) && rooms.command(c, wire::Ready{true}, {}) &&
            rooms.room(a)->match,
        "All connected members can start the public match");
  auto& d = rooms.admit("", 5);
  check(rooms.command(d, wire::FindPublicSquad{}, {}) && d.room != code,
        "Find Public skips a started match");
}

void abandoned_room_capacity() {
  using namespace wave;
  app::RoomManager rooms(fixtures::wire_fixture_rules());
  for (unsigned i = 0; i < 40; ++i) {
    auto& member = rooms.admit("", i + 1);
    check(rooms.command(member, wire::Ready{true}, {}) && rooms.room(member)->match,
          "Solo Ready still starts after more than 32 disconnected sessions");
    rooms.step();
    rooms.disconnect(member.token, i + 1);
    rooms.step();
    check(rooms.room(member)->match->view().phase == sim::Phase::ended,
          "The existing last-disconnect rule ends the abandoned match");
    check(rooms.rooms().size() <= 32, "Reclamation keeps the original room capacity");
  }
  auto& a = rooms.admit("", 100);
  auto& b = rooms.admit("", 101);
  check(rooms.command(a, wire::CreateSquad{true}, {}) &&
            rooms.command(b, wire::JoinSquad{a.room}, {}) &&
            rooms.command(a, wire::Ready{true}, {}) && rooms.command(b, wire::Ready{true}, {}) &&
            rooms.room(a)->match,
        "Squad Ready can use a reclaimed room slot too");
  const auto code = a.room;
  const auto token = a.token;
  rooms.step();
  rooms.disconnect(token, 100);
  rooms.step();
  auto& returning = rooms.admit(token, 102);
  check(returning.room == code && rooms.room(returning) == rooms.room(b),
        "A disconnected teammate still returns to the survivor's active match");
}

void full_room_ready_denial() {
  using namespace wave;
  app::RoomManager rooms(fixtures::wire_fixture_rules());
  for (unsigned i = 0; i < 32; ++i) {
    auto& member = rooms.admit("", i + 1);
    check(rooms.command(member, wire::CreateSquad{true}, {}), "Fill occupied lobby capacity");
  }
  wire::Bytes hello{48};
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  hello.insert(hello.end(), build.begin(), build.end());
  hello.insert(hello.end(), 2, 0);
  app::ClientSession session(rooms, 100);
  check(!session.receive(hello).close, "A full room list still permits profile admission");
  // Synthetic encrypted Identify + Ready, using the original command layouts.
  const auto denied = session.receive(
      bytes("051eab7a7d17e38419fb200e2d654423c8af427c8d4a917c51d5160604a5305eaa2a9cecf653"));
  check(denied.close && denied.frames.back() == wire::Bytes{0, 0},
        "Denied Ready explicitly opens reconnect instead of leaving native UI waiting forever");
  check(rooms.rooms().size() == 32,
        "Capacity recovery never evicts a connected lobby or raises the room limit");
}
}  // namespace

int main() {
  using namespace wave;
  squad_departure();
  abandoned_room_capacity();
  full_room_ready_denial();
  auto rules = fixtures::wire_fixture_rules();
  for (auto& wave : rules.waves) {
    wave.deadline = 100;
  }
  app::RoomManager rooms(rules, 20221030, {{sim::Petal::rose}, {sim::Petal::basic}});
  auto& a = rooms.admit("", 1);
  auto& b = rooms.admit("", 2);
  check(a.id != b.id && a.token != b.token, "Independent guest identities");
  check(rooms.command(a, wire::Nickname{"Wave A"}, {}), "Nickname action");
  check(rooms.command(a, wire::CreateSquad{true}, {}), "Create private room");
  const auto room_code = a.room;
  check(!rooms.command(b, wire::JoinSquad{"missing"}, {}), "Unknown invite denied");
  check(rooms.command(b, wire::JoinSquad{room_code}, {}), "Join by original room code");
  auto& c = rooms.admit("", 3);
  check(!rooms.command(c, wire::JoinSquad{room_code}, {}), "Local two-seat capacity");
  check(rooms.command(a, wire::Ready{true}, {}), "First ready");
  check(!rooms.room(a)->match, "First player cannot start an unready two-person room");
  check(rooms.command(b, wire::Ready{true}, {}), "Second ready starts shared match");
  check(rooms.command(b, wire::JoinSquad{room_code}, {}), "Repeated join cannot duplicate seat");
  check(rooms.room(a) == rooms.room(b), "One shared room object");
  wire::WorldProjection projection;
  rooms.step();
  auto view = rooms.room(a)->match->view();
  check(view.next_tick == 1 && view.wave.counts.spawned == 2 && view.wave.counts.pending == 4,
        "One room update, first spawn batch only");
  const auto life = player(view, a.id).life;
  const auto match = view.id;
  check(rooms.command(a, wire::Ready{false}, {}) && !a.ready && b.ready,
        "Native post-spawn Ready clear is acknowledged independently for each member");
  check(rooms.command(b, wire::Ready{false}, {}) && !b.ready,
        "Both clients can finish their Ready transition after the match starts");
  check(rooms.command(a, wire::Ready{false}, {}) && a.room == room_code &&
            rooms.room(a) == rooms.room(b) && rooms.room(a)->match->view().id == match &&
            player(rooms.room(a)->match->view(), a.id).life == life,
        "Repeated Ready clear preserves the running squad and current life");
  const auto initial = projection.build(rooms, a);
  check(initial.control == life && !initial.records.empty(), "Authoritative local life projected");
  check(!rooms.command(a, wire::Move{0, 0, 100}, {}),
        "Input requires a consumed life snapshot ACK");
  auto target = *std::ranges::find(view.entities, sim::Group::main_mob, &sim::EntityView::group);
  for (unsigned i = 0; i < 50 && player(view, a.id).state == sim::LifeState::alive; ++i) {
    const auto body =
        std::ranges::find(view.entities, *player(view, a.id).body, &sim::EntityView::id);
    check(body != view.entities.end(), "Live body exists");
    const auto delta = target.position - body->position;
    check(rooms.command(a, wire::Move{0, float(std::atan2(delta.y, delta.x)), 100}, life),
          "Current-life original movement admitted");
    rooms.step();
    view = rooms.room(a)->match->view();
  }
  check(player(view, a.id).state == sim::LifeState::waiting, "W1 contact damage kills A");
  check(player(view, b.id).state == sim::LifeState::alive, "B survives independently");
  const auto dead = projection.build(rooms, a);
  check(!dead.control && dead.removed.empty(), "Death clears control while retaining native fade");
  check(!dead.commands.empty(), "Damage journal survives simulation ticks until socket publishes");
  check(projection.build(rooms, a).commands.empty(), "Each socket emits a damage event only once");
  wire::WorldProjection reconnected;
  check(reconnected.build(rooms, b).commands.empty(), "Reconnect does not replay old damage");
  const auto expired =
      projection.build(rooms, a, std::chrono::steady_clock::now() + std::chrono::milliseconds(500));
  check(!expired.removed.empty(), "Faded entities expire and release their handles");
  check(!rooms.command(a, wire::Move{0, 0, 100}, life), "Old life rejected while waiting");
  check(rooms.command(a, wire::Continue{}, {}) && a.room == room_code &&
            rooms.room(a) == rooms.room(b),
        "Death Continue keeps the fallen player in the active squad");
  rooms.step();
  view = rooms.room(a)->match->view();
  check(player(view, a.id).connected && player(view, a.id).state == sim::LifeState::waiting,
        "Death Continue preserves the connected player for revival");
  while (view.wave.number == 1 || view.phase == sim::Phase::waiting) {
    rooms.step();
    view = rooms.room(a)->match->view();
  }
  const auto next_life = player(view, a.id).life;
  check(next_life.generation > life.generation, "Next wave creates a new life generation");
  check(!rooms.command(a, wire::Move{0, 0, 100}, life),
        "Stale input cannot control a respawned body");
  check(rooms.command(a, wire::Move{0, 0, 0}, next_life),
        "Fresh acknowledged life regains control");
  const auto reborn = projection.build(rooms, a);
  check(reborn.control == next_life, "Respawn profile carries the new controlling reference");
  check(rooms.command(a, wire::Continue{}, {}) && a.room == room_code,
        "A delayed death Continue cannot remove a revived teammate");
  const auto id = b.id;
  const auto token = b.token;
  rooms.disconnect(token, 2);
  rooms.step();
  check(!player(rooms.room(a)->match->view(), id).connected,
        "Disconnect reaches the match exactly once");
  auto& resumed = rooms.admit(token, 4);
  check(resumed.id == id && resumed.room == room_code,
        "Reconnect restores room and player identity");
  check(!rooms.active(token, 2) && rooms.active(token, 4), "Old socket loses identity ownership");
  rooms.disconnect(token, 2);
  rooms.step();
  check(player(rooms.room(a)->match->view(), id).connected,
        "Old socket teardown cannot disconnect replacement");
  const auto first_tick = rooms.room(a)->match->view().next_tick;
  check(rooms.command(c, wire::CreateSquad{true}, {}) && rooms.command(c, wire::Ready{true}, {}),
        "Second isolated room starts");
  rooms.step();
  check(rooms.room(a)->match->view().next_tick == first_tick + 1 &&
            rooms.room(c)->match->view().next_tick == 1,
        "Each room advances once on the host clock");
  check(rooms.room(a)->match->view().id != rooms.room(c)->match->view().id,
        "Distinct authoritative match identities");
  for (unsigned i = 0; i < 1000 && rooms.room(c)->match->view().phase != sim::Phase::ended; ++i) {
    rooms.step();
  }
  check(rooms.room(c)->match->view().phase == sim::Phase::ended,
        "Solo match reaches terminal settlement");
  check(rooms.command(c, wire::Continue{}, {}) && c.room.empty(),
        "Death Continue leaves a finished match");
  session_life_boundary();
  orbit_buttons();
  public_squads();
  leech_wave_count();
  std::cout
      << "W2 rooms, batched spawns, life bindings, projection removals, reconnect and isolation passed\n";
}
