#include "app/room_manager.hpp"
#include "catalog/catalog.hpp"
#include "scenario_defaults.hpp"

#include <cmath>
#include <iostream>
#include <limits>
#include <map>
#include <stdexcept>

namespace wave::sim {
struct FixtureAccess {
  static detail::Entity& entity(Match& m, EntityId id) { return *m.entities_.get(id); }
  static PlayerView& player(Match& m, PlayerId id = {1}) { return m.player(id)->view; }
  static EntityId body(Match& m, PlayerId id = {1}) { return *player(m, id).body; }
  static EntityId spawn(Match& m, Mob kind, Rarity rarity, Vec2 at = {}, std::uint32_t area = 0) {
    return m.spawn_mob(kind, rarity, at, Group::main_mob, {}, 0, area);
  }
  static EntityId summon(Match& m, PlayerId owner) {
    return m.spawn_mob(Mob::bee, Rarity::common, {50, 0}, Group::summon, player(m, owner).life);
  }
  static void move(Match& m, PlayerId id, Vec2 at) {
    const auto delta = at - entity(m, body(m, id)).view.position;
    for (const auto slot : m.entities_.active()) {
      auto& e = m.entities_.at(slot);
      if (e.view.owner == player(m, id).life) {
        e.view.position += delta;
      }
    }
  }
  static double hit(Match& m, EntityId target, EntityId source, double damage) {
    return m.apply_health(target, m.damage_source(entity(m, source)), HealthKind::contact, damage);
  }
  static void contacts(Match& m) {
    m.resolve_contacts();
    m.apply_impacts();
  }
  static void reap(Match& m) { m.reap_deaths(); }
  static void holes(Match& m) { m.update_ant_holes(); }
  static void seed(Match& m, unsigned seed) { m.rng_.seed(seed); }
  static void disable_pvp_spawns(Match& m) {
    m.pvp_spawn_ready_ = std::numeric_limits<Tick>::max();
  }
  static void deadline(Match& m, std::uint32_t area, Tick tick) {
    std::ranges::find(m.ant_holes_, area, &AntHoleView::area)->deadline_tick = tick;
  }
};
}
namespace {
using namespace wave;
using namespace sim;
void check(bool yes, const char* why) {
  if (!yes) {
    throw std::runtime_error(why);
  }
}
void near(double a, double b, const char* why) {
  check(std::abs(a - b) < 1e-6, why);
}
void step(Match& m, unsigned n = 1) {
  while (n--) {
    check(m.step(), "match must advance");
  }
}
Rules arena() {
  auto r = scenario_rules(Biome::garden);
  r.progressive_waves = false;
  r.player.health = 1e9;
  r.player.contact_damage = 0;
  r.player.speed_per_second = 0;
  r.special_chance = 0;
  r.remaining_threshold = 0;
  r.advance_on_deadline = false;
  r.waves = {{1, {Mob::rock}, Rarity::common, 1, {{0, 1}}, 100000}};
  r.spawn_points = {{250, 0}};
  r.contact_knockback_speed = 0;
  return r;
}
std::uint32_t enter(Match& m, Rarity rarity = Rarity::rare, Mob kind = Mob::ant_hole) {
  FixtureAccess::move(m, {1}, {});
  FixtureAccess::spawn(m, kind, rarity);
  FixtureAccess::holes(m);
  return FixtureAccess::player(m).area;
}
void ant_enter_rarity() {
  for (unsigned tier = 0; tier < 6; ++tier) {
    Match m({1}, 3, arena());
    m.add_player({1}, {}, {});
    step(m);
    const auto old = FixtureAccess::player(m).life;
    const auto body = FixtureAccess::body(m);
    FixtureAccess::entity(m, body).view.health = 4321;
    const auto area = enter(m, Rarity(tier));
    check((area != 0) == (tier >= 2), "only Rare+ contacts enter interiors");
    if (!area) {
      continue;
    }
    const auto view = m.view();
    check(view.ant_holes.size() == 1 && view.ant_holes[0].radius == 150, "one circular instance");
    check(FixtureAccess::body(m) == body &&
              FixtureAccess::player(m).life.generation > old.generation,
          "transfer preserves body and changes control epoch");
    near(FixtureAccess::entity(m, body).view.health, 4321, "entry preserves current health");
    std::map<Mob, unsigned> counts;
    for (const auto& e : view.entities) {
      if (e.area != area || e.faction != Faction::hostile || !e.mob) {
        continue;
      }
      ++counts[*e.mob];
      check(e.rarity == (e.mob == Mob::queen_ant ? Rarity(tier) : Rarity::rare), "caste rarity");
      check(e.position.length() + e.radius <= 150.00001, "spawn fits interior circle");
    }
    check(counts[Mob::baby_ant] == 5 && counts[Mob::worker_ant] == 8 &&
              counts[Mob::soldier_ant] == 26 && counts[Mob::queen_ant] == 1,
          "Garden encounter roster");
    check(!m.queue(Input{old, {1, 0}}), "pre-transfer acknowledged input is rejected");
  }
}
void ant_split_lifecycle() {
  Match m({2}, 4, arena());
  for (unsigned i = 1; i <= 4; ++i) {
    check(m.add_player({i}, {double(i) * 30, 0}, {Petal::basic}), "four seats");
  }
  step(m);
  const auto area = enter(m);
  check(area && FixtureAccess::player(m, {2}).area == 0, "two players split worlds");
  const auto deadline = m.view().wave.deadline_tick;
  step(m, 2);
  check(m.view().wave.deadline_tick == deadline, "outside survivor keeps main clock running");
  const auto body = FixtureAccess::body(m);
  auto& flower = FixtureAccess::entity(m, body).view;
  const auto mob = FixtureAccess::spawn(m, Mob::soldier_ant, Rarity::rare, flower.position);
  const auto before = flower.health;
  FixtureAccess::contacts(m);
  near(flower.health, before, "equal coordinates in separate areas cannot contact");
  (void)mob;
  for (unsigned i = 2; i <= 4; ++i) {
    FixtureAccess::move(m, {i}, {});
  }
  FixtureAccess::holes(m);
  for (const auto& p : m.view().players) {
    check(p.area == area, "all four share one instance");
  }
  const auto held = m.view().wave.deadline_tick;
  step(m, 2);
  check(m.view().wave.deadline_tick == held + 2, "all inside suspend main wave clock");
  const auto life = FixtureAccess::player(m).life;
  m.queue(Connection{{1}, false});
  step(m);
  m.queue(Connection{{1}, true});
  step(m);
  check(FixtureAccess::player(m).life == life && FixtureAccess::player(m).area == area,
        "reconnect retains interior and life");
  // A player dying inside waits in that area; closing it returns the reservation too.
  FixtureAccess::entity(m, body).view.health = 0;
  FixtureAccess::reap(m);
  check(FixtureAccess::player(m).state == LifeState::waiting, "interior death waits for revival");
  FixtureAccess::deadline(m, area, m.view().next_tick);
  step(m);
  check(FixtureAccess::player(m).area == 0 && !FixtureAccess::player(m).body,
        "closed interior returns dead player's reservation");
}
void ant_close(bool timeout) {
  auto r = arena();
  r.ant_hole_duration = std::chrono::milliseconds(100);
  Match m({3}, 9, r);
  m.add_player({1}, {}, {Petal::basic});
  step(m);
  const auto area = enter(m);
  check(area != 0, "enter timed cave");
  const auto life = FixtureAccess::player(m).life;
  const auto body = FixtureAccess::body(m);
  std::vector<EntityId> guards;
  for (const auto& e : m.view().entities) {
    if (e.area == area && e.faction == Faction::hostile && e.mob) {
      guards.push_back(e.id);
    }
  }
  if (timeout) {
    step(m, 5);
    check(!m.view().ant_holes.size(), "deadline closes interior");
    check(std::ranges::any_of(m.view().entities,
                              [](const auto& e) { return e.group == Group::residual; }),
          "timeout returns surviving defenders");
  } else {
    for (std::size_t n = 1; n < guards.size(); ++n) {
      FixtureAccess::entity(m, guards[n]).view.health = 0;
    }
    FixtureAccess::reap(m);
    FixtureAccess::holes(m);
    check(m.view().ant_holes.size() == 1, "last guard keeps interior open");
    FixtureAccess::entity(m, guards[0]).view.health = 0;
    FixtureAccess::reap(m);
    FixtureAccess::holes(m);
    check(m.view().ant_holes.empty(), "last guard closes interior");
  }
  check(FixtureAccess::player(m).area == 0 && FixtureAccess::body(m) == body,
        "return preserves player body");
  check(FixtureAccess::player(m).life.generation > life.generation,
        "return invalidates old input epoch");
  for (const auto& e : m.view().entities) {
    check(e.area == 0, "all entities return with players");
  }
  check(m.view().wave.counts.alive == 1, "interior deaths do not decrement main wave population");
  check(!m.queue(Input{life, {1, 0}}), "stale cave input rejected after return");
  // Return cooldown prevents an immediate bounce; later entrances get new identities.
  step(m, 41);
  const auto again = enter(m);
  check(again > area, "repeated transfers allocate distinct instance identities");
}
void ant_fire() {
  for (unsigned tier = 0; tier < 6; ++tier) {
    Match m({4}, 7, arena());
    m.add_player({1}, {}, {});
    step(m);
    const auto area = enter(m, Rarity(tier), Mob::fire_ant_burrow);
    if (tier < 2) {
      step(m);
    }
    unsigned count = 0, high = 0;
    for (const auto& e : m.view().entities) {
      if (e.mob == Mob::fire_ant) {
        ++count;
        if (e.rarity == Rarity(tier)) {
          ++high;
        }
        check(e.area == area, "fire ants spawn in matching world");
      }
    }
    check(count == (tier < 2 ? 30 : 50), "fire population by entrance rarity");
    check(high == (tier < 3 ? count : 6 - tier), "Epic/Legendary/Mythic fire rarity mix");
  }
}
void ant_digger() {
  for (const auto kind : {Mob::ant_hole, Mob::fire_ant_burrow}) {
    for (const bool win : {false, true}) {
      Match m({5}, 5, arena());
      m.add_player({1}, {}, {});
      m.add_player({2}, {80, 0}, {});
      step(m);
      unsigned seed = 0;
      for (;; ++seed) {
        std::mt19937 rng(seed);
        for (unsigned i = 0; i < (kind == Mob::ant_hole ? 80u : 100u); ++i) {
          (void)rng();
        }
        if ((rng() % 100 < 2) == win) {
          break;
        }
      }
      FixtureAccess::seed(m, seed);
      const auto area = enter(m, Rarity::legendary, kind);
      const auto view = m.view();
      const auto digger = std::ranges::find(view.entities, Mob::digger, &EntityView::mob);
      check((digger != view.entities.end()) == win,
            "entry roll chooses Digger exactly at 2 percent");
      if (win) {
        check(digger->area == area && digger->rarity == Rarity::legendary &&
                  digger->faction == Faction::team,
              "friendly Digger matches cave tier");
      }
      const auto roll_count = [&] {
        return std::ranges::count_if(m.events(), [](const auto& e) {
          const auto* d = std::get_if<RandomDraw>(&e.data);
          return d && d->purpose == DrawPurpose::digger_spawn;
        });
      };
      check(roll_count() == 1, "first entrant rolls once");
      FixtureAccess::move(m, {2}, {});
      FixtureAccess::holes(m);
      check(roll_count() == 1, "later entrant does not roll again");
    }
  }
}
Rules pvp_arena() {
  auto r = pvp_rules();
  r.player.health = 1e6;
  r.player.contact_damage = 10;
  r.player.speed_per_second = 0;
  r.contact_knockback_speed = 0;
  r.pvp_spawn_interval = std::chrono::seconds(1000);
  return r;
}
void pvp_combat_score() {
  Match m({10}, 11, pvp_arena());
  m.add_player({1}, {}, {Petal::basic});
  m.add_player({2}, {1, 0}, {});
  step(m);
  const auto a = FixtureAccess::body(m), b = FixtureAccess::body(m, {2});
  check(FixtureAccess::entity(m, a).view.faction != FixtureAccess::entity(m, b).view.faction,
        "PvP players have independent factions");
  const auto own = m.view().players[0].petals[0].entity;
  check(FixtureAccess::hit(m, a, *own, 20) == 0, "own petal cannot damage owner");
  check(FixtureAccess::hit(m, b, *own, 20) > 0, "opponent takes petal damage");
  FixtureAccess::player(m, {2}).score = 1000;
  const auto summon = FixtureAccess::summon(m, {1});
  check(FixtureAccess::entity(m, summon).view.faction == FixtureAccess::entity(m, a).view.faction,
        "PvP summons inherit their flower's faction");
  check(FixtureAccess::hit(m, a, summon, 20) == 0, "own summon cannot damage its flower");
  FixtureAccess::hit(m, b, summon, 1e9);
  FixtureAccess::reap(m);
  check(FixtureAccess::player(m).score == 1000, "killer inherits defeated score");
  check(FixtureAccess::player(m, {2}).state == LifeState::ended && m.phase() != Phase::ended,
        "individual PvP death does not end free-for-all");
  check(FixtureAccess::player(m, {2}).killer_player == PlayerId{1},
        "death attribution records opponent");
  const auto rock = FixtureAccess::spawn(m, Mob::rock, Rarity::rare, {200, 0});
  const auto xp = catalog::dated().mob(Mob::rock, Rarity::rare)->xp;
  FixtureAccess::hit(m, rock, a, 1e9);
  FixtureAccess::reap(m);
  check(FixtureAccess::player(m).score == 1000 + xp, "mob score uses dated catalog XP");
  step(m);
  check(m.view().wave.number == 0 && m.view().previous_wave == std::nullopt,
        "PvP never advances waves");
}
void pvp_spawning_resize_magnet() {
  auto r = pvp_rules();
  r.player.health = 1e9;
  r.player.contact_damage = 0;
  r.player.speed_per_second = 0;
  r.pvp_spawn_interval = std::chrono::milliseconds(25);
  r.pvp_mob_limit = 4;
  Match m({11}, 14, r);
  m.add_player({1}, {}, {Petal::magnet}, {Rarity::mythic});
  step(m);
  near(m.view().arena_radius, 300, "single player map baseline");
  near(FixtureAccess::player(m).pickup_multiplier, 1, "PvP Magnet never extends pickup range");
  check(m.add_player({2}, {100, 0}, {}), "PvP permits live join without wave qualification");
  step(m);
  near(m.view().arena_radius, 300.25, "second living player starts gradual field growth");
  m.queue(Departure{{2}});
  step(m);
  near(m.view().arena_radius, 300, "departure reverses growth without overshooting the baseline");
  step(m, 12);
  unsigned mobs = 0;
  for (const auto& e : m.view().entities) {
    if (e.group == Group::main_mob) {
      ++mobs;
      check(e.rarity >= Rarity::unusual && e.rarity <= Rarity::epic, "wave18 rarity envelope");
      check(std::ranges::find(detail::w5_pvp_mob_pool, *e.mob) != detail::w5_pvp_mob_pool.end(),
            "dated PvP pool");
    }
  }
  check(mobs == 4 && m.view().wave.number == 0, "continuous bounded spawning without wave state");
  // A separate PvE room consumes no draws from this PvP generator (and vice versa).
  Match control({12}, 14, r);
  control.add_player({1}, {}, {Petal::magnet}, {Rarity::mythic});
  Match pve({13}, 99, arena());
  pve.add_player({1}, {}, {});
  step(pve, 10);
  step(control);
  auto first = m.view();
  auto second = control.view();
  const auto firstmob = std::ranges::find_if(
      first.entities, [](const auto& e) { return e.group == Group::main_mob; });
  const auto secondmob = std::ranges::find_if(
      second.entities, [](const auto& e) { return e.group == Group::main_mob; });
  check(firstmob->mob == secondmob->mob && firstmob->rarity == secondmob->rarity,
        "PvE/PvP random streams isolated");
}
void pvp_boundaries() {
  {
    Match m({14}, 7, pvp_arena());
    m.add_player({1}, {}, {});
    m.add_player({2}, {50, 0}, {});
    step(m);
    FixtureAccess::player(m).score = 99;
    FixtureAccess::player(m, {2}).score = 1;
    const auto a = FixtureAccess::body(m), b = FixtureAccess::body(m, {2});
    FixtureAccess::hit(m, a, b, 1e9);
    FixtureAccess::hit(m, b, a, 1e9);
    FixtureAccess::reap(m);
    unsigned deaths = 0;
    for (const auto& event : m.events()) {
      if (const auto* d = std::get_if<Defeat>(&event.data); d && d->group == Group::player) {
        check(d->victim_score == 99 || d->victim_score == 1,
              "mutual kills freeze score before transfers");
        check(!pvp_basic_rarity(d->victim_score),
              "slot ordering cannot upgrade a simultaneous Basic drop");
        ++deaths;
      }
    }
    check(deaths == 2, "mutual kill records both victims");
  }
  check(!pvp_basic_rarity(0) && !pvp_basic_rarity(99), "low score drops no Basic");
  for (unsigned i = 0; i < 4; ++i) {
    const auto bound = detail::w5_pvp_basic_thresholds[i];
    const auto expected = Rarity(i + 1);
    check(pvp_basic_rarity(bound) == expected && pvp_basic_rarity(bound + 1) == expected,
          "threshold inclusive");
    check(pvp_basic_rarity(bound - 1) == (i ? std::optional{Rarity(i)} : std::nullopt),
          "one representable score below threshold");
  }
  check(pvp_basic_rarity(UINT64_MAX) == Rarity::legendary, "never drop Mythic Basic");
}
void pvp_reconnect() {
  auto rules = pvp_arena();
  Match m({15}, 7, rules);
  m.add_player({1}, {}, {Petal::magnet}, {Rarity::rare});
  m.add_player({2}, {100, 0}, {});
  step(m);
  FixtureAccess::player(m).score = 1200;
  const auto life = FixtureAccess::player(m).life;
  m.queue(Connection{{1}, false});
  m.queue(Connection{{2}, false});
  step(m);
  check(m.phase() != Phase::ended,
        "disconnected PvP world remains reconnectable during seat grace");
  near(m.view().arena_radius, 300, "offline players are excluded from map population");
  m.queue(Connection{{1}, true});
  step(m);
  check(FixtureAccess::player(m).life == life && FixtureAccess::player(m).score == 1200 &&
            FixtureAccess::player(m).loadout[0] == Petal::magnet,
        "PvP reconnect preserves score, equipment, and physical life");
  m.queue(Connection{{2}, true});
  step(m);
  near(m.view().arena_radius, 300.25, "reconnected players restart gradual field growth");
}
void pvp_smooth_resize() {
  for (const auto duration : {Microseconds{12500}, Microseconds{25000}, Microseconds{50000}}) {
    for (const double speed : {7., 10.}) {
      for (const auto outward : {Vec2{1, 0}, Vec2{.6, .8}}) {
        auto rules = pvp_arena();
        rules.timing.step = duration;
        rules.pvp_arena_resize_speed_per_second = speed;
        rules.player.speed_per_second = 50;
        Match m({17}, 7, rules);
        FixtureAccess::disable_pvp_spawns(m);
        check(m.add_player({1}, {}, {}) && m.add_player({2}, {100, 0}, {}), "two resize seats");
        const auto second = rules.timing.ticks_ceil(std::chrono::seconds(1));
        const auto change = speed * std::chrono::duration<double>(duration).count();
        step(m, second);
        near(m.view().arena_radius, 300 + speed, "growth covers the same distance in one second");
        step(m, second * 6);
        near(m.view().arena_radius, 340, "growth stops at the population target without overshoot");
        FixtureAccess::move(m, {1}, outward * 335);
        const auto body = FixtureAccess::body(m);
        check(m.queue(Departure{{2}}) && m.queue(Input{FixtureAccess::player(m).life, outward}),
              "leave while the survivor keeps walking outward at the edge");
        for (Tick tick = 0; tick < second; ++tick) {
          const auto before = FixtureAccess::entity(m, body).view.position;
          step(m);
          const auto& flower = FixtureAccess::entity(m, body).view;
          near(m.view().arena_radius, 340 - (tick + 1) * change, "shrink keeps a fixed speed");
          near(flower.position.length(), m.view().arena_radius - flower.radius,
               "outward input stays on the moving boundary");
          near((flower.position - before).length(), change,
               "outward input cannot cause a jump or oscillation during shrink");
        }
        check(m.add_player({3}, {100, 0}, {}), "a new player reverses an unfinished shrink");
        const auto reversing_at = m.view().arena_radius;
        step(m, second / 2);
        near(m.view().arena_radius, reversing_at + speed / 2,
             "expansion resumes at the same speed from the current radius");
        check(m.queue(Departure{{3}}), "the target can reverse again before growth finishes");
        for (Tick tick = 0; tick < second * 6; ++tick) {
          const auto radius = m.view().arena_radius;
          const auto before = FixtureAccess::entity(m, body).view.position;
          step(m);
          const auto& flower = FixtureAccess::entity(m, body).view;
          check(m.view().arena_radius <= radius && radius - m.view().arena_radius <= change + 1e-6,
                "every shrink step remains bounded, including the final partial step");
          near(flower.position.length(), m.view().arena_radius - flower.radius,
               "the outward-moving flower follows the boundary until it stops");
          check((flower.position - before).length() <= change + 1e-6,
                "the edge cannot add a burst of movement");
        }
        near(m.view().arena_radius, 300, "shrink reaches and stays at the target");
      }
    }
  }
}
void pvp_kill_preserves_movement() {
  for (const bool moving : {false, true}) {
    auto rules = pvp_arena();
    rules.player.speed_per_second = 50;
    Match m({16}, 7, rules);
    FixtureAccess::disable_pvp_spawns(m);
    check(m.add_player({1}, {100, 0}, {}) && m.add_player({2}, {}, {}), "two PvP flowers");
    step(m, 160);
    FixtureAccess::move(m, {1}, {330, 0});
    const auto life = FixtureAccess::player(m).life;
    const auto body = FixtureAccess::body(m);
    FixtureAccess::hit(m, FixtureAccess::body(m, {2}), body, 1e9);
    step(m);
    check(FixtureAccess::player(m, {2}).state == LifeState::ended, "opponent is defeated");
    check(m.queue(Input{life, moving ? Vec2{-1, 0} : Vec2{}}), "keep the same movement input");
    for (unsigned tick = 0; tick < 12; ++tick) {
      const auto before = FixtureAccess::entity(m, body).view.position;
      step(m);
      const auto& after = FixtureAccess::entity(m, body).view;
      near((after.position - before).length(), moving ? 1.25 : 0,
           "a kill cannot accelerate or move the survivor during field shrink");
      near(after.velocity.length(), moving ? 50 : 0, "normal movement speed after a kill");
      check(after.position.length() + after.radius <= m.view().arena_radius + 1e-6,
            "the shrinking field still contains the survivor");
    }
    FixtureAccess::move(m, {1}, {280, 0});
    step(m, 160);
    near(m.view().arena_radius, 300, "the field eventually reaches the smaller population target");
  }
}
void pvp_death_reentry() {
  for (const bool shared : {false, true}) {
    for (const bool advance_departure : {false, true}) {
      app::RoomManager rooms(pvp_arena());
      auto& a = rooms.admit("", 1, Biome::garden, Mode::pvp);
      check(rooms.command(a, wire::Ready{true}, {}), "PvP Ready starts a life");
      const auto code = a.room;
      check(rooms.command(a, wire::AdComplete{}, {}) && a.room == code,
            "pre-game ad completion preserves the waiting PvP seat");
      auto& b = rooms.admit("", 2, Biome::garden, Mode::pvp);
      if (shared) {
        check(rooms.command(b, wire::Ready{true}, {}) && b.room == code,
              "survivor joins the same public field");
      }
      rooms.step();
      auto& match = *rooms.room(a)->match;
      const auto match_id = match.id();
      const auto life = FixtureAccess::player(match, a.id).life;
      check(rooms.command(a, wire::AdComplete{}, life) && a.room == code,
            "ad completion preserves a living PvP player");
      FixtureAccess::player(match, a.id).score = 99;
      FixtureAccess::entity(match, FixtureAccess::body(match, a.id)).view.health = 0;
      rooms.step();
      check(FixtureAccess::player(match, a.id).state == LifeState::ended,
            "PvP death ends only the defeated life");
      check(rooms.command(a, wire::AdComplete{}, {}) && a.room.empty() && !a.ready,
            "native PvP Continue releases the dead seat without command 21");
      check(rooms.command(a, wire::AdComplete{}, {}) && a.room.empty(),
            "repeated completion at the menu is harmless");
      if (advance_departure) {
        rooms.step();
      }
      check(rooms.command(a, wire::Ready{true}, {}), "Ready works after PvP death Continue");
      rooms.step();
      auto& rejoined = *rooms.room(a)->match;
      const auto& player = FixtureAccess::player(rejoined, a.id);
      check(player.state == LifeState::alive && player.body && player.life != life &&
                player.score == 0,
            "reentry supplies a fresh living flower with zero score");
      check(!rejoined.queue(Input{life, {1, 0}}), "old-life input cannot control the new flower");
      const auto room = a.room;
      check(rooms.command(a, wire::AdComplete{}, {}) && a.room == room,
            "delayed ad completion cannot remove the new life");
      if (shared) {
        check(room == code && rejoined.id() == match_id &&
                  FixtureAccess::player(rejoined, b.id).state == LifeState::alive,
              "reentry keeps the survivor and the running public field");
      }
    }
  }
}
void pvp_economy_entry() {
  store::Options opts;
  opts.allow_test_seed = true;
  auto db = std::make_shared<store::Store>(":memory:", opts);
  auto low = db->create_guest();
  auto high = db->create_guest();
  auto other = db->create_guest();
  for (const auto& p : {high, other}) {
    store::TestSeed seed;
    seed.inventory = p.inventory;
    seed.slots = p.slots;
    seed.xp = 1000000;
    (void)db->seed_for_testing(p.guest_token, seed);
  }
  app::RoomManager rooms(pvp_arena(), 42, {}, db);
  auto& locked = rooms.admit(low.guest_token, 1, Biome::garden, Mode::pvp);
  check(!rooms.command(locked, wire::Ready{true}, {}) && locked.room.empty(),
        "level15 enforced by authority");
  auto& a = rooms.admit(high.guest_token, 2, Biome::garden, Mode::pvp);
  auto& b = rooms.admit(other.guest_token, 3, Biome::garden, Mode::pvp);
  check(rooms.command(a, wire::Ready{true}, {}) && rooms.command(b, wire::Ready{true}, {}),
        "qualified Ready enters PvP");
  check(a.room == b.room && rooms.room(a)->mode == Mode::pvp, "shared independent PvP room");
  rooms.step();
  check(rooms.wait_storage(), "storage barrier");
  auto& m = *rooms.room(a)->match;
  check(FixtureAccess::player(m, a.id).loadout[0] == Petal::basic, "profile equipment inherited");
  FixtureAccess::player(m, b.id).score = 1000;
  const auto killed = FixtureAccess::body(m, b.id);
  const auto old_source = DamageSource{killed, FixtureAccess::player(m, b.id).life,
                                       FixtureAccess::entity(m, killed).view.faction};
  FixtureAccess::move(m, b.id, {330, 0});
  FixtureAccess::move(m, a.id, {330, 0});
  FixtureAccess::hit(m, killed, FixtureAccess::body(m, a.id), 1e9);
  rooms.step();
  check(rooms.wait_storage(), "kill reward settles");
  check(rooms.room(a)->drops.size() == 1 && rooms.room(a)->drops[0].item == store::Item{1, 2},
        "defeated score creates exactly one Rare Basic");
  const auto before = db->recover_guest(a.token)->inventory;
  for (unsigned i = 0; i < 15; ++i) {
    rooms.step();
    check(rooms.wait_storage(), "pickup settles");
  }
  const auto after = db->recover_guest(a.token)->inventory;
  for (const auto& d : rooms.room(a)->drops) {
    check(d.position.length() <= rooms.room(a)->match->view().arena_radius,
          "edge drops fit shrunken field");
  }
  check(after.contains({1, 2}) && after.at({1, 2}) == 1,
        "sole collector receives one persisted Basic");
  check(!db->recover_guest(b.token)->inventory.contains({1, 2}),
        "defeated player receives no pickup");
  check(db->recover_guest(a.token)->highest_wave == 0, "PvP cannot write PvE wave progress");
  for (unsigned i = 0; i < 3; ++i) {
    rooms.step();
    check(rooms.wait_storage(), "replay settles");
  }
  check(db->recover_guest(a.token)->inventory == after, "repeated ticks never duplicate pickup");
  check(rooms.command(b, wire::Continue{}, {}) && b.room.empty(), "Continue leaves dead PvP seat");
  check(rooms.command(b, wire::Ready{true}, {}) && b.room == a.room,
        "dead guest can start a new life");
  const auto poisoned = FixtureAccess::spawn(m, Mob::rock, Rarity::rare, {180, 150});
  FixtureAccess::entity(m, poisoned).poison = detail::Poison{old_source, 1e12, 1};
  const auto xp = b.profile->xp;
  rooms.step();
  check(rooms.wait_storage(), "old poison settlement completes");
  check(b.profile->xp == xp && FixtureAccess::player(m, b.id).score == 0,
        "prior-life poison cannot credit the new PvP life");
  auto& garden = rooms.admit(locked.token, 4, Biome::garden, Mode::waves);
  check(rooms.command(garden, wire::Ready{true}, {}) && garden.room != a.room,
        "PvE matchmaking isolated");
  (void)before;
}
void ant_economy() {
  auto db = std::make_shared<store::Store>(":memory:");
  app::RoomManager rooms(arena(), 42, {}, db);
  auto& a = rooms.admit("", 1);
  check(rooms.command(a, wire::Ready{true}, {}), "start persistent cave match");
  rooms.step();
  check(rooms.wait_storage(), "initial profile settled");
  auto& m = *rooms.room(a)->match;
  FixtureAccess::move(m, a.id, {});
  FixtureAccess::spawn(m, Mob::ant_hole, Rarity::rare);
  FixtureAccess::holes(m);
  const auto area = FixtureAccess::player(m, a.id).area;
  check(area != 0, "persistent player enters cave");
  const auto xp_before = a.profile->xp;
  std::uint64_t expected_xp = catalog::dated().mob(Mob::ant_hole, Rarity::rare)->xp;
  for (const auto& e : m.view().entities) {
    if (e.area == area && e.mob && e.faction == Faction::hostile) {
      expected_xp += catalog::dated().mob(*e.mob, e.rarity)->xp;
      FixtureAccess::hit(m, e.id, FixtureAccess::body(m, a.id), 1e12);
    }
  }
  auto& room = const_cast<app::Room&>(*rooms.room(a));
  const store::Item returned{1, 4};
  room.drops.push_back(
      {"test-returned-card", returned, {25, 0}, ++room.drop_sequence, 0, false, area});
  rooms.step();
  check(rooms.wait_storage(), "last-guard reward settles with return");
  check(m.view().ant_holes.empty() && a.profile->xp == xp_before + expected_xp,
        "last guard grants XP even though return changes the control epoch");
  check(std::ranges::all_of(room.drops, [](const auto& d) { return d.area == 0; }),
        "closure transfers ground cards to main world");
  for (unsigned i = 0; i < 3; ++i) {
    rooms.step();
    check(rooms.wait_storage(), "returned pickup settles");
  }
  check(a.profile->inventory.contains(returned) && a.profile->inventory.at(returned) == 1,
        "returned ground card has exactly one durable collector");
}
void fire_economy() {
  for (const bool small : {false, true}) {
    auto db = std::make_shared<store::Store>(":memory:");
    app::RoomManager rooms(arena(), 42, {}, db);
    auto& a = rooms.admit("", 1);
    check(rooms.command(a, wire::Ready{true}, {}), "start fire economic match");
    rooms.step();
    check(rooms.wait_storage(), "fire initial profile settled");
    auto& m = *rooms.room(a)->match;
    FixtureAccess::move(m, a.id, {});
    FixtureAccess::spawn(m, Mob::fire_ant_burrow, small ? Rarity::common : Rarity::rare,
                         small ? Vec2{20, 0} : Vec2{});
    if (small) {
      rooms.step();
      check(rooms.wait_storage(), "small burrow release settled");
      const auto before = a.profile->xp;
      unsigned guards = 0;
      for (const auto& e : m.view().entities) {
        if (e.mob == Mob::fire_ant) {
          ++guards;
          FixtureAccess::hit(m, e.id, FixtureAccess::body(m, a.id), 1e12);
        }
      }
      check(guards == 30, "small burrow has 30 wild guards");
      rooms.step();
      check(rooms.wait_storage(), "wild guard rewards settled");
      check(a.profile->xp == before + 30 * catalog::dated().mob(Mob::fire_ant, Rarity::common)->xp,
            "wild summons receive XP without counting as main-wave roots");
    } else {
      FixtureAccess::holes(m);
      const auto area = FixtureAccess::player(m, a.id).area;
      check(area != 0, "enter fire reward interior");
      auto& room = const_cast<app::Room&>(*rooms.room(a));
      room.loot_rng.seed(3);
      FixtureAccess::deadline(m, area, m.view().next_tick);
      const auto before = a.profile->xp;
      rooms.step();
      check(rooms.wait_storage(), "fire timeout reward settled");
      check(a.profile->xp == before + catalog::dated().mob(Mob::fire_ant_burrow, Rarity::rare)->xp,
            "timeout grants the entrance's separate catalog XP once");
      check(std::ranges::any_of(
                room.drops,
                [](const auto& d) { return d.item.kind == *catalog::client_petal(Petal::magnet); }),
            "closing fire burrow rolls its Magnet loot table");
      check(std::ranges::all_of(room.drops, [](const auto& d) { return d.area == 0; }),
            "entrance loot stays outside closed interior");
    }
  }
}
void scene_colors() {
  check(scene_background(Mode::waves, Biome::garden) == std::array<std::uint8_t, 3>{30, 167, 97},
        "Garden menu RGB");
  check(scene_background(Mode::waves, Biome::desert) == std::array<std::uint8_t, 3>{222, 207, 124},
        "Desert menu RGB");
  check(scene_background(Mode::waves, Biome::ocean) == std::array<std::uint8_t, 3>{87, 133, 186},
        "Ocean menu RGB");
  for (const auto biome : {Biome::garden, Biome::desert, Biome::ocean}) {
    check(scene_background(Mode::pvp, biome) == std::array<std::uint8_t, 3>{77, 94, 86},
          "PvP menu RGB");
    check(scene_background(Mode::waves, biome, Mob::ant_hole) ==
              std::array<std::uint8_t, 3>{181, 133, 0},
          "Ant interior uses entrance color");
    check(scene_background(Mode::waves, biome, Mob::fire_ant_burrow) ==
              std::array<std::uint8_t, 3>{181, 45, 0},
          "Fire interior uses entrance color");
  }
}
void parameters() {
  const auto r = pvp_rules();
  const auto g = scenario_rules(Biome::garden);
  std::cout << "{\"parameters\":" << detail::w5_parameters_json << ",\"actual\":{"
            << "\"antHoleRadius\":" << g.ant_hole_radius << ",\"antHoleDurationSeconds\":"
            << std::chrono::duration<double>(g.ant_hole_duration).count()
            << ",\"pauseWhenAllInside\":" << (g.pause_when_all_inside ? "true" : "false")
            << ",\"pvpSpawnIntervalSeconds\":"
            << std::chrono::duration<double>(r.pvp_spawn_interval).count()
            << ",\"pvpMobLimit\":" << r.pvp_mob_limit
            << ",\"pvpMinimumLevel\":" << pvp_minimum_level() << ",\"basicThresholds\":[";
  for (unsigned i = 0; i < 4; ++i) {
    std::cout << (i ? "," : "") << detail::w5_pvp_basic_thresholds[i];
  }
  std::cout << "],\"gardenPopulation\":[" << detail::w5_ant_baby_count << ','
            << detail::w5_ant_worker_count << ',' << detail::w5_ant_soldier_count << ','
            << detail::w5_ant_queen_count << "],\"firePopulation\":" << detail::w5_fire_count
            << ",\"diggerPercent\":" << detail::w5_digger_percent
            << ",\"pvpBaseRadius\":" << pvp_arena_radius(1)
            << ",\"pvpAdditionalRadius\":" << pvp_arena_radius(2) - pvp_arena_radius(1)
            << ",\"pvpArenaResizeSpeed\":" << r.pvp_arena_resize_speed_per_second
            << ",\"pvpWaveEquivalent\":" << detail::w5_pvp_wave_equivalent << ",\"pvpMobPool\":[";
  bool comma = false;
  for (const auto mob : detail::w5_pvp_mob_pool) {
    auto name = mob == Mob::dark_ladybug
                    ? std::string("dark_ladybug")
                    : std::string(catalog::mob_name(*catalog::client_mob(mob, Rarity::common)));
    for (auto& c : name) {
      c = c == ' ' ? '_' : char(std::tolower(static_cast<unsigned char>(c)));
    }
    std::cout << (comma ? "," : "") << '"' << name << '"';
    comma = true;
  }
  std::cout << "],\"backgrounds\":{";
  const std::array names{"garden", "desert", "ocean", "pvp", "antHole", "fireAntBurrow"};
  for (unsigned i = 0; i < names.size(); ++i) {
    const auto rgb =
        scene_background(i == 3 ? Mode::pvp : Mode::waves, i < 3 ? Biome(i) : Biome::garden,
                         i == 4   ? std::optional{Mob::ant_hole}
                         : i == 5 ? std::optional{Mob::fire_ant_burrow}
                                  : std::nullopt);
    std::cout << (i ? "," : "") << '\"' << names[i] << "\":[" << unsigned(rgb[0]) << ','
              << unsigned(rgb[1]) << ',' << unsigned(rgb[2]) << ']';
  }
  std::cout << "}}}\n";
}
}
int main(int argc, char** argv) {
  try {
    if (argc == 2 && std::string_view(argv[1]) == "--parameters") {
      parameters();
      return 0;
    }
    std::vector<std::string> passed;
    const auto run = [&](auto fn, std::initializer_list<const char*> ids) {
      fn();
      for (const auto id : ids) {
        passed.emplace_back(id);
      }
    };
    run(scene_colors, {"W5-COLORS"});
    run(ant_enter_rarity, {"W5-ANT-ENTER", "W5-ANT-RARITY"});
    run(ant_split_lifecycle, {"W5-ANT-SPLIT", "W5-ANT-LIFECYCLE"});
    run(
        [] {
          ant_close(false);
          ant_economy();
        },
        {"W5-ANT-CLEAR"});
    run([] { ant_close(true); }, {"W5-ANT-TIMEOUT"});
    run(
        [] {
          ant_fire();
          fire_economy();
        },
        {"W5-ANT-FIRE"});
    run(ant_digger, {"W5-ANT-DIGGER"});
    run(pvp_combat_score, {"W5-PVP-COMBAT", "W5-PVP-SCORE"});
    run(pvp_spawning_resize_magnet, {"W5-PVP-SPAWNING", "W5-PVP-RESIZE", "W5-PVP-MAGNET"});
    run(pvp_boundaries, {"W5-PVP-BASIC-BOUNDARIES"});
    run(pvp_smooth_resize, {"W5-PVP-SMOOTH-RESIZE"});
    run(pvp_kill_preserves_movement, {"W5-PVP-KILL-MOVEMENT"});
    run(pvp_death_reentry, {"W5-PVP-REENTRY"});
    run(
        [] {
          pvp_economy_entry();
          pvp_reconnect();
        },
        {"W5-PVP-ECONOMY", "W5-PVP-ENTRY"});
    std::cout << "{\"passedAcceptanceIds\":[";
    for (std::size_t i = 0; i < passed.size(); ++i) {
      std::cout << (i ? "," : "") << '"' << passed[i] << '"';
    }
    std::cout << "]}\n";
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
