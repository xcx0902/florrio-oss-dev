#include "sim/match.hpp"
#include "../scenarios/short_match.hpp"

#include <iostream>
#include <limits>
#include <source_location>
#include <string_view>

namespace wave::sim {

// Set up precise authoritative collisions/effects without adding debug commands to the host API.
struct FixtureAccess {
  static EntityId spawn(Match& match, Group group, Faction faction, Vec2 position, BodyRules body,
                        std::optional<LifeId> owner = {}) {
    if (group == Group::main_mob || group == Group::player || group == Group::petal) {
      throw std::logic_error("fixture can only insert auxiliary actors");
    }
    EntityView entity;
    entity.group = group;
    entity.faction = faction;
    entity.position = position;
    entity.owner = owner;
    return match.add_entity(entity, body);
  }

  static void hit(Match& match, EntityId target, DamageSource source, double amount = 100,
                  HealthKind kind = HealthKind::contact) {
    match.impacts_.push_back({target, source, kind, amount});
  }

  static void shove(Match& match, EntityId entity, Vec2 velocity) {
    match.entities_.get(entity)->knockback += velocity;
  }
};

namespace {

constexpr PlayerId a{1};
constexpr PlayerId b{2};

void check(bool ok, std::string_view message,
           std::source_location location = std::source_location::current()) {
  if (!ok) {
    throw std::runtime_error(std::string(message) + " at line " + std::to_string(location.line()));
  }
}

template <typename T>
auto events_of(const Match& match) {
  std::vector<T> events;
  for (const auto& event : match.events()) {
    if (const auto* entry = std::get_if<T>(&event.data)) {
      events.push_back(*entry);
    }
  }
  return events;
}

void setup(Match& match, bool teammate = false) {
  check(match.add_player(a, {-20, 0}, {}), "admit A");
  if (teammate) {
    check(match.add_player(b, {20, 0}, {}), "admit B");
  }
}

void step(Match& match) {
  check(match.step(), "step a running match");
}

void through(Match& match, Tick tick) {
  while (match.view().next_tick <= tick) {
    step(match);
  }
}

PlayerView participant(const Match& match, PlayerId player = a) {
  const auto view = match.view();
  const auto found = std::ranges::find(view.players, player, &PlayerView::id);
  check(found != view.players.end(), "registered player");
  return *found;
}

std::optional<EntityView> entity(const Match& match, EntityId id) {
  const auto view = match.view();
  const auto found = std::ranges::find(view.entities, id, &EntityView::id);
  return found == view.entities.end() ? std::nullopt : std::optional{*found};
}

DamageSource team(const Match& match, PlayerId player = a) {
  const auto entry = participant(match, player);
  return {entry.body.value(), entry.life, Faction::team};
}

void defeat_mobs(Match& match, std::size_t count, PlayerId by = a) {
  const auto view = match.view();
  for (const auto& body : view.entities) {
    if (body.group == Group::main_mob && count != 0) {
      FixtureAccess::hit(match, body.id, team(match, by));
      --count;
    }
  }
  check(count == 0, "requested main mobs exist");
}

void kill_player(Match& match, PlayerId id) {
  FixtureAccess::hit(match, participant(match, id).body.value(), DamageSource{});
}

void expect_transition(const Match& match, TransitionReason reason, bool advancing) {
  const auto transitions = events_of<Transition>(match);
  check(transitions.size() == 1 && transitions.front().reason == reason &&
            transitions.front().to.has_value() == advancing,
        "exactly one expected transition");
}

void batches() {
  auto rules = fixtures::short_match_rules();
  const auto locked_version = rules.version;
  Match match({1}, 123, rules);
  rules.version = "changed-outside-match";
  rules.waves[0].batches[1].offset = 2;
  setup(match);
  step(match);
  check(match.view().wave.counts.spawned == 2 && match.view().wave.rules_version == locked_version,
        "first batch at S uses the match-owned rule version");
  defeat_mobs(match, 2);
  through(match, 2);
  const auto before = match.view();
  check(before.phase == Phase::spawning && before.wave.number == 1 &&
            before.wave.counts.alive == 0 && before.wave.counts.pending == 4,
        "empty first batch cannot advance with a future batch");
  check(!before.wave.spawn_complete_tick, "Clearing timer cannot start between spawn batches");
  step(match);
  const auto wave = match.view().previous_wave.value();
  check(wave.counts.spawned == 6 && wave.counts.defeated == 2, "both batches accounted");
  check(wave.spawn_complete_tick == 3 && !match.view().wave.spawn_complete_tick,
        "Actual last spawn starts clearing, and the next wave resets its timer");
  for (std::size_t index = 0; index < wave.plan.size(); ++index) {
    const Tick expected = index < 2 ? 0 : 3;
    check(wave.plan[index].due_tick == expected && wave.plan[index].actual_tick == expected,
          "plan and actual spawn ticks match S and S+3");
  }
  expect_transition(match, TransitionReason::threshold, true);
}

void threshold() {
  for (const Tick kill_at : {Tick{9}, Tick{10}}) {
    Match match({1}, 321, fixtures::short_match_rules());
    setup(match);
    through(match, 3);
    defeat_mobs(match, 1);
    through(match, kill_at - 1);
    check(match.view().phase == Phase::clearing && match.view().wave.counts.alive == 5 &&
              events_of<Transition>(match).empty(),
          "five main mobs wait");
    for (const Group group : {Group::segment, Group::summon, Group::ant_hole}) {
      const auto id = FixtureAccess::spawn(match, group, Faction::hostile, {0, 0}, {});
      FixtureAccess::hit(match, id, team(match));
    }
    defeat_mobs(match, 1);
    step(match);
    expect_transition(match, TransitionReason::threshold, true);
    check(participant(match).credited_defeats == 2 &&
              match.view().previous_wave->counts.defeated == 2,
          "excluded groups do not count or earn main-wave credit");
  }

  Match deadline({2}, 321, fixtures::short_match_rules());
  setup(deadline);
  through(deadline, 3);
  defeat_mobs(deadline, 1);
  through(deadline, 10);
  expect_transition(deadline, TransitionReason::deadline, true);
  check(deadline.view().previous_wave->counts.discarded == 5,
        "deadline can advance with five alive");

  auto rules = fixtures::short_match_rules();
  rules.advance_on_deadline = false;
  Match no_timeout({3}, 321, rules);
  setup(no_timeout);
  through(no_timeout, 10);
  check(no_timeout.view().phase == Phase::clearing && events_of<Transition>(no_timeout).empty(),
        "scenario can disable deadline advancement");
}

void blocked() {
  for (const auto limit : {2U, 100U}) {
    auto rules = fixtures::short_match_rules();
    rules.spawn_attempts = limit;
    rules.spawn_points = {{}};
    Match match({1}, 987, rules);
    check(match.add_player(a, {}, {}), "occupy the only spawn point");
    through(match, limit == 2 ? 4 : 10);
    const auto previous = match.view().previous_wave.value();
    const auto counts = previous.counts;
    check(counts.exhausted == 6 && counts.pending == 0 && counts.spawned == 0 &&
              counts.defeated == 0 && participant(match).credited_defeats == 0,
          "blocked batches settle without false defeats or credits");
    check(previous.spawn_complete_tick == (limit == 2 ? 4U : 10U),
          "Blocked spawn attempts delay clearing until they actually settle");
    for (const auto& entry : previous.plan) {
      check(entry.attempts > 0 && entry.attempts <= limit && !entry.actual_tick,
            "bounded attempts and no false spawn");
    }
    const auto events = events_of<SpawnEvent>(match);
    check(events.size() == (limit == 2 ? 4U : 6U), "each outstanding spawn settles");
    for (const auto& event : events) {
      check(event.failure == (limit == 2 ? SpawnFailure::attempt_limit : SpawnFailure::deadline),
            "record why the blocked slot exhausted");
    }
  }

  auto rules = fixtures::short_match_rules();
  rules.spawn_points = {{}};
  rules.player.speed_per_second = 1000;
  Match retry({2}, 987, rules);
  check(retry.add_player(a, {}, {}), "occupy the retry point");
  step(retry);
  check(retry.queue(Input{participant(retry).life, {1, 0}}), "move away from the point");
  through(retry, 2);
  const auto recovered = retry.view().wave.plan.front();
  check(recovered.due_tick == 0 && recovered.actual_tick == 2 && recovered.attempts == 3,
        "a delayed slot can spawn after its blocker moves");

  for (const auto policy : {ResidualPolicy::keep, ResidualPolicy::discard}) {
    auto residual_rules = fixtures::short_match_rules();
    residual_rules.residual = policy;
    Match match({3}, 987, residual_rules);
    setup(match);
    through(match, 3);
    defeat_mobs(match, 2);
    step(match);
    const auto view = match.view();
    const auto counts = view.previous_wave->counts;
    const auto residuals = view.population[static_cast<std::size_t>(Group::residual)];
    if (policy == ResidualPolicy::keep) {
      check(counts.carried == 4 && residuals == 4, "retag survivors as residuals");
      for (const auto& entity : view.entities) {
        if (entity.group == Group::residual) {
          FixtureAccess::hit(match, entity.id, team(match));
        }
      }
      step(match);
      check(match.view().wave.counts.defeated == 0 && participant(match).credited_defeats == 6,
            "residuals award defeat credit without counting as next wave defeats");
    } else {
      check(counts.discarded == 4 && residuals == 0, "discard survivors without recording defeats");
    }
  }
}

void lives() {
  Match match({1}, 151, fixtures::short_match_rules());
  check(match.add_player(a, {-20, 0}, {Petal::rose}), "admit A with equipment");
  check(match.add_player(b, {20, 0}, {}), "admit B");
  step(match);
  const auto old = participant(match);
  const auto old_petal = old.petals.front().entity.value();
  check(match.queue(Input{old.life, {1, 0}}), "accept first-life movement");
  kill_player(match, a);
  step(match);
  const auto waiting = participant(match);
  check(waiting.state == LifeState::waiting && waiting.life == old.life && !waiting.body &&
            waiting.loadout == old.loadout && !entity(match, old_petal),
        "death keeps identity and gear and removes body and petals");
  check(!match.queue(Input{old.life, {1, 0}}), "dead life cannot move");
  through(match, 3);
  defeat_mobs(match, 2, b);
  step(match);
  expect_transition(match, TransitionReason::threshold, true);
  check(participant(match).state == LifeState::waiting, "wait until the opening tick");
  step(match);
  const auto fresh = participant(match);
  check(fresh.life.generation == old.life.generation + 1 && fresh.body != old.body &&
            fresh.loadout == old.loadout && !entity(match, *old.body) &&
            fresh.petals.front().entity != old.petals.front().entity,
        "exactly one new body and life with the same gear");
  check(entity(match, *fresh.body)->position == Vec2{-20, 0},
        "old movement does not transfer to the new body");
  check(!match.queue(Input{old.life, {1, 0}}), "reject replayed life after respawn");
  auto foreign_life = fresh.life;
  foreign_life.match = {2};
  check(!match.queue(Input{foreign_life, {1, 0}}), "reject input from another match");
  check(match.queue(Input{fresh.life, {1, 0}}), "new life can move");
  step(match);
  check(participant(match).life == fresh.life && entity(match, *fresh.body)->position.x > -20,
        "new input moves the new body without duplicate respawn");

  Match wipe({2}, 151, fixtures::short_match_rules());
  setup(wipe, true);
  through(wipe, 9);
  defeat_mobs(wipe, 2, b);
  kill_player(wipe, a);
  kill_player(wipe, b);
  step(wipe);
  expect_transition(wipe, TransitionReason::team_wipe, false);
  check(wipe.view().phase == Phase::ended && participant(wipe).state == LifeState::ended &&
            participant(wipe, b).state == LifeState::ended && !wipe.step(),
        "wipe beats threshold and deadline on the same tick and settles once");

  Match early_wipe({3}, 151, fixtures::short_match_rules());
  setup(early_wipe, true);
  step(early_wipe);
  kill_player(early_wipe, a);
  kill_player(early_wipe, b);
  step(early_wipe);
  check(early_wipe.view().wave.counts.cancelled == 4 && early_wipe.view().wave.counts.pending == 0,
        "wipe cancels unresolved future batches");

  Match disconnect({4}, 151, fixtures::short_match_rules());
  setup(disconnect);
  step(disconnect);
  check(disconnect.queue(Connection{a, false}), "queue final disconnect");
  step(disconnect);
  expect_transition(disconnect, TransitionReason::last_disconnect, false);

  auto rules = fixtures::short_match_rules();
  rules.lifecycle.end_on_last_disconnect = false;
  rules.lifecycle.respawn_after_deadline = false;
  Match reconnect({5}, 151, rules);
  setup(reconnect, true);
  step(reconnect);
  const auto before = participant(reconnect);
  check(reconnect.queue(Input{before.life, {1, 0}}) && reconnect.queue(Connection{a, false}) &&
            reconnect.queue(Connection{b, false}),
        "queue movement then disconnect both players");
  step(reconnect);
  check(!participant(reconnect).connected && participant(reconnect).life == before.life &&
            entity(reconnect, *before.body)->position == Vec2{-20, 0},
        "disconnect clears movement while preserving the body by policy");
  check(reconnect.queue(Connection{a, true}) && reconnect.queue(Connection{b, true}),
        "queue reconnections");
  step(reconnect);
  check(participant(reconnect).connected && participant(reconnect).body == before.body,
        "reconnect reattaches the same surviving life");
  kill_player(reconnect, a);
  through(reconnect, 10);
  expect_transition(reconnect, TransitionReason::deadline, true);
  through(reconnect, 14);
  check(participant(reconnect).state == LifeState::waiting, "deadline respawn is configurable");
  defeat_mobs(reconnect, 2, b);
  through(reconnect, 16);
  check(participant(reconnect).life.generation == 2, "later threshold opening respawns A");

  rules.lifecycle.end_on_team_wipe = false;
  Match recover({6}, 151, rules);
  setup(recover, true);
  through(recover, 3);
  defeat_mobs(recover, 2, b);
  kill_player(recover, a);
  kill_player(recover, b);
  step(recover);
  expect_transition(recover, TransitionReason::threshold, true);
  step(recover);
  check(participant(recover).life.generation == 2 && participant(recover, b).life.generation == 2,
        "alternative wipe policy can continue to a legal respawn");
}

void geometry_and_combat() {
  const auto largest = std::numeric_limits<double>::max();
  const auto far = clamp_center({largest, largest}, 100, 2);
  check(far.length() <= 98 && far.x > 60 && far.x == far.y,
        "large finite coordinates clamp along their original direction");
  check(clamp_center({}, 100, 2) == Vec2{} && clamp_center({98, 0}, 100, 2) == Vec2{98, 0} &&
            clamp_center({200, 200}, 100, 2).length() <= 98 &&
            clamp_center({10, 20}, 100, 120) == Vec2{},
        "circular center bounds handle zero, edge, diagonal and oversized bodies");
  check(overlaps({}, 2, {3.999, 0}, 2) && !overlaps({}, 2, {4, 0}, 2),
        "collision uses the sum of the radii with open tangency");
  const Timing timing{Microseconds{25000}, Microseconds{82000}};
  check(timing.ticks_ceil(Microseconds{0}) == 0 && timing.ticks_ceil(Microseconds{25000}) == 1 &&
            timing.ticks_ceil(Microseconds{25001}) == 2 &&
            timing.ticks_ceil(timing.broadcast_interval) == 4,
        "explicit durations round up independently of broadcast cadence");

  auto rules = fixtures::short_match_rules();
  rules.timing = timing;
  rules.player.speed_per_second = 400;
  Match edge({1}, 952, rules);
  check(edge.add_player(a, {93, 0}, {Petal::basic}), "admit near boundary");
  step(edge);
  const auto runner = participant(edge);
  check(!edge.queue(Input{runner.life, {std::numeric_limits<double>::infinity(), 0}}),
        "reject non-finite movement");
  check(edge.queue(Input{runner.life, {1, 0}}), "move outward");
  step(edge);
  check(entity(edge, *runner.body)->position == Vec2{98, 0}, "running clamps at radius minus body");
  check(edge.queue(Input{runner.life, {0, 0}}), "stop running");
  FixtureAccess::shove(edge, *runner.body, {500, 500});
  step(edge);
  const auto pushed = entity(edge, *runner.body).value();
  const auto orbiting = entity(edge, *runner.petals.front().entity)->position;
  check(pushed.position.length() <= 98 && pushed.position.y > 0,
        "diagonal knockback respects the flower's center limit");
  check(orbiting.length() > 99 &&
            std::abs((orbiting - pushed.position).length() - rules.orbit_radius) < 1e-9,
        "the petal keeps its orbit radius outside the circular boundary");
  check(edge.queue(Input{runner.life, {0, -1}}), "turn inward");
  step(edge);
  check(entity(edge, *runner.body)->heading_rad < -1, "movement heading is exposed in radians");

  auto huge_rules = fixtures::short_match_rules();
  huge_rules.player.radius = 120;
  Match huge({2}, 952, huge_rules);
  check(huge.add_player(a, {500, 500}, {}), "admit oversized player");
  step(huge);
  const auto giant = participant(huge);
  FixtureAccess::shove(huge, *giant.body, {500, 0});
  step(huge);
  check(entity(huge, *giant.body)->position == Vec2{}, "oversized bodies stay at the origin");

  rules.player.contact_damage = 3;
  Match contacts({3}, 952, rules);
  check(contacts.add_player(a, {}, {}) && contacts.add_player(b, {}, {}), "overlap teammates");
  step(contacts);
  const auto a_body = participant(contacts).body.value();
  const auto b_body = participant(contacts, b).body.value();
  check(entity(contacts, a_body)->position == Vec2{-2, 0} &&
            entity(contacts, b_body)->position == Vec2{2, 0} &&
            events_of<HealthChange>(contacts).empty(),
        "friendly contact pushes without damage");
  const auto enemy = FixtureAccess::spawn(
      contacts, Group::ant_hole, Faction::hostile, {-3, 0},
      {.radius = 1, .health = 15, .contact_damage = 7, .poison_per_tick = 2, .poison_ticks = 2});
  step(contacts);
  check(entity(contacts, a_body)->health == 13 && entity(contacts, enemy)->health == 12 &&
            entity(contacts, b_body)->health == 20,
        "enemy collision does reciprocal damage");
  FixtureAccess::hit(contacts, enemy, team(contacts));
  step(contacts);
  check(!entity(contacts, enemy) && entity(contacts, a_body)->health == 11, "first poison tick");
  step(contacts);
  const auto poisoned = events_of<HealthChange>(contacts);
  check(poisoned.size() == 1 && poisoned.front().kind == HealthKind::poison &&
            poisoned.front().source.entity == enemy && entity(contacts, a_body)->health == 9,
        "poison retains attribution after its source dies");
  step(contacts);
  check(entity(contacts, a_body)->health == 9, "poison expires after the configured duration");

  Match heals({4}, 952, fixtures::short_match_rules());
  check(heals.add_player(a, {}, {Petal::rose}), "equip a healing petal");
  step(heals);
  const auto healer = participant(heals);
  const auto rose = healer.petals.front().entity.value();
  check(entity(heals, rose)->position == Vec2{4, 0} && entity(heals, rose)->anchor == healer.body,
        "orbit exposes position, life ownership and anchor");
  const BodyRules small{.radius = 1, .health = 20};
  const auto summon =
      FixtureAccess::spawn(heals, Group::summon, Faction::team, {6, 0}, small, healer.life);
  const auto hostile =
      FixtureAccess::spawn(heals, Group::segment, Faction::hostile, {4, 2.5}, small);
  FixtureAccess::hit(heals, summon, DamageSource{}, 8);
  FixtureAccess::hit(heals, hostile, team(heals), 8);
  step(heals);
  step(heals);
  const auto healing = events_of<HealthChange>(heals);
  check(healing.size() == 1 && healing.front().kind == HealthKind::heal &&
            healing.front().source.entity == rose && healing.front().source.owner == healer.life &&
            healing.front().target == summon && entity(heals, summon)->health == 18 &&
            entity(heals, hostile)->health == 12,
        "healing petal heals an allied summon and leaves an enemy untouched");

  Match petal({5}, 952, fixtures::short_match_rules());
  check(petal.add_player(a, {}, {Petal::basic}), "equip an attacking petal");
  step(petal);
  const auto basic = participant(petal).petals.front().entity.value();
  const auto target = FixtureAccess::spawn(petal, Group::ant_hole, Faction::hostile, {4, 0},
                                           {.radius = 1, .health = 20, .contact_damage = 5});
  step(petal);
  check(!entity(petal, basic) && entity(petal, target)->health == 13 &&
            participant(petal).petals.front().reload_ticks == 2,
        "enemy and basic petal trade damage and start reload on petal death");
  FixtureAccess::hit(petal, target, team(petal));
  step(petal);
  check(!entity(petal, target) && !participant(petal).petals.front().entity,
        "reload gates petal recovery after combat ends");
  step(petal);
  const auto new_petal = participant(petal).petals.front().entity;
  check(new_petal && new_petal != basic, "reloaded petal receives a fresh entity generation");

  Match multiple({6}, 952, fixtures::short_match_rules());
  check(multiple.add_player(a, {}, {Petal::basic}), "equip a petal for simultaneous contacts");
  step(multiple);
  const auto stationary = [&](double y) {
    return FixtureAccess::spawn(multiple, Group::summon, Faction::hostile, {4, y},
                                {.radius = 1, .health = 30});
  };
  const auto left = stationary(-1.75), right = stationary(1.75);
  step(multiple);
  check(entity(multiple, left)->health == 23 && entity(multiple, right)->health == 23,
        "one petal damages both overlapping enemies in the same step");
  step(multiple);
  check(entity(multiple, left)->health == 16 && entity(multiple, right)->health == 16,
        "continuing contact damages both enemies again on the next step");
}

void isolation() {
  // Identical IDs let us compare structured state directly. A separate room
  // uses a different match ID and must neither affect nor resolve our entities.
  const auto replay = [](bool interleaved) {
    auto rules = fixtures::short_match_rules();
    rules.special_chance = .75;
    rules.special_groups = {{Mob::ladybug}, {Mob::bee}};
    Match primary({1}, 5489, rules);
    Match other({2}, 52, rules);
    setup(primary, true);
    setup(other);
    std::vector<MatchView> views;
    for (Tick t = 0; t <= 13; ++t) {
      if (interleaved) {
        step(other);
      }
      if (t == 1 || t == 6) {
        defeat_mobs(primary, 2, b);
      }
      if (t == 2) {
        kill_player(primary, a);
      }
      if (t == 5) {
        check(primary.queue(Input{participant(primary).life, {0, 1}}), "queue replay input");
      }
      step(primary);
      if (t == 0 && interleaved) {
        check(!entity(primary, *participant(other).body) &&
                  !entity(other, *participant(primary).body),
              "entity IDs cannot be resolved in another match");
      }
      views.push_back(primary.view());
    }
    return views;
  };

  const auto baseline = replay(false);
  const auto interleaved = replay(true);
  for (std::size_t tick = 0; tick < baseline.size(); ++tick) {
    const auto& a = baseline[tick];
    const auto& b = interleaved[tick];
    check(a.phase == b.phase && a.wave == b.wave && a.previous_wave == b.previous_wave &&
              a.players == b.players && a.entities == b.entities,
          "a seeded replay is reproducible even while another room advances");
  }
}

void special_waves() {
  auto rules = fixtures::short_match_rules();
  rules.special_chance = 1;
  rules.special_groups = {{Mob::ladybug, Mob::spider}, {Mob::hornet}};
  Match match({1}, 330, rules);
  setup(match);
  step(match);
  check(!match.view().wave.special, "opening wave is exempt from special selection");
  defeat_mobs(match, 2);
  through(match, rules.waves.front().batches.back().offset);
  const auto wave = match.view().wave;
  check(wave.number == 2 && wave.special && !wave.plan.empty() &&
            std::ranges::all_of(wave.plan,
                                [](const SpawnSlot& slot) { return slot.mob == Mob::ladybug; }),
        "special waves exclude locked mobs and ignore empty groups");
}

}  // namespace
}  // namespace wave::sim

int main(int argc, char** argv) {
  using namespace wave::sim;
  const std::pair<std::string_view, void (*)()> cases[] = {
      {"batches", batches},
      {"transition", threshold},
      {"blocked-spawn", blocked},
      {"lifecycle", lives},
      {"combat", geometry_and_combat},
      {"isolation", isolation},
      {"special-waves", special_waves},
  };
  const auto test =
      argc == 2 ? std::ranges::find_if(cases, [name = std::string_view(argv[1])](
                                                  const auto& test) { return test.first == name; })
                : std::end(cases);
  if (test == std::end(cases)) {
    std::cerr << "Usage: wave_test_simulation CASE\n";
    return 2;
  }
  try {
    test->second();
  } catch (const std::exception& error) {
    std::cerr << test->first << ": " << error.what() << '\n';
    return 1;
  }
}
