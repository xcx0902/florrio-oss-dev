#include "app/garden_session.hpp"
#include "scenarios/garden-w2.hpp"

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
  auto rules = sim::garden_rules();
  rules.progressive_waves = false;
  rules.special_chance = 0;
  rules.remaining_threshold = 0;
  rules.waves = {{1, {sim::Mob::leech}, sim::Rarity::common, 1, {{0, 1}}, 200}};
  app::Garden garden(rules);
  auto& member = garden.admit("", 1);
  check(garden.command(member, wire::Ready{true}, {}), "Leech count fixture starts");
  garden.step();
  const auto view = garden.room(member)->match->view();
  check(view.population[static_cast<unsigned>(sim::Group::segment)] == 5,
        "The Leech still has all five body sections in the world");
  const auto snapshot = wire::GardenProjection{}.build(garden, member);
  // The last record ends in 216 mob counts (each a single byte here) and spawn progress.
  constexpr std::size_t entries = 216;
  check(snapshot.records.size() >= entries + 1, "Wave count record is present");
  const auto counts = std::span(snapshot.records).last(entries + 1).first(entries);
  check(counts[34 * 6] == 1 && std::ranges::count(counts, 0) == entries - 1,
        "The wave HUD counts the whole Common Leech once, at client mob ID 34");
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
  const auto displaced = session.publish();
  check(displaced.close && displaced.reason == app::CloseReason::superseded &&
            displaced.frames.empty() && garden.active(member.token, 3),
        "A replaced socket closes without a forced reload or affecting its replacement");
}

void orbit_buttons() {
  using namespace wave;
  auto rules = fixtures::wire_garden_rules();
  rules.lifecycle.end_on_last_disconnect = false;
  app::Garden garden(rules);
  auto& member = garden.admit("", 1);
  check(garden.command(member, wire::Ready{true}, {}), "Solo orbit fixture ready");
  garden.step();
  const auto life = garden.room(member)->match->view().players.front().life;
  const auto distance = [&] {
    const auto view = garden.room(member)->match->view();
    const auto body = std::ranges::find(view.entities, sim::Group::player, &sim::EntityView::group);
    const auto petal = std::ranges::find(view.entities, sim::Group::petal, &sim::EntityView::group);
    check(body != view.entities.end() && petal != view.entities.end(), "Live orbit entities");
    return (petal->position - body->position).length();
  };
  for (const auto& [buttons, multiplier] :
       std::vector<std::pair<unsigned, double>>{{0, 1}, {1, 1.8}, {2, 0.6}, {3, 0.6}, {256, 1}}) {
    check(garden.command(member, wire::Move{buttons, 0, 0}, life), "Orbit button input accepted");
    garden.step();
    check(std::abs(distance() - rules.orbit_radius * multiplier) < 1e-8,
          "Attack/defend changes authoritative collision orbit; other bits do not");
  }
  garden.command(member, wire::Move{1, 0, 0}, life);
  garden.step();
  garden.disconnect(member.token, 1);
  garden.step();
  check(std::abs(distance() - rules.orbit_radius) < 1e-8, "Disconnect clears held orbit mode");
}

void squad_departure() {
  using namespace wave;
  auto rules = fixtures::wire_garden_rules();
  app::Garden garden(rules);
  auto& a = garden.admit("", 1);
  auto& b = garden.admit("", 2);
  check(garden.command(a, wire::CreateSquad{true}, {}) &&
            garden.command(b, wire::JoinSquad{a.room}, {}) &&
            garden.command(a, wire::Ready{true}, {}) &&
            garden.command(b, wire::Ready{true}, {}), "Departure fixture starts a squad");
  garden.step();
  const auto before = garden.room(a)->match->view();
  const auto old_life = player(before, a.id).life;
  const auto survivor = player(before, b.id);
  // Socket loss must retain the same flower for a subsequent reconnect.
  garden.disconnect(a.token, 1);
  garden.step();
  check(player(garden.room(b)->match->view(), a.id).body == player(before, a.id).body,
        "Temporary disconnect retains the flower in its arena");
  garden.admit(a.token, 3);
  garden.step();
  auto& match = *garden.room(b)->match;
  check(garden.command(a, wire::Leave{}, {}), "Abandon releases the member's room");
  check(!garden.room(a) && garden.room(b)->members.size() == 1,
        "Only the departing member loses its squad seat");
  // These were valid when queued but must not dereference a departed player.
  check(match.queue(sim::Departure{a.id}) && match.queue(sim::Connection{a.id, true}) &&
            match.queue(sim::Input{old_life, {1, 0}}) &&
            match.queue(sim::Equip{old_life, {sim::Petal::basic}, {}}),
        "Delayed commands can share the departure tick");
  garden.step();
  const auto after = match.view();
  check(after.id == before.id && after.phase != sim::Phase::ended && after.players.size() == 1 &&
            player(after, b.id).life == survivor.life && player(after, b.id).body == survivor.body,
        "The surviving teammate continues the original match and life");
  check(std::ranges::none_of(after.entities, [&](const auto& entity) {
          return entity.owner && entity.owner->player == a.id;
        }), "Abandon removes the flower and every entity owned by the departing life");
  check(!match.queue(sim::Connection{a.id, true}) && !match.queue(sim::Input{old_life, {1, 0}}),
        "A permanently departed player cannot reconnect into the old arena");
  check(garden.command(a, wire::Ready{true}, {}) && garden.room(a) != garden.room(b),
        "The departing player can start a separate new match");
  garden.command(a, wire::Leave{}, {});
  garden.command(b, wire::Leave{}, {});
  check(garden.rooms().empty(), "The last departure removes the old arena room");
}

void public_squads() {
  using namespace wave;
  app::Garden garden(fixtures::wire_garden_rules());
  auto& a = garden.admit("", 1);
  auto& b = garden.admit("", 2);
  auto& desert = garden.admit("", 3, sim::Biome::desert);
  check(garden.command(a, wire::CreateSquad{true}, {}), "New creates a private squad");
  const auto code = a.room;
  check(garden.command(b, wire::FindPublicSquad{}, {}) && b.room != code &&
            !garden.room(b)->private_room,
        "Find Public skips private squads and creates a public fallback");
  check(garden.command(desert, wire::FindPublicSquad{}, {}) &&
            garden.room(desert)->biome == sim::Biome::desert && desert.room != b.room &&
            !garden.command(desert, wire::JoinSquad{code}, {}),
        "Public search and invites cannot mix biomes");
  check(garden.command(a, wire::SetSquadPublic{true}, {}) && a.room == code &&
            !garden.room(a)->private_room,
        "Public toggles the existing squad without changing its invitation");
  check(garden.command(b, wire::FindPublicSquad{}, {}) && garden.room(a) == garden.room(b),
        "Find Public joins the existing open squad");
  auto& c = garden.admit("", 4);
  check(garden.command(c, wire::FindPublicSquad{}, {}) && c.room != code,
        "Find Public skips a full squad");
  check(garden.command(b, wire::Ready{true}, {}) && !garden.room(a)->match,
        "One ready player cannot start the public match");
  garden.disconnect(b.token, 2);
  check(b.room.empty() && !b.ready && garden.room(a)->members.size() == 1,
        "A disconnected lobby member releases the seat and Ready state");
  check(garden.command(c, wire::FindPublicSquad{}, {}) && c.room == code,
        "The public search can fill the released seat");
  check(garden.command(a, wire::Ready{true}, {}) && garden.command(c, wire::Ready{true}, {}) &&
            garden.room(a)->match,
        "All connected members can start the public match");
  auto& d = garden.admit("", 5);
  check(garden.command(d, wire::FindPublicSquad{}, {}) && d.room != code,
        "Find Public skips a started match");
}

void abandoned_room_capacity() {
  using namespace wave;
  app::Garden garden(fixtures::wire_garden_rules());
  for (unsigned i = 0; i < 40; ++i) {
    auto& member = garden.admit("", i + 1);
    check(garden.command(member, wire::Ready{true}, {}) && garden.room(member)->match,
          "Solo Ready still starts after more than 32 disconnected sessions");
    garden.step();
    garden.disconnect(member.token, i + 1);
    garden.step();
    check(garden.room(member)->match->view().phase == sim::Phase::ended,
          "The existing last-disconnect rule ends the abandoned match");
    check(garden.rooms().size() <= 32, "Reclamation keeps the original room capacity");
  }
  auto& a = garden.admit("", 100);
  auto& b = garden.admit("", 101);
  check(garden.command(a, wire::CreateSquad{true}, {}) &&
            garden.command(b, wire::JoinSquad{a.room}, {}) &&
            garden.command(a, wire::Ready{true}, {}) &&
            garden.command(b, wire::Ready{true}, {}) && garden.room(a)->match,
        "Squad Ready can use a reclaimed room slot too");
  const auto code = a.room;
  const auto token = a.token;
  garden.step();
  garden.disconnect(token, 100);
  garden.step();
  auto& returning = garden.admit(token, 102);
  check(returning.room == code && garden.room(returning) == garden.room(b),
        "A disconnected teammate still returns to the survivor's active match");
}

void full_room_ready_denial() {
  using namespace wave;
  app::Garden garden(fixtures::wire_garden_rules());
  for (unsigned i = 0; i < 32; ++i) {
    auto& member = garden.admit("", i + 1);
    check(garden.command(member, wire::CreateSquad{true}, {}), "Fill occupied lobby capacity");
  }
  wire::Bytes hello{48};
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  hello.insert(hello.end(), build.begin(), build.end());
  hello.insert(hello.end(), 2, 0);
  app::GardenSession session(garden, 100);
  check(!session.receive(hello).close, "A full room list still permits profile admission");
  // Synthetic encrypted Identify + Ready, using the original command layouts.
  const auto denied = session.receive(bytes(
      "051eab7a7d17e38419fb200e2d654423c8af427c8d4a917c51d5160604a5305eaa2a9cecf653"));
  check(denied.close && denied.frames.back() == wire::Bytes{0, 0},
        "Denied Ready explicitly opens reconnect instead of leaving native UI waiting forever");
  check(garden.rooms().size() == 32,
        "Capacity recovery never evicts a connected lobby or raises the room limit");
}
}  // namespace

int main() {
  using namespace wave;
  squad_departure();
  abandoned_room_capacity();
  full_room_ready_denial();
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
  const auto match = view.id;
  check(garden.command(a, wire::Ready{false}, {}) && !a.ready && b.ready,
        "Native post-spawn Ready clear is acknowledged independently for each member");
  check(garden.command(b, wire::Ready{false}, {}) && !b.ready,
        "Both clients can finish their Ready transition after the match starts");
  check(garden.command(a, wire::Ready{false}, {}) && a.room == room_code &&
            garden.room(a) == garden.room(b) && garden.room(a)->match->view().id == match &&
            player(garden.room(a)->match->view(), a.id).life == life,
        "Repeated Ready clear preserves the running squad and current life");
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
  check(!dead.control && dead.removed.empty(), "Death clears control while retaining native fade");
  check(!dead.commands.empty(), "Damage journal survives simulation ticks until socket publishes");
  check(projection.build(garden, a).commands.empty(), "Each socket emits a damage event only once");
  wire::GardenProjection reconnected;
  check(reconnected.build(garden, b).commands.empty(), "Reconnect does not replay old damage");
  const auto expired = projection.build(
      garden, a, std::chrono::steady_clock::now() + std::chrono::milliseconds(500));
  check(!expired.removed.empty(), "Faded entities expire and release their handles");
  check(!garden.command(a, wire::Move{0, 0, 100}, life), "Old life rejected while waiting");
  check(garden.command(a, wire::Continue{}, {}) && a.room == room_code &&
            garden.room(a) == garden.room(b),
        "Death Continue keeps the fallen player in the active squad");
  garden.step();
  view = garden.room(a)->match->view();
  check(player(view, a.id).connected && player(view, a.id).state == sim::LifeState::waiting,
        "Death Continue preserves the connected player for revival");
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
  check(garden.command(a, wire::Continue{}, {}) && a.room == room_code,
        "A delayed death Continue cannot remove a revived teammate");
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
  for (unsigned i = 0; i < 1000 && garden.room(c)->match->view().phase != sim::Phase::ended; ++i) {
    garden.step();
  }
  check(garden.room(c)->match->view().phase == sim::Phase::ended,
        "Solo match reaches terminal settlement");
  check(garden.command(c, wire::Continue{}, {}) && c.room.empty(),
        "Death Continue leaves a finished match");
  session_life_boundary();
  orbit_buttons();
  public_squads();
  leech_wave_count();
  std::cout
      << "W2 rooms, batched spawns, life bindings, projection removals, reconnect and isolation passed\n";
}
