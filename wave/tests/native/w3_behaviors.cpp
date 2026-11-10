#include "catalog/catalog.hpp"
#include "sim/match.hpp"

#include <cmath>
#include <iostream>
#include <set>
#include <stdexcept>

namespace wave::sim {
struct FixtureAccess {
  static detail::Entity& get(Match& m, EntityId id) {
    auto* e = m.entities_.get(id);
    if (!e) {
      throw std::runtime_error("missing fixture entity");
    }
    return *e;
  }
  static bool exists(Match& m, EntityId id) { return m.entities_.get(id); }
  static EntityId spawn(Match& m, Mob kind, Rarity rarity = Rarity::common, Vec2 at = {100, 0},
                        Group group = Group::summon, std::uint32_t wave = 0) {
    return m.spawn_mob(kind, rarity, at, group, {}, wave);
  }
  static double hit(Match& m, EntityId target, EntityId source, double amount,
                    HealthKind kind = HealthKind::contact) {
    const auto s = get(m, source).view;
    return m.apply_health(target, {source, s.owner, s.faction, s.damage_origin}, kind, amount);
  }
  static void poison(Match& m, EntityId target, EntityId source, double amount, Tick duration) {
    const auto s = get(m, source).view;
    m.impacts_.push_back(
        {target, {source, s.owner, s.faction}, HealthKind::contact, 1, amount, duration});
    m.apply_impacts();
  }
  static void contacts(Match& m) {
    m.resolve_contacts();
    m.apply_impacts();
    m.finish_projectiles();
  }
  static void reap(Match& m) { m.reap_deaths(); }
  static void constrain(Match& m) { m.constrain_segments(); }
  static void seed(Match& m, std::uint32_t seed) { m.rng_.seed(seed); }
  static void chain(Match& m, EntityId target, EntityId source, unsigned hops) {
    const auto s = get(m, source).view;
    m.chain_attack(target, {source, s.owner, s.faction}, 10, hops, 40);
    m.apply_impacts();
  }
  static void main_wave(Match& m, EntityId id) {
    auto& e = get(m, id);
    e.view.group = Group::main_mob;
    e.view.origin_wave = m.wave_.number;
    ++m.wave_.counts.alive;
  }
  static void plan(Match& m, std::uint32_t number) { m.open_wave(number - 1, m.tick_); }
};
}
namespace {
using namespace wave;
using namespace sim;
void check(bool ok, const char* reason) {
  if (!ok) {
    throw std::runtime_error(reason);
  }
}
void near(double a, double b, const char* reason) {
  check(std::abs(a - b) < 1e-6, reason);
}
Rules arena() {
  auto r = garden_rules();
  r.progressive_waves = false;
  r.arena_radius = 1000;
  r.player.health = 10000;
  r.player.contact_damage = 0;
  r.orbit_rad_per_second = 0;
  r.contact_knockback_speed = 0;
  r.knockback_retention = 0;
  r.special_chance = 0;
  r.waves = {{1, {Mob::rock}, Rarity::common, 1, {{0, 1}}, 100000}};
  r.spawn_points = {{900, 0}};
  r.remaining_threshold = 0;
  r.advance_on_deadline = false;
  return r;
}
void steps(Match& m, Tick n = 1) {
  while (n--) {
    check(m.step(), "fixture must stay active");
  }
}
PlayerView owner(Match& m, unsigned i = 0) {
  return m.view().players.at(i);
}
EntityId flower(Match& m, unsigned i = 0) {
  return *owner(m, i).body;
}
EntityId petal(Match& m, unsigned i = 0) {
  return *owner(m).petals.at(i).entity;
}
void all_variants() {
  unsigned petals = 0, mobs = 0;
  std::array<double, 6> radii{};
  for (const auto& p : catalog::dated().petals) {
    Match m({1}, 3, arena());
    check(m.add_player({1}, {}, {p.kind}, {p.rarity}), "every petal can be equipped");
    steps(m);
    const bool split = p.kind == Petal::peas || p.kind == Petal::grapes;
    check(owner(m).petals[0].entities.size() == (split ? 1 : p.particles),
          "every variant has exact particle count");
    const auto particle_ids = owner(m).petals[0].entities;
    for (auto id : particle_ids) {
      const auto& e = FixtureAccess::get(m, id);
      near(e.view.max_health, p.body.health * (split ? p.particles : 1), "runtime particle health");
      check(e.view.rarity == p.rarity && e.view.owner == owner(m).life, "rarity and attribution");
    }
    check(m.queue({owner(m).life, {}, true, false}), "all petal input paths");
    steps(m, static_cast<Tick>(std::ceil(p.activation_seconds / .025)) + 2);
    for (const auto& e : m.view().entities) {
      check(e.position.finite() && e.health >= 0 && e.health <= e.max_health,
            "finite valid runtime state");
    }
    ++petals;
  }
  for (const auto& mob : catalog::dated().mobs) {
    Match m({2}, 9, arena());
    m.add_player({1}, {}, {});
    steps(m);
    const auto id = FixtureAccess::spawn(m, mob.kind, mob.rarity);
    const auto& body = FixtureAccess::get(m, id).view;
    near(body.max_health, mob.body.health, "all mob health variants");
    const bool smaller =
        mob.kind == Mob::spider || mob.kind == Mob::leech || mob.kind == Mob::leech_segment;
    const double scale = smaller ? .75 : 1.;
    auto& size = radii.at(static_cast<unsigned>(mob.rarity));
    if (size == 0) {
      size = body.radius / scale;
    }
    near(body.radius, size * scale, "mob radii match their tier and species scale");
    near(FixtureAccess::get(m, id).rules.contact_damage, mob.body.contact_damage,
         "all mob damage variants");
    steps(m, 22);
    check(catalog::client_mob(mob.kind, mob.rarity) == mob.client_id, "all mob IDs project");
    ++mobs;
  }
  check(petals == 270 && mobs == 210, "480 runtime variants exercised");
  check(std::ranges::adjacent_find(radii, std::greater_equal{}) == radii.end(),
        "mob radius increases at every rarity");
}

void pursuit_speeds() {
  for (const auto kind : {Mob::spider, Mob::leech, Mob::jellyfish}) {
    Match m({50}, 7, arena());
    check(m.add_player({1}, {}, {}), "admit player for pursuit");
    steps(m);
    const auto mob = FixtureAccess::spawn(m, kind, Rarity::rare, {65, 0});
    check(m.queue({owner(m).life, {-1, 0}, false, false}), "run away at full speed");
    steps(m, 4);
    const auto player_speed = FixtureAccess::get(m, flower(m)).view.velocity.length();
    const auto& pursuer = FixtureAccess::get(m, mob).view;
    const double ratio = kind == Mob::jellyfish ? .9 : 1.1;
    check(pursuer.velocity.x < 0, "mob is chasing the player");
    near(pursuer.velocity.length(), player_speed * ratio, "pursuit speed relative to the player");
  }
}
void poison_and_slow() {
  Match m({3}, 4, arena());
  m.add_player({1}, {}, {Petal::pincer, Petal::pincer});
  steps(m);
  const auto mob = FixtureAccess::spawn(m, Mob::beetle, Rarity::common, {100, 100});
  FixtureAccess::poison(m, mob, petal(m), 2, 100);
  FixtureAccess::poison(m, mob, petal(m, 1), 1, 10);
  auto& t = FixtureAccess::get(m, mob);
  check(t.poisons.size() == 1 && t.poisons[0].amount == 2 && t.poisons[0].remaining == 99,
        "weaker poison cannot replace remaining stronger poison");
  FixtureAccess::poison(m, mob, petal(m, 1), 3, 100);
  check(t.poisons.size() == 1 && t.poisons[0].source.entity == petal(m, 1),
        "stronger poison replaces attribution");
  t.poisons.clear();
  for (auto id : {petal(m), petal(m, 1)}) {
    auto& e = FixtureAccess::get(m, id);
    e.view.position = t.view.position;
    e.ready_tick = 0;
  }
  FixtureAccess::contacts(m);
  check(t.slows.size() == 1 && !t.slows[0].slows_attacks, "Pincers share a single movement slow");
  near(t.slows[0].multiplier, .2, "historical eighty percent Pincer slow");
}
void health_effects() {
  Match m({4}, 4, arena());
  m.add_player({1}, {}, {Petal::shell, Petal::sponge, Petal::salt, Petal::fangs});
  steps(m, 41);
  const auto body = flower(m);
  auto& b = FixtureAccess::get(m, body);
  near(b.view.shield, 8, "Shell shields and is consumed");
  check(!owner(m).petals[0].entity, "useful shell enters reload");
  const auto enemy = FixtureAccess::spawn(m, Mob::beetle);
  auto& e = FixtureAccess::get(m, enemy);
  e.view.health = e.view.max_health = 10000;
  FixtureAccess::hit(m, body, enemy, 108);
  near(b.view.health, 9990, "shield before Sponge immediate ten percent");
  near(b.deferred[0].remaining, 90, "Sponge retains remaining ninety percent");
  near(e.view.health, 9996.5, "Salt reflects immediate health damage once");
  check(m.equip({1}, 1, Petal::none), "remove Sponge");
  near(b.view.health, 9900, "removing Sponge immediately flushes debt");
  check(b.deferred.empty(), "no duplicate deferred debt");
  FixtureAccess::hit(m, enemy, petal(m, 3), 20);
  near(b.view.health, 9920, "Fangs heals from actual inflicted damage");
  b.heal_block_until = m.view().next_tick + 20;
  FixtureAccess::hit(m, body, body, 100, HealthKind::heal);
  near(b.view.health, 9920, "healing suppression blocks all healing");
}
void ground_and_revive() {
  {
    Match m({5}, 1, arena());
    m.add_player({1}, {}, {Petal::pollen});
    steps(m);
    const auto id = petal(m);
    m.queue({owner(m).life, {}, true, false});
    steps(m, 20);
    const auto at = FixtureAccess::get(m, id).view.position;
    m.queue({owner(m).life, {}, false, false});
    steps(m, 80);
    check(FixtureAccess::get(m, id).view.position == at, "Pollen stays stationary on the ground");
    steps(m, 120);
    check(!FixtureAccess::exists(m, id), "Pollen expires after five seconds");
  }
  {
    Match m({6}, 1, arena());
    m.add_player({1}, {}, {Petal::yggdrasil});
    m.add_player({2}, {100, 0}, {});
    steps(m);
    FixtureAccess::get(m, flower(m, 1)).view.health = 0;
    FixtureAccess::reap(m);
    steps(m);
    const auto id = petal(m);
    const auto at = FixtureAccess::get(m, id).view.position;
    check(FixtureAccess::get(m, id).held, "Yggdrasil drops on teammate death");
    m.queue({owner(m).life, {1, 0}, false, false});
    steps(m, 599);
    check(owner(m, 1).state == LifeState::waiting, "Yggdrasil waits full ground activation");
    steps(m);
    check(owner(m, 1).state == LifeState::alive, "Yggdrasil revives before next wave");
    check(FixtureAccess::get(m, flower(m, 1)).view.position == at,
          "revive at dropped leaf location");
  }
}
void lightning_and_passives() {
  Match m({7}, 1, arena());
  m.add_player({1}, {},
               {Petal::magnet, Petal::antennae, Petal::antennae, Petal::cutter, Petal::soil},
               {Rarity::common, Rarity::common, Rarity::mythic, Rarity::common, Rarity::common});
  steps(m);
  const auto body = flower(m);
  near(owner(m).vision_multiplier,
       catalog::dated().petal(Petal::antennae, Rarity::mythic)->mechanics.vision_multiplier,
       "Antennae uses highest multiplier without stacking");
  near(owner(m).pickup_multiplier, 2.5, "Magnet pickup multiplier");
  near(FixtureAccess::get(m, body).rules.contact_damage, 20, "Cutter body damage");
  near(FixtureAccess::get(m, body).view.max_health, 10050, "Soil max health");
  const auto jelly = FixtureAccess::spawn(m, Mob::jellyfish, Rarity::common, {70, 0});
  const auto before = FixtureAccess::get(m, body).view.health;
  const auto magnet = petal(m);
  FixtureAccess::chain(m, body, jelly, 0);
  check(std::ranges::any_of(m.events(), [&](const Event& event) {
          const auto* arc = std::get_if<LightningArc>(&event.data);
          return arc && arc->from == FixtureAccess::get(m, jelly).view.position &&
                 arc->to == FixtureAccess::get(m, magnet).view.position;
        }),
        "lightning emits the arc to the actual redirected target");
  near(FixtureAccess::get(m, body).view.health, before,
       "Magnet intercepts lightning aimed at flower");
  near(FixtureAccess::get(m, magnet).view.health, 5, "Magnet takes intercepted lightning");
  check(FixtureAccess::get(m, magnet).stun_until > m.view().next_tick,
        "lightning stops velocity briefly");
}

void biome_progression() {
  for (const auto biome : {Biome::garden, Biome::desert, Biome::ocean}) {
    auto rules = scenario_rules(biome);
    rules.special_chance = 0;
    const auto opening = rules.waves.front().eligible;
    const auto unlocked = biome == Biome::garden ? Mob::ant_hole
                          : biome == Biome::desert ? Mob::fire_ant_burrow
                                                   : Mob::leech;
    check(std::ranges::find(opening, unlocked) == opening.end(), "late mob locked at start");
    const auto fourth = wave_rules_at(rules, 3);
    check(std::ranges::find(fourth.eligible, unlocked) != fourth.eligible.end(),
          "late mob unlocked on wave four");
    // Force the first spawn batch to finish with four or fewer mobs alive.
    rules.waves[0].batches = {{0, 2}};
    rules.waves[0].budget = 2;
    Match match({42}, 99, rules);
    check(match.add_player({1}, {}, {}), "admit biome player");
    steps(match);
    const auto view = match.view();
    check(view.biome == biome && view.wave.number == 2 && view.previous_wave->counts.carried == 2,
          "live monsters are carried into the next wave");
    for (const auto& slot : view.previous_wave->plan) {
      check(slot.entity && FixtureAccess::get(match, *slot.entity).view.group == Group::residual,
            "same mob entity remains on the ground across transition");
    }
    const auto mythic_health = [&](std::uint32_t wave) {
      const auto id = FixtureAccess::spawn(match, unlocked, Rarity::mythic, {150, 0},
                                           Group::summon, wave);
      return FixtureAccess::get(match, id).view.max_health;
    };
    check(mythic_health(100) > mythic_health(61) && mythic_health(300) > mythic_health(100),
          "monsters keep getting stronger after reaching Mythic");
  }
}

void wave_rarity_progression() {
  struct Band {
    std::uint32_t first, last;
    std::array<unsigned, 6> expected;
  };
  const Band bands[]{
      {1, 6, {75, 25, 0, 0, 0, 0}},
      {7, 14, {0, 65, 35, 0, 0, 0}},
      {15, 22, {0, 25, 65, 10, 0, 0}},
      {23, 30, {0, 10, 25, 55, 10, 0}},
      {31, 40, {0, 0, 15, 45, 30, 10}},
      {41, max_wave_number, {0, 0, 0, 30, 50, 20}},
  };
  auto rules = garden_rules();
  rules.special_chance = 0;
  Match match({44}, 99, rules);
  for (const auto& band : bands) {
    for (const auto number : {band.first, band.last}) {
      std::array<unsigned, 6> counts{};
      for (unsigned i = 0; i < 100; ++i) {
        ++counts.at(static_cast<unsigned>(wave_rarity(number, (i + .5) / 100)));
      }
      check(counts == band.expected, "each wave band has the expected rarity odds");

      const auto before = match.events().size();
      FixtureAccess::plan(match, number);
      const auto wave = match.view().wave;
      check(wave.number == number && !wave.plan.empty() &&
                std::ranges::all_of(wave.plan, [&band](const SpawnSlot& slot) {
                  return band.expected.at(static_cast<unsigned>(slot.rarity)) > 0;
                }),
            "the live wave plan only uses its band's rarities");
      const auto rolls = std::ranges::count_if(match.events().subspan(before), [](const Event& e) {
        const auto* roll = std::get_if<RandomDraw>(&e.data);
        return roll && roll->purpose == DrawPurpose::mob_rarity;
      });
      check(static_cast<std::size_t>(rolls) == wave.plan.size(),
            "each new mob, including those in wave one, gets its own rarity roll");
    }
  }
}
void fixed_bodies_and_missile_death() {
  auto rules = arena();
  rules.player.health = 1;
  Match m({51}, 3, rules);
  m.add_player({1}, {80, 0}, {});
  steps(m);
  const auto nest = FixtureAccess::spawn(m, Mob::ant_hole, Rarity::common, {87, 0});
  auto& stationary = FixtureAccess::get(m, nest);
  stationary.rules.contact_damage = 0;
  stationary.knockback = {100, 50};
  steps(m);
  check(stationary.view.position == Vec2{87, 0} && stationary.view.velocity == Vec2{},
        "Ant Hole stays fixed during overlap and knockback");
  const auto hornet = FixtureAccess::spawn(m, Mob::hornet, Rarity::common, {135, 0});
  steps(m, 20);
  const auto& head = FixtureAccess::get(m, hornet).view;
  steps(m);
  const auto view = m.view();
  const auto missile = std::ranges::find(view.entities, hornet, &EntityView::damage_origin);
  check(missile != view.entities.end(), "first Hornet missile was fired");
  const Vec2 forward{std::cos(head.heading_rad), std::sin(head.heading_rad)};
  near((missile->position - head.position -
        forward * (head.radius + missile->radius)).length(), 0, "missile begins in front of the head");
  check(missile->damage_mob == MobIdentity{Mob::hornet, Rarity::common},
        "missile retains its Hornet identity");
  // Remove the emitter before its missile lands. Attribution cannot rely on
  // resolving the emitter's now stale entity handle.
  FixtureAccess::hit(m, hornet, flower(m), 10000);
  FixtureAccess::reap(m);
  for (int i = 0; i < 40 && owner(m).body; ++i) {
    steps(m);
  }
  const auto fallen = owner(m);
  check(!fallen.body && fallen.death_position && fallen.death_position->x > 70 &&
            fallen.killer == MobIdentity{Mob::hornet, Rarity::common},
        "death retains its actual position and the departed missile's emitter");
}

void monsters() {
  Match m({8}, 1, arena());
  m.add_player({1}, {}, {});
  steps(m);
  const auto digger = FixtureAccess::spawn(m, Mob::digger, Rarity::common, {100, 0});
  const auto beetle = FixtureAccess::spawn(m, Mob::beetle, Rarity::common, {120, 0});
  steps(m);
  check(FixtureAccess::get(m, digger).view.faction == Faction::team &&
            FixtureAccess::get(m, digger).target == beetle &&
            std::ranges::any_of(m.view().entities, &EntityView::digger_attacking),
        "Digger attacks hostile mobs and spins its gears");
  auto& d = FixtureAccess::get(m, digger);
  d.view.health = d.view.max_health * .1;
  steps(m);
  check(!d.target && d.view.velocity.x > 0 &&
            std::ranges::none_of(m.view().entities, &EntityView::digger_attacking),
        "injured Digger retreats to arena edge and leaves the attack pose");
  const auto hornet = FixtureAccess::spawn(m, Mob::hornet, Rarity::rare, {50, 0});
  steps(m, 22);
  bool bullet = false;
  for (const auto& e : m.view().entities) {
    if (e.damage_origin == hornet) {
      bullet = true;
      near(e.max_health, catalog::dated().mob(Mob::hornet, Rarity::rare)->missile_health,
           "exact hornet missile HP");
    }
  }
  check(bullet, "Hornet emits an attributed missile");
  const auto hole = FixtureAccess::spawn(m, Mob::ant_hole, Rarity::common, {-150, 0});
  steps(m, 180);
  check(FixtureAccess::get(m, hole).spawn_count == 0,
        "unattacked Ant Hole does not continuously spawn");
  FixtureAccess::hit(m, hole, flower(m), 10);
  steps(m);
  check(FixtureAccess::get(m, hole).spawn_count > 0, "Ant Hole responds to damage");
  const auto burrow = FixtureAccess::spawn(m, Mob::fire_ant_burrow, Rarity::common, {0, 20});
  near(FixtureAccess::hit(m, burrow, flower(m), 100000), 0, "Fire Ant Burrow is invulnerable");
  steps(m, 22);
  check(!FixtureAccess::exists(m, burrow), "nearby burrow releases ants then disappears");
  unsigned ants = 0;
  for (const auto& e : m.view().entities) {
    ants += e.mob == Mob::fire_ant;
  }
  check(ants == 30, "exact thirty-ant Common burrow release");
}

void digger_after_ant_hole() {
  for (const auto biome : {Biome::garden, Biome::desert, Biome::ocean}) {
    const auto rules = scenario_rules(biome);
    for (std::size_t wave = 0; wave < 80; ++wave) {
      const auto eligible = wave_rules_at(rules, wave).eligible;
      check(std::ranges::find(eligible, Mob::digger) == eligible.end(),
            "Digger is absent from every ordinary spawn pool");
    }
  }
  for (const auto [rarity, wins_roll] :
       {std::pair{Rarity::common, true}, std::pair{Rarity::rare, true},
        std::pair{Rarity::rare, false}}) {
    Match m({53}, 1, arena());
    check(m.add_player({1}, {}, {}), "admit the ant hole fixture player");
    steps(m);
    // The first draw after resetting the generator lands in the required bucket.
    std::uint32_t seed = 0;
    while ((std::mt19937(seed)() % 100 < 2) != wins_roll) {
      ++seed;
    }
    FixtureAccess::seed(m, seed);
    const auto hole = FixtureAccess::spawn(m, Mob::ant_hole, rarity, {25, 0});
    const auto nest_position = FixtureAccess::get(m, hole).view.position;
    if (rarity == Rarity::common) {
      FixtureAccess::hit(m, hole, flower(m), 1e5);
    }
    const auto rolls = [&] {
      return std::ranges::count_if(m.events(), [](const auto& e) {
        const auto* draw = std::get_if<RandomDraw>(&e.data);
        return draw && draw->purpose == DrawPurpose::digger_spawn;
      });
    };
    steps(m);
    std::vector<EntityId> defenders;
    for (const auto& e : m.view().entities) {
      if (FixtureAccess::get(m, e.id).root == hole) {
        defenders.push_back(e.id);
      }
    }
    check(defenders.size() == 40 && rolls() == 0, "the nest releases defenders before any roll");
    check(FixtureAccess::exists(m, hole) == (rarity >= Rarity::rare),
          "early destruction of a Common hole does not forget its defenders");
    for (std::size_t i = 1; i < defenders.size(); ++i) {
      FixtureAccess::get(m, defenders[i]).view.health = 0;
    }
    for (int tick = 0; tick < 20; ++tick) {
      steps(m);
      check(rolls() == 0, "no Digger roll while even one defender survives");
    }
    FixtureAccess::get(m, defenders.front()).view.health = 0;
    steps(m);
    check(!FixtureAccess::exists(m, hole) && rolls() == 1, "clearing the nest rolls once");
    const auto view = m.view();
    const auto digger = std::ranges::find(view.entities, Mob::digger, &EntityView::mob);
    check((digger != view.entities.end()) == wins_roll, "the roll controls whether Digger spawns");
    if (wins_roll) {
      check(digger->position == nest_position && digger->rarity == rarity &&
                digger->faction == Faction::team && digger->health == digger->max_health,
            "Digger appears at the cleared nest with full health as an ally");
    }
    for (int tick = 0; tick < 12; ++tick) {
      steps(m);
      check(rolls() == 0, "a cleared nest cannot roll again");
    }
  }
}
void remaining_petals() {
  for (auto kind : {Petal::yucca, Petal::starfish}) {
    Match m({10}, 1, arena());
    m.add_player({1}, {}, {kind});
    steps(m);
    const auto id = flower(m);
    FixtureAccess::get(m, id).view.health = 4000;
    const auto rate = catalog::dated().petal(kind, Rarity::common)->passive_heal_per_second * .025;
    steps(m);
    near(FixtureAccess::get(m, id).view.health, kind == Petal::yucca ? 4000 : 4000 + rate,
         "conditional healing uses correct activation");
    if (kind == Petal::starfish) {
      FixtureAccess::get(m, petal(m)).view.health = 0;
      FixtureAccess::reap(m);
      const auto before = FixtureAccess::get(m, id).view.health;
      steps(m);
      near(FixtureAccess::get(m, id).view.health, before + rate, "Starfish heals during recharge");
    } else {
      m.queue({owner(m).life, {}, false, true});
      steps(m);
      near(FixtureAccess::get(m, id).view.health, 4000 + rate, "Yucca heals only in defense");
    }
  }
  {
    Match m({11}, 1, arena());
    m.add_player({1}, {}, {Petal::wing, Petal::bubble});
    steps(m);
    near(FixtureAccess::get(m, petal(m)).view.position.length(), 14, "Wing stays on idle orbit");
    m.queue({owner(m).life, {}, true, false});
    steps(m);
    check(FixtureAccess::get(m, petal(m)).view.position.length() >
              catalog::dated().petal(Petal::wing, Rarity::common)->mechanics.attack_distance,
          "Wing oscillates beyond its attack range");
    const auto bubble = petal(m, 1);
    m.queue({owner(m).life, {}, false, true});
    steps(m, 20);
    check(!FixtureAccess::exists(m, bubble), "Bubble consumed on defend");
    check(FixtureAccess::get(m, flower(m)).view.position.length() > 0,
          "Bubble actually propels owner");
  }
  {
    auto rules = arena();
    rules.orbit_rad_per_second = 1;
    Match m({12}, 1, rules);
    m.add_player({1}, {}, {Petal::yin_yang});
    steps(m, 2);
    near(FixtureAccess::get(m, petal(m)).view.heading_rad, -.025, "Yin Yang reverses rotation");
  }
  for (const auto kind : {Petal::claw, Petal::jelly, Petal::heavy}) {
    Match m({13}, 1, arena());
    m.add_player({1}, {}, {kind});
    steps(m);
    const auto p = petal(m);
    const auto at = FixtureAccess::get(m, p).view.position;
    const auto t = FixtureAccess::spawn(m, Mob::beetle, Rarity::common, at + Vec2{1, 0});
    auto& target = FixtureAccess::get(m, t);
    target.view.health = target.view.max_health = 1000;
    target.rules.contact_damage = 0;
    FixtureAccess::contacts(m);
    if (kind == Petal::claw) {
      near(target.view.health, 900, "Claw adds bounded remaining-health damage");
    } else {
      check(target.knockback.length() > 0, "Jelly and Heavy impart knockback");
    }
  }
  {
    Match m({14}, 1, arena());
    m.add_player({1}, {}, {Petal::dandelion});
    steps(m);
    const auto p = petal(m);
    m.queue({owner(m).life, {}, true, false});
    steps(m, 20);
    const auto t =
        FixtureAccess::spawn(m, Mob::rock, Rarity::common, FixtureAccess::get(m, p).view.position);
    FixtureAccess::get(m, t).rules.contact_damage = 0;
    FixtureAccess::contacts(m);
    check(!FixtureAccess::exists(m, p) &&
              FixtureAccess::get(m, t).heal_block_until > m.view().next_tick,
          "Dandelion contact consumes projectile and suppresses healing");
  }
  {
    Match m({15}, 1, arena());
    m.add_player({1}, {}, {Petal::pearl});
    steps(m);
    const auto p = petal(m);
    m.queue({owner(m).life, {}, true, false});
    steps(m, 21);
    check(owner(m).petals[0].entity == p && FixtureAccess::get(m, p).held,
          "Pearl remains one deployed slot until broken");
    const auto at = FixtureAccess::get(m, p).view.position;
    FixtureAccess::get(m, flower(m)).view.position = {200, 0};
    steps(m);
    check(FixtureAccess::get(m, p).view.position != at, "deployed Pearl follows distant owner");
  }
  {
    Match m({16}, 1, arena());
    m.add_player({1}, {}, {Petal::uranium});
    steps(m);
    const auto p = petal(m);
    const auto at = FixtureAccess::get(m, p).view.position;
    const auto t = FixtureAccess::spawn(m, Mob::ladybug, Rarity::common, at + Vec2{49, 0});
    const auto bubble = FixtureAccess::spawn(m, Mob::bubble, Rarity::common, at + Vec2{0, 40});
    for (auto id : {t, bubble}) {
      auto& e = FixtureAccess::get(m, id);
      e.rules.speed_per_second = 0;
      e.view.health = e.view.max_health = 1000;
    }
    steps(m, 40);
    check(FixtureAccess::get(m, t).view.health < 1000 && FixtureAccess::get(m, t).provoked,
          "Uranium radiates from petal position and provokes passive mobs");
    check(!FixtureAccess::get(m, bubble).provoked, "Bubble immune to Uranium provocation");
    near(FixtureAccess::get(m, flower(m)).view.health, 9980,
         "Uranium self damage is four times original damage");
  }
  {
    Match m({17}, 1, arena());
    m.add_player({1}, {}, {Petal::stick});
    steps(m, 401);
    bool wind = false;
    for (const auto& e : m.view().entities) {
      if (e.mob == Mob::sandstorm && e.faction == Faction::team) {
        const auto& s = FixtureAccess::get(m, e.id);
        wind = s.summon_origin == Petal::stick && s.expires > m.view().next_tick &&
               e.owner == owner(m).life;
      }
    }
    check(wind && !owner(m).petals[0].entity, "Stick consumes into timed, attributed wind summon");
  }
}

void chains() {
  for (const auto kind : {Mob::centipede, Mob::evil_centipede}) {
    Match m({9}, 1, arena());
    m.add_player({1}, {}, {});
    steps(m);
    const auto root = FixtureAccess::spawn(m, kind, Rarity::mythic, {200, 0}, Group::main_mob);
    FixtureAccess::main_wave(m, root);
    const auto initial = m.view();
    std::vector<EntityId> segments;
    for (auto parent = root;;) {
      const auto next = std::ranges::find(initial.entities, parent, &EntityView::predecessor);
      if (next == initial.entities.end()) {
        break;
      }
      segments.push_back(next->id);
      near(next->max_health, catalog::dated().mob(*next->mob, Rarity::mythic)->body.health,
           "segments use their own rarity and exact health");
      near(next->radius, FixtureAccess::get(m, parent).view.radius, "equal segment radii");
      parent = next->id;
    }
    check(segments.size() == 5, "all segment entities spawned");
    const auto head = FixtureAccess::get(m, root).view;
    auto& front = FixtureAccess::get(m, segments[0]).view;
    const auto gap = (front.position - head.position).length();
    const auto compressed = head.position + Vec2{0, -gap / 2};
    front.position = compressed;
    FixtureAccess::constrain(m);
    check(front.position == compressed, "a compressed link is not pushed out or straightened");
    near(front.heading_rad, std::acos(0.), "a link faces its predecessor rather than its heading");
    front.position = head.position + Vec2{-2 * gap, 0};
    FixtureAccess::constrain(m);
    near((front.position - head.position).length(), gap, "a stretched link is shortened");

    FixtureAccess::hit(m, segments[1], flower(m), 20);
    near(FixtureAccess::get(m, root).view.health, head.health, "segment damage leaves head intact");
    FixtureAccess::get(m, segments[1]).view.health = 0;
    FixtureAccess::reap(m);
    const auto tail_start = FixtureAccess::get(m, segments[2]).view.position;
    steps(m, 15);
    const auto tail = FixtureAccess::get(m, segments[2]).view;
    check(front.predecessor == root && !tail.predecessor &&
              FixtureAccess::get(m, segments[3]).view.predecessor == tail.id &&
              (tail.position - tail_start).length() > 1,
          "the detached fragment leads its own moving chain and never reconnects");
    // Kill the entire front fragment together. Wave credit survives in the tail.
    FixtureAccess::get(m, root).view.health = 0;
    front.health = 0;
    FixtureAccess::reap(m);
    check(FixtureAccess::get(m, tail.id).view.group == Group::main_mob &&
              !FixtureAccess::get(m, tail.id).view.predecessor && m.view().wave.counts.defeated == 0,
          "the surviving fragment retains the wave slot without rebuilding links");
    for (const auto id : std::span(segments).subspan(2)) {
      FixtureAccess::get(m, id).view.health = 0;
      FixtureAccess::reap(m);
    }
    const auto rewards = std::ranges::count_if(m.events(), [&](const auto& event) {
      if (const auto* d = std::get_if<Defeat>(&event.data)) {
        return d->group == Group::main_mob && d->mob == kind;
      }
      return false;
    });
    check(rewards == 1 && m.view().wave.counts.defeated == 1,
          "the whole severed chain yields exactly one wave credit and root reward");
  }
}

void chains_stay_inside_arena() {
  for (const auto kind : {Mob::centipede, Mob::evil_centipede, Mob::desert_centipede, Mob::leech}) {
    auto rules = arena();
    rules.arena_radius = 200;
    rules.spawn_points = {{0, -150}};
    Match m({52}, 1, rules);
    check(m.add_player({1}, {110, 0}, {}), "admit player inside the rim");
    steps(m);
    const auto root = FixtureAccess::spawn(m, kind, Rarity::mythic, {200, 0});
    auto& head = FixtureAccess::get(m, root);
    head.provoked = true;
    const auto start = m.view();
    const auto first = std::ranges::find(start.entities, root, &EntityView::predecessor);
    check(first != start.entities.end(), "spawned first body segment");
    const double spacing = (head.view.position - first->position).length();
    // Bend the chain at the rim with the first link bunched and the next stretched.
    FixtureAccess::get(m, first->id).view.position = head.view.position + Vec2{-.1, 1};
    for (int tick = 0; tick < 20; ++tick) {
      steps(m);
      for (const auto& e : m.view().entities) {
        if (e.mob) {
          check(e.position.length() + e.radius <= rules.arena_radius + 1e-6,
                "the entire mob body stays in the arena");
        }
        if (e.predecessor) {
          const auto& parent = FixtureAccess::get(m, *e.predecessor).view;
          check((e.position - parent.position).length() <= spacing + 1e-6,
                "turning at the rim keeps each link within reach");
        }
      }
    }
  }
}

void leech_shared_health() {
  Match m({49}, 1, arena());
  m.add_player({1}, {}, {});
  steps(m);
  const auto attacker = flower(m);
  const auto root = FixtureAccess::spawn(m, Mob::leech, Rarity::rare, {100, 0}, Group::main_mob);
  FixtureAccess::main_wave(m, root);
  const auto other = FixtureAccess::spawn(m, Mob::leech, Rarity::rare, {400, 0});
  const auto max_health = catalog::dated().mob(Mob::leech, Rarity::rare)->body.health;
  const auto check_chain = [&](double health) {
    const auto view = m.view();
    std::vector<EntityId> result;
    auto parent = std::ranges::find(view.entities, root, &EntityView::id);
    while (parent != view.entities.end()) {
      near(parent->health, health, "every Leech section has the same current health");
      near(parent->max_health, max_health, "every Leech section uses the head's maximum health");
      result.push_back(parent->id);
      const auto child = std::ranges::find(view.entities, parent->id, &EntityView::predecessor);
      if (child != view.entities.end()) {
        check(child->mob == Mob::leech_segment &&
                  (child->position - parent->position).length() <= child->radius + parent->radius,
              "Leech body uses segment identity and stays physically joined");
      }
      parent = child;
    }
    return result;
  };
  steps(m);
  const auto original = check_chain(max_health);
  check(original.size() == 6, "Leech spawns one head and five connected body sections");
  FixtureAccess::hit(m, original[2], attacker, 20);
  steps(m);
  check(check_chain(max_health - 20) == original, "a nonlethal hit leaves the chain intact");
  FixtureAccess::hit(m, root, attacker, 5);
  FixtureAccess::hit(m, attacker, original.back(), 3);
  check(check_chain(max_health - 22) == original, "head damage and tail lifesteal share health");

  const auto before_lightning = m.events().size();
  FixtureAccess::chain(m, original[2], attacker, 2);
  std::vector<EntityId> struck;
  for (const auto& event : m.events().subspan(before_lightning)) {
    if (const auto* hit = std::get_if<HealthChange>(&event.data)) {
      check(std::ranges::find(original, hit->target) != original.end() &&
                std::ranges::find(struck, hit->target) == struck.end(),
            "each lightning hit lands on a distinct section of the same Leech");
      struck.push_back(hit->target);
    }
  }
  check(struck.size() == 3 && check_chain(max_health - 52) == original,
        "three lightning hits deal three times the damage to one shared health pool");
  near(FixtureAccess::get(m, other).view.health, max_health, "each Leech has its own health pool");

  FixtureAccess::hit(m, original.back(), attacker, max_health);
  FixtureAccess::reap(m);
  check(std::ranges::none_of(original, [&](EntityId id) { return FixtureAccess::exists(m, id); }),
        "a lethal hit to the tail removes the whole Leech in the same tick");
  unsigned defeats = 0;
  for (const auto& event : m.events()) {
    if (const auto* defeat = std::get_if<Defeat>(&event.data)) {
      check(defeat->entity == root && defeat->mob == Mob::leech &&
                defeat->source.entity == attacker && defeat->credit == PlayerId{1},
            "the whole Leech defeat credits the player who landed the tail hit");
      ++defeats;
    }
  }
  check(defeats == 1 && m.view().wave.counts.defeated == 1,
        "the Leech produces one defeat and one wave credit");
}
void timing_and_debts() {
  for (const auto us : {25000, 50000, 100000}) {
    auto r = arena();
    r.timing.step = Microseconds(us);
    Match m({20}, 1, r);
    m.add_player({1}, {}, {});
    steps(m);
    const auto star = FixtureAccess::spawn(m, Mob::starfish, Rarity::rare, {250, 0});
    auto& s = FixtureAccess::get(m, star);
    s.rules.speed_per_second = 0;
    s.view.health = s.view.max_health * .5;
    const auto initial = s.view.health;
    steps(m, 1000000 / us);
    near(s.view.health, initial + s.view.max_health * .02,
         "mob regeneration integrates once per tick for each step size");
  }
  for (const bool lethal : {false, true}) {
    auto r = arena();
    if (lethal) {
      r.player.health = 50;
    }
    Match m({21}, 1, r);
    m.add_player({1}, {}, {Petal::sponge});
    steps(m);
    const auto body = flower(m), sponge = petal(m);
    const auto enemy = FixtureAccess::spawn(m, Mob::rock, Rarity::common, {250, 0});
    FixtureAccess::hit(m, body, enemy, 100);
    FixtureAccess::get(m, sponge).view.health = 0;
    FixtureAccess::reap(m);
    if (lethal) {
      check(owner(m).state == LifeState::waiting && !FixtureAccess::exists(m, body),
            "Sponge break can kill owner in same death pass");
      FixtureAccess::reap(m);
      unsigned deaths = 0;
      for (const auto& event : m.events()) {
        if (const auto* d = std::get_if<Defeat>(&event.data)) {
          deaths += d->group == Group::player;
        }
      }
      check(deaths == 1, "debt death settles only once");
    } else {
      near(FixtureAccess::get(m, body).view.health, 9900,
           "broken Sponge flushes all outstanding damage immediately");
      check(FixtureAccess::get(m, body).deferred.empty(), "broken Sponge leaves no debts");
      steps(m);
      near(FixtureAccess::get(m, body).view.health, 9900, "settled debt never repeats");
    }
  }
  {
    Match m({22}, 1, arena());
    m.add_player({1}, {}, {Petal::egg}, {Rarity::mythic});
    steps(m, 601);
    std::optional<EntityId> child;
    for (const auto& e : m.view().entities) {
      if (FixtureAccess::get(m, e.id).summon_origin == Petal::egg) {
        child = e.id;
      }
    }
    check(child.has_value(), "Mythic Egg actually hatches");
    const auto& e = FixtureAccess::get(m, *child);
    check(e.view.mob == Mob::beetle && e.view.rarity == Rarity::legendary,
          "Mythic Egg retains observed Legendary contents");
    const auto lifetime = arena().timing.ticks_ceil(Microseconds(static_cast<Microseconds::rep>(
        catalog::dated().petal(Petal::egg, Rarity::mythic)->duration_seconds * 1e6)));
    check(e.expires == e.born_tick + lifetime,
          "summon expiry uses Egg's rarity, not contents rarity");
    check(m.equip({1}, 0, Petal::none), "remove Egg after hatch");
    const auto expiry = e.expires;
    steps(m, expiry - m.view().next_tick);
    check(FixtureAccess::exists(m, *child), "summon alive immediately before expiry tick");
    steps(m);
    check(!FixtureAccess::exists(m, *child), "summon expires exactly at lifetime boundary");
  }
}
void lightning_contacts_and_ant_alert() {
  {
    Match m({23}, 1, arena());
    m.add_player({1}, {}, {Petal::lightning});
    steps(m);
    const auto p = petal(m);
    const auto at = FixtureAccess::get(m, p).view.position;
    const auto hornet = FixtureAccess::spawn(m, Mob::hornet, Rarity::common, {200, 0});
    // A garden missile is a petal entity; Lightning cannot discharge on it.
    auto& bullet = FixtureAccess::get(m, hornet);
    bullet.view.group = Group::petal;
    bullet.view.mob.reset();
    bullet.view.petal = Petal::missile;
    bullet.view.position = at;
    bullet.rules.contact_damage = 0;
    FixtureAccess::contacts(m);
    check(FixtureAccess::exists(m, p) && !FixtureAccess::get(m, p).spent,
          "Lightning does not discharge on missiles");
    bullet.view.position = {500, 0};
    std::vector<EntityId> targets;
    for (unsigned i = 0; i < 4; ++i) {
      const auto id =
          FixtureAccess::spawn(m, Mob::rock, Rarity::common, at + Vec2{double(i) * 15, 0});
      auto& e = FixtureAccess::get(m, id);
      e.view.health = e.view.max_health = 1000;
      e.rules.contact_damage = 0;
      targets.push_back(id);
    }
    FixtureAccess::contacts(m);
    check(!FixtureAccess::exists(m, p), "Lightning discharges once and enters reload");
    unsigned damaged = 0;
    const auto damage =
        catalog::dated().petal(Petal::lightning, Rarity::common)->mechanics.chain_damage;
    for (auto id : targets) {
      const auto hp = FixtureAccess::get(m, id).view.health;
      check(hp == 1000 || std::abs(hp - (1000 - damage)) < 1e-6,
            "each lightning victim hit at most once");
      damaged += hp < 1000;
    }
    check(damaged ==
              1 + catalog::dated().petal(Petal::lightning, Rarity::common)->mechanics.bounces,
          "exact original bounce count");
  }
  {
    Match m({24}, 1, arena());
    m.add_player({1}, {}, {});
    steps(m);
    const auto worker = FixtureAccess::spawn(m, Mob::worker_ant, Rarity::common, {100, 0});
    const auto baby = FixtureAccess::spawn(m, Mob::baby_ant, Rarity::common, {110, 0});
    FixtureAccess::hit(m, baby, flower(m), 1);
    check(FixtureAccess::get(m, worker).provoked &&
              FixtureAccess::get(m, worker).target == flower(m),
          "nearby Worker Ant retaliates when another ant is hit");
    check(!FixtureAccess::get(m, baby).provoked, "Baby Ant itself remains passive");
    const auto queen = FixtureAccess::spawn(m, Mob::queen_ant, Rarity::common, {-100, 0});
    auto& q = FixtureAccess::get(m, queen);
    q.target = flower(m);
    q.view.position = {-250, 0};
    steps(m);
    check(q.returning && !q.target && q.view.velocity.x > 0,
          "Queen Ant drops distant target and returns home");
  }
}
}
int main() {
  const char* phase = "all variants";
  try {
    all_variants();
    phase = "poison/slow";
    poison_and_slow();
    phase = "health";
    health_effects();
    phase = "ground/revive";
    ground_and_revive();
    phase = "lightning/passives";
    lightning_and_passives();
    phase = "monsters";
    monsters();
    phase = "Digger after clearing an Ant Hole";
    digger_after_ant_hole();
    phase = "pursuit speeds";
    pursuit_speeds();
    phase = "static bodies and Hornet attribution";
    fixed_bodies_and_missile_death();
    phase = "remaining petals";
    remaining_petals();
    phase = "chains";
    chains();
    phase = "chains at the arena rim";
    chains_stay_inside_arena();
    phase = "Leech shared health";
    leech_shared_health();
    phase = "timing/debts";
    timing_and_debts();
    phase = "lightning/ant alert";
    lightning_contacts_and_ant_alert();
    phase = "biome progression";
    biome_progression();
    phase = "wave rarity progression";
    wave_rarity_progression();
    std::cout << "W3 behaviors: 270 petals, 210 mobs and special effect regressions passed\n";
  } catch (const std::exception& e) {
    std::cerr << phase << ": " << e.what() << '\n';
    return 1;
  }
}
