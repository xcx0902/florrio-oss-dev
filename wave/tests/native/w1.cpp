#include "sim/match.hpp"
#include "../scenarios/garden-w1.hpp"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <locale>
#include <source_location>
#include <sstream>
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

template <typename Enum>
int number(Enum value) {
  return static_cast<int>(value);
}

constexpr std::array phases{"waiting", "spawning", "clearing", "ended"};
constexpr std::array life_states{"waiting", "alive", "ended"};
constexpr std::array spawn_states{"pending", "spawned", "exhausted", "cancelled"};
constexpr std::array spawn_outcomes{"spawned", "blocked", "exhausted", "cancelled"};
constexpr std::array spawn_failures{"occupied", "attempt_limit", "deadline"};
constexpr std::array transition_reasons{"threshold", "deadline", "team_wipe", "last_disconnect"};
constexpr std::array health_kinds{"contact", "heal", "poison"};
constexpr std::array draw_purposes{"special_roll", "special_group", "mob_kind", "spawn_point"};
constexpr std::array groups{"player", "petal",    "main_mob", "segment",
                            "summon", "ant_hole", "residual"};

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

class Trace {
 public:
  explicit Trace(std::ostream& output) : out(output) {
    out.imbue(std::locale::classic());
    out << std::setprecision(17);
  }

  void replay(std::string_view normalized) { out << normalized; }

  void record(const Match& match) {
    const auto view = match.view();
    out << "next_tick " << view.next_tick << " seed " << view.seed << " step_us "
        << view.step.count() << " broadcast_us " << view.broadcast_interval.count() << " radius "
        << view.arena_radius << " phase " << phases[number(view.phase)] << '\n';
    for (const auto& event : match.events()) {
      out << "  tick " << event.tick << ' ';
      std::visit([this](const auto& data) { record_event(data); }, event.data);
      out << '\n';
    }
    record_wave(view.wave, "wave");
    if (view.previous_wave) {
      record_wave(*view.previous_wave, "previous_wave");
    }
    for (const auto& player : view.players) {
      out << "  player ";
      life(player.life);
      out << " state " << life_states[number(player.state)] << " connected " << player.connected
          << " body ";
      id(player.body);
      out << " credited " << player.credited_defeats << " loadout";
      for (std::size_t i = 0; i < player.loadout.size(); ++i) {
        out << ' ' << number(player.loadout[i]) << '@';
        id(player.petals[i].entity);
        out << ':' << player.petals[i].reload_ticks;
      }
      out << '\n';
    }
    for (const auto& entity : view.entities) {
      out << "  entity ";
      id(entity.id);
      out << " group " << groups[number(entity.group)] << " faction " << number(entity.faction)
          << " mob " << (entity.mob ? number(*entity.mob) : -1) << " petal "
          << (entity.petal ? number(*entity.petal) : -1) << " rarity " << number(entity.rarity)
          << " origin_wave " << entity.origin_wave << " owner ";
      life(entity.owner);
      out << " anchor ";
      id(entity.anchor);
      out << " position ";
      xy(entity.position);
      out << " velocity ";
      xy(entity.velocity);
      out << " radius " << entity.radius << " heading_rad " << entity.heading_rad << " hp "
          << entity.health << '/' << entity.max_health << " cooldown_ticks "
          << entity.cooldown_ticks << '\n';
    }
  }

 private:
  void record_wave(const WaveView& wave, std::string_view label) {
    const auto& c = wave.counts;
    check(c.planned == c.pending + c.spawned + c.exhausted + c.cancelled &&
              c.spawned == c.alive + c.defeated + c.carried + c.discarded,
          "wave accounting balances");
    out << "  " << label << ' ' << wave.number << " version " << wave.rules_version << " start "
        << wave.start_tick << " deadline " << wave.deadline_tick << " special " << wave.special
        << " planned " << c.planned << " pending " << c.pending << " spawned " << c.spawned
        << " alive " << c.alive << " defeated " << c.defeated << " exhausted " << c.exhausted
        << " cancelled " << c.cancelled << " carried " << c.carried << " discarded " << c.discarded
        << " eligible";
    for (const auto kind : wave.eligible) {
      out << ' ' << number(kind);
    }
    out << '\n';
    for (const auto& slot : wave.plan) {
      out << "    plan batch " << slot.batch << " due " << slot.due_tick << " mob "
          << number(slot.mob) << " rarity " << number(slot.rarity) << " attempts " << slot.attempts
          << " state " << spawn_states[number(slot.state)] << " actual ";
      if (slot.actual_tick) {
        out << *slot.actual_tick;
      } else {
        out << '-';
      }
      out << " entity ";
      id(slot.entity);
      out << '\n';
    }
  }

  // Entity IDs in the trace are normalized to match-local slot:generation.
  void id(std::optional<EntityId> entity) {
    if (entity) {
      out << entity->slot << ':' << entity->generation;
    } else {
      out << '-';
    }
  }

  void life(std::optional<LifeId> owner) {
    if (owner) {
      out << owner->player.value << ':' << owner->generation;
    } else {
      out << '-';
    }
  }

  void xy(Vec2 value) { out << value.x << ',' << value.y; }

  void source(const DamageSource& value) {
    out << " source ";
    id(value.entity);
    out << " owner ";
    life(value.owner);
    out << " faction " << number(value.faction);
  }

  void record_event(const RandomDraw& event) {
    out << "rng " << draw_purposes[number(event.purpose)] << " value " << event.value;
  }

  void record_event(const SpawnEvent& event) {
    out << "spawn wave " << event.wave << " slot " << event.slot << " due " << event.due_tick
        << " attempt " << event.attempt << " outcome " << spawn_outcomes[number(event.outcome)]
        << " failure " << (event.failure ? spawn_failures[number(*event.failure)] : "-")
        << " entity ";
    id(event.entity);
    if (event.position) {
      out << " position ";
      xy(*event.position);
    }
  }

  void record_event(const Transition& event) {
    out << "transition from " << event.from << " to " << event.to.value_or(0) << " reason "
        << transition_reasons[number(event.reason)];
  }

  void record_event(const HealthChange& event) {
    out << "health target ";
    id(event.target);
    source(event.source);
    out << " kind " << health_kinds[number(event.kind)] << " amount " << event.amount
        << " remaining " << event.health_after;
  }

  void record_event(const LifeChange& event) {
    out << "life ";
    life(event.life);
    out << " body ";
    id(event.body);
    out << " state " << life_states[number(event.state)];
  }

  void record_event(const Defeat& event) {
    out << "defeat ";
    id(event.entity);
    source(event.source);
    out << " group " << groups[number(event.group)] << " credit "
        << event.credit.value_or(PlayerId{}).value;
  }

  std::ostream& out;
};

void setup(Match& match, bool teammate = false) {
  check(match.add_player(a, {-20, 0}, {}), "admit A");
  if (teammate) {
    check(match.add_player(b, {20, 0}, {}), "admit B");
  }
}

void step(Match& match, Trace& trace) {
  check(match.step(), "step a running match");
  trace.record(match);
}

void through(Match& match, Tick tick, Trace& trace) {
  while (match.view().next_tick <= tick) {
    step(match, trace);
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

void batches(Trace& trace) {
  auto rules = fixtures::short_garden_rules();
  const auto locked_version = rules.version;
  Match match({1}, 123, rules);
  rules.version = "changed-outside-match";
  rules.waves[0].batches[1].offset = 2;
  setup(match);
  step(match, trace);
  check(match.view().wave.counts.spawned == 2 && match.view().wave.rules_version == locked_version,
        "first batch at S uses the match-owned rule version");
  defeat_mobs(match, 2);
  through(match, 2, trace);
  const auto before = match.view();
  check(before.phase == Phase::spawning && before.wave.number == 1 &&
            before.wave.counts.alive == 0 && before.wave.counts.pending == 4,
        "empty first batch cannot advance with a future batch");
  check(!before.wave.spawn_complete_tick, "Clearing timer cannot start between spawn batches");
  step(match, trace);
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

void threshold(Trace& trace) {
  for (const Tick kill_at : {Tick{9}, Tick{10}}) {
    Match match({1}, 321, fixtures::short_garden_rules());
    setup(match);
    through(match, 3, trace);
    defeat_mobs(match, 1);
    through(match, kill_at - 1, trace);
    check(match.view().phase == Phase::clearing && match.view().wave.counts.alive == 5 &&
              events_of<Transition>(match).empty(),
          "five main mobs wait");
    for (const Group group : {Group::segment, Group::summon, Group::ant_hole}) {
      const auto id = FixtureAccess::spawn(match, group, Faction::garden, {0, 0}, {});
      FixtureAccess::hit(match, id, team(match));
    }
    defeat_mobs(match, 1);
    step(match, trace);
    expect_transition(match, TransitionReason::threshold, true);
    check(participant(match).credited_defeats == 2 &&
              match.view().previous_wave->counts.defeated == 2,
          "excluded groups do not count or earn main-wave credit");
  }

  Match deadline({2}, 321, fixtures::short_garden_rules());
  setup(deadline);
  through(deadline, 3, trace);
  defeat_mobs(deadline, 1);
  through(deadline, 10, trace);
  expect_transition(deadline, TransitionReason::deadline, true);
  check(deadline.view().previous_wave->counts.discarded == 5,
        "deadline can advance with five alive");

  auto rules = fixtures::short_garden_rules();
  rules.advance_on_deadline = false;
  Match no_timeout({3}, 321, rules);
  setup(no_timeout);
  through(no_timeout, 10, trace);
  check(no_timeout.view().phase == Phase::clearing && events_of<Transition>(no_timeout).empty(),
        "scenario can disable deadline advancement");
}

void blocked(Trace& trace) {
  for (const auto limit : {2U, 100U}) {
    auto rules = fixtures::short_garden_rules();
    rules.spawn_attempts = limit;
    rules.spawn_points = {{}};
    Match match({1}, 987, rules);
    check(match.add_player(a, {}, {}), "occupy the only spawn point");
    through(match, limit == 2 ? 4 : 10, trace);
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

  auto rules = fixtures::short_garden_rules();
  rules.spawn_points = {{}};
  rules.player.speed_per_second = 1000;
  Match retry({2}, 987, rules);
  check(retry.add_player(a, {}, {}), "occupy the retry point");
  step(retry, trace);
  check(retry.queue(Input{participant(retry).life, {1, 0}}), "move away from the point");
  through(retry, 2, trace);
  const auto recovered = retry.view().wave.plan.front();
  check(recovered.due_tick == 0 && recovered.actual_tick == 2 && recovered.attempts == 3,
        "a delayed slot can spawn after its blocker moves");

  for (const auto policy : {ResidualPolicy::keep, ResidualPolicy::discard}) {
    auto residual_rules = fixtures::short_garden_rules();
    residual_rules.residual = policy;
    Match match({3}, 987, residual_rules);
    setup(match);
    through(match, 3, trace);
    defeat_mobs(match, 2);
    step(match, trace);
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
      step(match, trace);
      check(match.view().wave.counts.defeated == 0 && participant(match).credited_defeats == 2,
            "residuals are excluded from next wave accounting and credit");
    } else {
      check(counts.discarded == 4 && residuals == 0, "discard survivors without recording defeats");
    }
  }
}

void lives(Trace& trace) {
  Match match({1}, 151, fixtures::short_garden_rules());
  check(match.add_player(a, {-20, 0}, {Petal::rose}), "admit A with equipment");
  check(match.add_player(b, {20, 0}, {}), "admit B");
  step(match, trace);
  const auto old = participant(match);
  const auto old_petal = old.petals.front().entity.value();
  check(match.queue(Input{old.life, {1, 0}}), "accept first-life movement");
  kill_player(match, a);
  step(match, trace);
  const auto waiting = participant(match);
  check(waiting.state == LifeState::waiting && waiting.life == old.life && !waiting.body &&
            waiting.loadout == old.loadout && !entity(match, old_petal),
        "death keeps identity and gear and removes body and petals");
  check(!match.queue(Input{old.life, {1, 0}}), "dead life cannot move");
  through(match, 3, trace);
  defeat_mobs(match, 2, b);
  step(match, trace);
  expect_transition(match, TransitionReason::threshold, true);
  check(participant(match).state == LifeState::waiting, "wait until the opening tick");
  step(match, trace);
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
  step(match, trace);
  check(participant(match).life == fresh.life && entity(match, *fresh.body)->position.x > -20,
        "new input moves the new body without duplicate respawn");

  Match wipe({2}, 151, fixtures::short_garden_rules());
  setup(wipe, true);
  through(wipe, 9, trace);
  defeat_mobs(wipe, 2, b);
  kill_player(wipe, a);
  kill_player(wipe, b);
  step(wipe, trace);
  expect_transition(wipe, TransitionReason::team_wipe, false);
  check(wipe.view().phase == Phase::ended && participant(wipe).state == LifeState::ended &&
            participant(wipe, b).state == LifeState::ended && !wipe.step(),
        "wipe beats threshold and deadline on the same tick and settles once");

  Match early_wipe({3}, 151, fixtures::short_garden_rules());
  setup(early_wipe, true);
  step(early_wipe, trace);
  kill_player(early_wipe, a);
  kill_player(early_wipe, b);
  step(early_wipe, trace);
  check(early_wipe.view().wave.counts.cancelled == 4 && early_wipe.view().wave.counts.pending == 0,
        "wipe cancels unresolved future batches");

  Match disconnect({4}, 151, fixtures::short_garden_rules());
  setup(disconnect);
  step(disconnect, trace);
  check(disconnect.queue(Connection{a, false}), "queue final disconnect");
  step(disconnect, trace);
  expect_transition(disconnect, TransitionReason::last_disconnect, false);

  auto rules = fixtures::short_garden_rules();
  rules.lifecycle.end_on_last_disconnect = false;
  rules.lifecycle.respawn_after_deadline = false;
  Match reconnect({5}, 151, rules);
  setup(reconnect, true);
  step(reconnect, trace);
  const auto before = participant(reconnect);
  check(reconnect.queue(Input{before.life, {1, 0}}) && reconnect.queue(Connection{a, false}) &&
            reconnect.queue(Connection{b, false}),
        "queue movement then disconnect both players");
  step(reconnect, trace);
  check(!participant(reconnect).connected && participant(reconnect).life == before.life &&
            entity(reconnect, *before.body)->position == Vec2{-20, 0},
        "disconnect clears movement while preserving the body by policy");
  check(reconnect.queue(Connection{a, true}) && reconnect.queue(Connection{b, true}),
        "queue reconnections");
  step(reconnect, trace);
  check(participant(reconnect).connected && participant(reconnect).body == before.body,
        "reconnect reattaches the same surviving life");
  kill_player(reconnect, a);
  through(reconnect, 10, trace);
  expect_transition(reconnect, TransitionReason::deadline, true);
  through(reconnect, 14, trace);
  check(participant(reconnect).state == LifeState::waiting, "deadline respawn is configurable");
  defeat_mobs(reconnect, 2, b);
  through(reconnect, 16, trace);
  check(participant(reconnect).life.generation == 2, "later threshold opening respawns A");

  rules.lifecycle.end_on_team_wipe = false;
  Match recover({6}, 151, rules);
  setup(recover, true);
  through(recover, 3, trace);
  defeat_mobs(recover, 2, b);
  kill_player(recover, a);
  kill_player(recover, b);
  step(recover, trace);
  expect_transition(recover, TransitionReason::threshold, true);
  step(recover, trace);
  check(participant(recover).life.generation == 2 && participant(recover, b).life.generation == 2,
        "alternative wipe policy can continue to a legal respawn");
}

void geometry_and_combat(Trace& trace) {
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

  auto rules = fixtures::short_garden_rules();
  rules.timing = timing;
  rules.player.speed_per_second = 400;
  Match edge({1}, 952, rules);
  check(edge.add_player(a, {93, 0}, {Petal::basic}), "admit near boundary");
  step(edge, trace);
  const auto runner = participant(edge);
  check(!edge.queue(Input{runner.life, {std::numeric_limits<double>::infinity(), 0}}),
        "reject non-finite movement");
  check(edge.queue(Input{runner.life, {1, 0}}), "move outward");
  step(edge, trace);
  check(entity(edge, *runner.body)->position == Vec2{98, 0}, "running clamps at radius minus body");
  check(edge.queue(Input{runner.life, {0, 0}}), "stop running");
  FixtureAccess::shove(edge, *runner.body, {500, 500});
  step(edge, trace);
  const auto pushed = entity(edge, *runner.body).value();
  check(pushed.position.length() <= 98 && pushed.position.y > 0 &&
            entity(edge, *runner.petals.front().entity)->position.length() <= 99,
        "diagonal knockback and petal projection respect their own center limits");
  check(edge.queue(Input{runner.life, {0, -1}}), "turn inward");
  step(edge, trace);
  check(entity(edge, *runner.body)->heading_rad < -1, "movement heading is exposed in radians");

  auto huge_rules = fixtures::short_garden_rules();
  huge_rules.player.radius = 120;
  Match huge({2}, 952, huge_rules);
  check(huge.add_player(a, {500, 500}, {}), "admit oversized player");
  step(huge, trace);
  const auto giant = participant(huge);
  FixtureAccess::shove(huge, *giant.body, {500, 0});
  step(huge, trace);
  check(entity(huge, *giant.body)->position == Vec2{}, "oversized bodies stay at the origin");

  rules.player.contact_damage = 3;
  rules.player.contact_cooldown = 4;
  Match contacts({3}, 952, rules);
  check(contacts.add_player(a, {}, {}) && contacts.add_player(b, {}, {}), "overlap teammates");
  step(contacts, trace);
  const auto a_body = participant(contacts).body.value();
  const auto b_body = participant(contacts, b).body.value();
  check(entity(contacts, a_body)->position == Vec2{-2, 0} &&
            entity(contacts, b_body)->position == Vec2{2, 0} &&
            events_of<HealthChange>(contacts).empty(),
        "friendly contact pushes without damage");
  const auto enemy = FixtureAccess::spawn(contacts, Group::ant_hole, Faction::garden, {-3, 0},
                                          {.radius = 1,
                                           .health = 15,
                                           .contact_damage = 7,
                                           .poison_per_tick = 2,
                                           .poison_ticks = 2,
                                           .contact_cooldown = 3});
  step(contacts, trace);
  check(entity(contacts, a_body)->health == 13 && entity(contacts, enemy)->health == 12 &&
            entity(contacts, enemy)->cooldown_ticks == 3 && entity(contacts, b_body)->health == 20,
        "enemy collision does reciprocal damage with independent cooldowns");
  FixtureAccess::hit(contacts, enemy, team(contacts));
  step(contacts, trace);
  check(!entity(contacts, enemy) && entity(contacts, a_body)->health == 11, "first poison tick");
  step(contacts, trace);
  const auto poisoned = events_of<HealthChange>(contacts);
  check(poisoned.size() == 1 && poisoned.front().kind == HealthKind::poison &&
            poisoned.front().source.entity == enemy && entity(contacts, a_body)->health == 9,
        "poison retains attribution after its source dies");
  step(contacts, trace);
  check(entity(contacts, a_body)->health == 9, "poison expires after the configured duration");

  Match heals({4}, 952, fixtures::short_garden_rules());
  check(heals.add_player(a, {}, {Petal::rose}), "equip a healing petal");
  step(heals, trace);
  const auto healer = participant(heals);
  const auto rose = healer.petals.front().entity.value();
  check(entity(heals, rose)->position == Vec2{4, 0} && entity(heals, rose)->anchor == healer.body,
        "orbit exposes position, life ownership and anchor");
  const BodyRules small{.radius = 1, .health = 20};
  const auto summon =
      FixtureAccess::spawn(heals, Group::summon, Faction::team, {6, 0}, small, healer.life);
  const auto hostile =
      FixtureAccess::spawn(heals, Group::segment, Faction::garden, {4, 2.5}, small);
  FixtureAccess::hit(heals, summon, DamageSource{}, 8);
  FixtureAccess::hit(heals, hostile, team(heals), 8);
  step(heals, trace);
  step(heals, trace);
  const auto healing = events_of<HealthChange>(heals);
  check(healing.size() == 1 && healing.front().kind == HealthKind::heal &&
            healing.front().source.entity == rose && healing.front().source.owner == healer.life &&
            healing.front().target == summon && entity(heals, summon)->health == 18 &&
            entity(heals, hostile)->health == 12,
        "healing petal heals an allied summon and leaves an enemy untouched");

  Match petal({5}, 952, fixtures::short_garden_rules());
  check(petal.add_player(a, {}, {Petal::basic}), "equip an attacking petal");
  step(petal, trace);
  const auto basic = participant(petal).petals.front().entity.value();
  const auto target = FixtureAccess::spawn(
      petal, Group::ant_hole, Faction::garden, {4, 0},
      {.radius = 1, .health = 20, .contact_damage = 5, .contact_cooldown = 20});
  step(petal, trace);
  check(!entity(petal, basic) && entity(petal, target)->health == 13 &&
            participant(petal).petals.front().reload_ticks == 2,
        "enemy and basic petal trade damage and start reload on petal death");
  step(petal, trace);
  check(!participant(petal).petals.front().entity, "reload gates petal recovery");
  step(petal, trace);
  const auto new_petal = participant(petal).petals.front().entity;
  check(new_petal && new_petal != basic, "reloaded petal receives a fresh entity generation");
}

void isolation(Trace& trace) {
  const auto replay = [](MatchId id, bool interleaved) {
    auto rules = fixtures::short_garden_rules();
    rules.special_chance = 0.75;
    rules.special_groups = {{Mob::ladybug}, {Mob::bee}};
    Match primary(id, 5489, rules);
    setup(primary, true);
    auto other_rules = fixtures::short_garden_rules();
    other_rules.timing = {Microseconds{37000}, Microseconds{91000}};
    Match other({999}, 52, other_rules);
    setup(other);
    std::ostringstream normalized;
    Trace canonical(normalized);
    for (Tick t = 0; t <= 13; ++t) {
      if (interleaved) {
        check(other.step(), "independently step the second room");
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
      step(primary, canonical);
      if (t == 0) {
        check(events_of<RandomDraw>(primary).front().value == 3499211612U,
              "pin the standard MT19937 first draw for seed 5489");
        if (interleaved) {
          const auto p = participant(primary).body.value();
          const auto foreign = participant(other).body.value();
          check(p.slot == foreign.slot && p.generation == foreign.generation &&
                    !entity(primary, foreign) && !entity(other, p),
                "entity handle namespace is match-local");
        }
      }
    }
    return normalized.str();
  };

  const auto first = replay({1}, false);
  check(first == replay({2}, false), "same seed and inputs produce identical normalized state");
  check(first == replay({3}, true), "interleaving a different room changes no normalized output");

  trace.replay(first);
  trace.replay("comparison same_seed=equal interleaved_room=equal\n");
}

void garden_candidates(Trace& trace) {
  auto rules = garden_rules();
  check(rules.version == "20221030-w0.1+w1.1" && rules.remaining_threshold == 4 &&
            rules.special_chance == 0.15 && !rules.special_on_opening_wave &&
            rules.special_groups.size() == 6 && rules.waves.size() == 3,
        "compiled settings bind to W0 rules version and early Garden candidates");
  using namespace std::chrono_literals;
  const auto seconds = [&rules](std::chrono::seconds duration) {
    return rules.timing.ticks_ceil(duration);
  };
  check(rules.waves[0].eligible.size() == 4 && rules.waves[1].eligible.size() == 6 &&
            rules.waves[2].eligible.size() == 11 && rules.waves[0].budget == 6 &&
            rules.waves[1].budget == 8 && rules.waves[2].budget == 10 &&
            rules.waves[0].deadline == seconds(20s) && rules.waves[1].deadline == seconds(25s) &&
            rules.waves[2].deadline == seconds(30s),
        "candidate eligibility is cumulative and budgets/deadlines match W0");
  for (auto& mob : rules.mobs) {
    mob.body.speed_per_second = 0;
  }
  // Keep the player and mobs stationary so the test isolates the dated wave schedule.
  rules.version += "/schedule-fixture";
  rules.special_chance = 0;
  rules.remaining_threshold = 0;
  Match match({1}, 30, rules);
  check(match.add_player(a, {}, {}), "admit fresh Garden profile");
  step(match, trace);
  check(match.view().wave.number == 1 && match.view().wave.start_tick == 0,
        "new Garden match starts on wave one");
  const std::vector<std::vector<Tick>> offsets{
      {0, seconds(6s)}, {0, seconds(7s)}, {0, seconds(7s), seconds(14s)}};
  for (std::size_t index = 0; index < offsets.size(); ++index) {
    const auto wave = match.view().wave;
    check(wave.number == index + 1 && !wave.special &&
              wave.eligible == rules.waves[index].eligible &&
              wave.deadline_tick == wave.start_tick + rules.waves[index].deadline,
          "Garden plan is frozen with the expected cumulative eligibility and deadline");
    for (const auto& slot : wave.plan) {
      check(slot.due_tick == wave.start_tick + offsets[index][slot.batch] &&
                slot.rarity == Rarity::common &&
                std::ranges::find(wave.eligible, slot.mob) != wave.eligible.end(),
            "planned Garden slot follows W0 times, rarity and catalog");
    }
    for (std::size_t batch = 0; batch < offsets[index].size(); ++batch) {
      const Tick due = wave.start_tick + offsets[index][batch];
      while (match.view().next_tick <= due) {
        check(match.step(), "advance Garden clock to scheduled batch");
      }
      if (batch != 0 || index != 0) {
        trace.record(match);
      }
      const auto active_wave = match.view().wave;
      for (const auto& slot : active_wave.plan) {
        if (slot.batch == batch) {
          check(slot.actual_tick == due, "actual Garden batch is on schedule");
        }
      }
      defeat_mobs(match, rules.waves[index].batches[batch].count);
      step(match, trace);
    }
    expect_transition(match, TransitionReason::threshold, index + 1 < offsets.size());
  }
  check(match.view().phase == Phase::ended && !match.step(), "finite early scenario ends once");

  auto special_rules = garden_rules();
  special_rules.version += "/special-fixture";
  special_rules.special_groups = {{Mob::ladybug, Mob::dark_ladybug}, {Mob::spider}};
  for (auto& mob : special_rules.mobs) {
    mob.body.speed_per_second = 0;
  }
  Match special({2}, 32, special_rules);
  check(special.add_player(a, {}, {}), "admit a player for the special-wave fixture");
  step(special, trace);
  const auto opening_draws = events_of<RandomDraw>(special);
  check(!special.view().wave.special && std::ranges::none_of(opening_draws,
                                                             [](const RandomDraw& draw) {
                                                               return draw.purpose ==
                                                                      DrawPurpose::special_roll;
                                                             }),
        "opening Garden wave does not roll for special eligibility");
  defeat_mobs(special, 2);
  while (special.view().next_tick <= seconds(6s)) {
    check(special.step(), "reach final Garden batch");
  }
  trace.record(special);
  const auto draws = events_of<RandomDraw>(special);
  const auto roll = std::ranges::find(draws, DrawPurpose::special_roll, &RandomDraw::purpose);
  check(roll != draws.end() && roll->value == 434163459U, "seeded special roll near 0.1");
  check(special.view().wave.number == 2 && special.view().wave.special &&
            special.view().wave.eligible == std::vector{Mob::ladybug} &&
            std::ranges::all_of(special.view().wave.plan,
                                [](const SpawnSlot& slot) { return slot.mob == Mob::ladybug; }),
        "special waves drop empty groups and exclude species locked until later waves");
}

}  // namespace
}  // namespace wave::sim

int main(int argc, char** argv) {
  using namespace wave::sim;
  if (argc != 3) {
    std::cerr << "Usage: wave_w1 CASE REPORT\n";
    return 2;
  }
  const std::pair<std::string_view, void (*)(Trace&)> fixtures[] = {
      {"W1-01", batches},
      {"W1-02", threshold},
      {"W1-03", blocked},
      {"W1-04", lives},
      {"W1-05", geometry_and_combat},
      {"W1-06", isolation},
      {"W0-GARDEN", garden_candidates},
  };
  const auto fixture = std::ranges::find_if(
      fixtures, [name = std::string_view(argv[1])](auto entry) { return entry.first == name; });
  if (fixture == std::end(fixtures)) {
    std::cerr << "Unknown fixture " << argv[1] << '\n';
    return 2;
  }
  std::ofstream report(argv[2], std::ios::trunc);
  if (!report) {
    std::cerr << "Cannot open report " << argv[2] << '\n';
    return 2;
  }
  try {
    Trace trace(report);
    report << fixture->first << '\n';
    fixture->second(trace);
    report << "PASS\n";
    report.close();
    if (!report) {
      throw std::runtime_error("Could not write complete trace");
    }
    std::cout << fixture->first << " passed, trace " << argv[2] << '\n';
  } catch (const std::exception& error) {
    report << "FAIL " << error.what() << '\n';
    std::cerr << fixture->first << " failed: " << error.what() << '\n';
    return 1;
  }
}
