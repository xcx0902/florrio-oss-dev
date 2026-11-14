#include "catalog/catalog.hpp"
#include "sim/match.hpp"

#include <cmath>
#include <iostream>
#include <numbers>
#include <set>
#include <stdexcept>
#include <limits>

namespace wave::sim {
struct FixtureAccess {
  static detail::Entity& get(Match& match, EntityId id) { return *match.entities_.get(id); }
  static EntityId spawn(Match& match, Vec2 position, BodyRules body,
                        Faction faction = Faction::hostile, Group group = Group::summon,
                        Mob kind = Mob::bee) {
    EntityView view;
    view.position = position;
    view.faction = faction;
    view.group = group;
    view.mob = kind;
    const auto id = match.add_entity(view, body);
    match.entities_.get(id)->provoked = true;
    return id;
  }
  static void damage(Match& match, EntityId id, double amount) {
    get(match, id).view.health -= amount;
  }
  static void kill(Match& match, EntityId id) {
    auto& entity = get(match, id);
    entity.view.health = 0;
    entity.fatal_hit = DamageSource{};
    match.reap_deaths();
  }
};
}  // namespace wave::sim

using namespace wave;
using namespace wave::sim;
namespace {
void check(bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
void near(double actual, double expected, const char* message) {
  check(std::abs(actual - expected) < 1e-8, message);
}
Rules arena() {
  auto rules = scenario_rules(Biome::garden);
  rules.arena_radius = 500;
  rules.player.health = 100;
  rules.player.contact_damage = 0;
  rules.contact_knockback_speed = 0;
  rules.knockback_retention = 0;
  rules.orbit_rad_per_second = 0;
  rules.special_chance = 0;
  rules.waves = {{1, {Mob::rock}, Rarity::common, 1, {{0, 1}}, 100000}};
  rules.spawn_points = {{400, 0}};
  rules.remaining_threshold = 0;
  rules.advance_on_deadline = false;
  return rules;
}
void steps(Match& match, Tick count) {
  for (Tick i = 0; i < count; ++i) {
    check(match.step(), "match remains running");
  }
}
PlayerView owner(const Match& match, std::size_t index = 0) {
  return match.view().players.at(index);
}
EntityView body(Match& match, std::size_t index = 0) {
  return FixtureAccess::get(match, *owner(match, index).body).view;
}
EntityView petal(Match& match, std::size_t slot = 0) {
  return FixtureAccess::get(match, *owner(match).petals.at(slot).entity).view;
}
void mapping() {
  const auto& c = catalog::dated();
  check(!c.version.empty() && c.sha256.size() == 64 && c.client_wasm_sha256.size() == 64,
        "dated catalog carries source and client identity");
  check(catalog::petal_registry().size() == 46, "46 original kinds including None");
  std::set<Petal> kinds;
  for (unsigned id = 0; id < 46; ++id) {
    const auto kind = catalog::petal_from_client(id);
    check(kind.has_value() && kinds.insert(*kind).second, "unique original registry kind");
    for (unsigned r = 0; r < 6; ++r) {
      check(catalog::client_petal(*kind, Rarity(r)) == id, "full original registry roundtrip");
      check(catalog::client_rarity(Rarity(r)) == r, "all six rarity wire IDs");
    }
  }
  check(!catalog::petal_from_client(46) && !catalog::client_petal(Petal(999)),
        "reject unknown petal ID");
  check(!catalog::client_petal(Petal::basic, Rarity(6)), "no Ultra before cutoff");
  check(c.petals.size() == 270 && c.mobs.size() == 210,
        "45 petals and 35 mob IDs times six rarities");
  for (const auto& p : c.petals) {
    check(catalog::client_petal(p.kind, p.rarity) == p.client_id && p.evidenceKey.size(),
          "every emitted petal mapped");
  }
  for (const auto& m : c.mobs) {
    check(catalog::client_mob(m.kind, m.rarity) == m.client_id, "every emitted mob mapped");
    check(catalog::client_mob(m.kind, m.rarity, Group::summon) == m.client_id, "summon mapping");
    check(catalog::client_mob(m.kind, m.rarity, Group::ant_hole) ==
              (m.kind == Mob::fire_ant_burrow ? 24 : 9),
          "nest role mapping");
    if (m.segment_client_id) {
      check(catalog::client_mob(m.kind, m.rarity, Group::segment) == m.segment_client_id,
            "segment role mapping");
    }
  }
  check(catalog::client_petal(Petal::faster) == 12, "original Faster name and ID");
  check(catalog::level_for_xp(std::numeric_limits<std::uint64_t>::max()) ==
            catalog::level_table().maximum_level,
        "XP beyond the last threshold stays within the client level cap");
}
void damage_rarity_and_reload() {
  const auto hit_and_reload = [](Rarity rarity) {
    Match match({1}, 5, arena());
    check(match.add_player({1}, {}, {Petal::basic}, {rarity}), "admit equipped petal");
    steps(match, 1);
    const auto target =
        FixtureAccess::spawn(match, petal(match).position, {.radius = 1, .health = 1000});
    steps(match, 1);
    const auto health = FixtureAccess::get(match, target).view.health;
    const auto old = petal(match).id;
    FixtureAccess::kill(match, old);
    const auto broken = owner(match).petals[0];
    check(!broken.entity && broken.reload_ticks > 0, "broken petal starts recharging");
    steps(match, broken.reload_ticks);
    check(!owner(match).petals[0].entity, "petal stays gone until its reload tick");
    steps(match, 1);
    check(owner(match).petals[0].entity && *owner(match).petals[0].entity != old,
          "reload gives the petal a new entity ID");
    return health;
  };
  check(hit_and_reload(Rarity::mythic) < hit_and_reload(Rarity::common),
        "contact damage uses the equipped rarity");
}
void unsupported_effects() {
  unsigned rejected = 0;
  for (const auto& row : catalog::petal_registry()) {
    for (unsigned r = 0; r < 6; ++r) {
      const auto rarity = Rarity(r);
      const bool modeled = row.kind == Petal::none || catalog::dated().petal(row.kind, rarity);
      check(catalog::can_equip(row.kind, rarity) == modeled,
            "capability is separate from identity mapping");
      Match admission({100 + row.client_id}, 5, arena());
      check(admission.add_player({1}, {}, {row.kind}, {rarity}) == modeled,
            "all original IDs and rarities enforce supported admission");
      Match live({200 + row.client_id}, 5, arena());
      check(live.add_player({1}, {}, {Petal::basic}), "admit capability fixture");
      steps(live, 1);
      const auto initial = owner(live);
      check(live.set_loadout({1}, {row.kind}, {rarity}) == modeled,
            "live equip agrees with catalog capability");
      if (!modeled) {
        ++rejected;
        check(owner(live).loadout == initial.loadout &&
                  owner(live).petals[0].entity == initial.petals[0].entity,
              "unsupported effect cannot replace or destroy equipped particles");
        check(!live.queue(Equip{initial.life, {row.kind}, {rarity}}),
              "queued unsupported effect also rejects without fallback contact");
      }
    }
  }
  check(rejected == 0, "every original petal effect supports all six rarities");
  check(!catalog::can_equip(Petal::none, Rarity(6)) && !catalog::can_equip(Petal(999)),
        "capability rejects invalid rarity and unknown enum");
}
void rose_and_leaf() {
  {
    Match match({2}, 5, arena());
    check(match.add_player({1}, {}, {Petal::rose, Petal::rose}), "admit roses");
    steps(match, 1);
    const auto life = owner(match).life;
    check(match.queue(Input{life, {}, true, false}), "rose attack input");
    FixtureAccess::damage(match, *owner(match).body, 1);
    steps(match, 39);
    near(body(match).health, 99, "rose waits one second");
    near(petal(match).position.length(), 13, "rose does not expand on attack");
    steps(match, 1);
    near(body(match).health, 99, "rose does not heal before reaching the player");
    check(petal(match).position.length() < 13, "rose visibly leaves its orbit");
    near(petal(match, 1).position.length(), 13, "spare rose stays in orbit");
    steps(match, 7);
    check(petal(match).position.length() < 1, "rose closes in on the player");
    steps(match, 1);
    near(body(match).health, 100, "rose caps useful healing");
    check(!owner(match).petals[0].entity && owner(match).petals[1].entity,
          "only useful rose is consumed");
    check(owner(match).petals[0].reload_ticks == 140, "rose 3.5 second reload");
  }
  {
    Match match({3}, 5, arena());
    check(match.add_player({1}, {}, {Petal::rose}), "admit teammate healer");
    check(match.add_player({2}, {100, 0}, {}), "admit remote teammate");
    steps(match, 1);
    FixtureAccess::damage(match, *owner(match, 1).body, 20);
    steps(match, 40);
    near(body(match, 1).health, 80, "rose cannot heal out of range");
    FixtureAccess::get(match, *owner(match, 1).body).view.position = {20, 0};
    steps(match, 1);
    near(body(match, 1).health, 80, "teammate sees the rose fly toward them before healing");
    check(petal(match).position.x > 13, "rose travels toward its recipient instead of the owner");
    steps(match, 8);
    near(body(match, 1).health, 90, "rose heals teammate in range");
    check(!owner(match).petals[0].entity, "teammate rose consumed");
  }
  {
    Match match({4}, 5, arena());
    check(match.add_player({1}, {}, {Petal::leaf}, {Rarity::unusual}), "admit Leaf");
    steps(match, 1);
    FixtureAccess::damage(match, *owner(match).body, 10);
    const auto start = petal(match);
    const auto friendly = FixtureAccess::spawn(
        match, start.position + Vec2{0, -3}, {.radius = 1, .health = 50}, Faction::team);
    const auto other =
        FixtureAccess::spawn(match, {14, 2.25}, {.radius = 1, .health = 50}, Faction::team);
    FixtureAccess::damage(match, friendly, 20);
    FixtureAccess::damage(match, other, 20);
    steps(match, 1);
    const auto& leaf = catalog::dated().petal(Petal::leaf, Rarity::unusual)->mechanics;
    near(body(match).health, 90 + leaf.passive_heal_per_second * .025,
         "Leaf passive heal preserves original formatter precision");
    near(FixtureAccess::get(match, friendly).view.health, 30, "Leaf does not heal on contact");
    auto& target = FixtureAccess::get(match, friendly).view;
    target.position = {24, -5};
    steps(match, 1);
    const auto distance = [&] { return (petal(match).position - target.position).length(); };
    check(petal(match).id == start.id && distance() > 0 &&
              distance() < (start.position - target.position).length(),
          "Leaf flies toward the moving recipient instead of returning to orbit");
    bool reached_center = false;
    for (unsigned i = 0; i < 20 && owner(match).petals[0].entity; ++i) {
      reached_center |= petal(match).position == target.position;
      near(target.health, 30, "Leaf does not heal while it is still in flight");
      steps(match, 1);
    }
    check(reached_center, "Leaf reaches the mob center before it is consumed");
    near(FixtureAccess::get(match, friendly).view.health, 43, "Leaf eaten by friendly mob");
    near(FixtureAccess::get(match, other).view.health, 30, "the same Leaf cannot be eaten twice");
    check(!owner(match).petals[0].entity && owner(match).petals[0].reload_ticks == 40,
          "friendly mob consumption reloads Leaf");
  }
  {
    Match match({44}, 5, arena());
    check(match.add_player({1}, {}, {Petal::leaf}), "admit Leaf for interrupted healing");
    steps(match, 1);
    const auto start = petal(match);
    const auto friendly = FixtureAccess::spawn(
        match, start.position + Vec2{0, 3}, {.radius = 1, .health = 50}, Faction::team);
    FixtureAccess::damage(match, friendly, 20);
    steps(match, 2);
    check(petal(match).position != start.position, "Leaf starts flying to its recipient");
    FixtureAccess::kill(match, friendly);
    steps(match, 1);
    check(petal(match).id == start.id && petal(match).position == start.position &&
              owner(match).petals[0].reload_ticks == 0,
          "Leaf returns to orbit if the recipient dies before arrival");
  }
}
void dahlia_orbit_and_heal() {
  Match match({43}, 5, arena());
  check(match.add_player({1}, {}, {Petal::dahlia}), "admit Dahlia");
  steps(match, 1);
  const auto petals = owner(match).petals[0].entities;
  check(petals.size() == 3, "Dahlia has three independent petals");
  const auto particle = [&](std::size_t index) -> const EntityView& {
    return FixtureAccess::get(match, petals[index]).view;
  };
  const auto spaced = [&] {
    for (std::size_t i = 0; i < petals.size(); ++i) {
      for (std::size_t j = i + 1; j < petals.size(); ++j) {
        check((particle(i).position - particle(j).position).length() >
                  particle(i).radius + particle(j).radius,
              "Dahlia petals have a visible gap");
      }
    }
  };
  spaced();
  check(match.queue(Input{owner(match).life, {}, false, true}), "Dahlia defend input");
  steps(match, 40);
  spaced();
  const auto first = particle(0).position;
  const auto second = particle(1).position;
  const auto third = particle(2).position;
  FixtureAccess::damage(match, *owner(match).body, 2);
  steps(match, 1);
  near(body(match).health, 98, "Dahlia heals only after traveling to the player");
  check(particle(0).position.length() < first.length(), "one Dahlia petal leaves orbit");
  check(particle(1).position == second && particle(2).position == third,
        "unused Dahlia petals keep orbiting");
  spaced();
  steps(match, 8);
  near(body(match).health, 100, "Dahlia heals the player on arrival");
  check(owner(match).petals[0].entities == std::vector{petals[1], petals[2]},
        "only the Dahlia petal needed to heal is consumed");
}
void projectiles_and_poison() {
  for (const auto kind : {Petal::peas, Petal::grapes, Petal::missile}) {
    Match match({5}, 5, arena());
    check(match.add_player({1}, {}, {kind}), "admit projectile");
    steps(match, 1);
    const unsigned count = kind == Petal::missile ? 1 : 4;
    check(owner(match).petals[0].entities.size() == 1, "projectile starts as a single cluster");
    check(match.queue(Input{owner(match).life, {}, true, false}), "attack launches");
    steps(match, 20);
    const auto launched = match.view();
    check(owner(match).petals[0].entities.empty() && !owner(match).petals[0].entity,
          "launch consumes entire orbit group");
    unsigned flights = 0;
    EntityId shot;
    for (const auto& e : launched.entities) {
      if (e.petal == kind) {
        ++flights;
        shot = e.id;
        check(e.owner == owner(match).life && e.rarity == Rarity::common,
              "detached projectile owner and rarity");
      }
    }
    check(flights == count, "all particles become projectiles");
    auto& flight = FixtureAccess::get(match, shot);
    const auto launch = flight.view.position;
    steps(match, 1);
    const auto first = flight.view.position;
    steps(match, 3);
    check((flight.view.position - first).length() / 3 < (first - launch).length(),
          "flight does not accelerate after launch");
    const auto farther = FixtureAccess::spawn(
        match, flight.view.position + flight.flight_direction * 6, {.radius = 1, .health = 100});
    const auto target = FixtureAccess::spawn(
        match, flight.view.position + flight.flight_direction * .5, {.radius = .25, .health = 100});
    steps(match, 1);
    check(FixtureAccess::get(match, target).view.health < 100 &&
              FixtureAccess::get(match, farther).view.health == 100,
          "projectile hits the nearer target along its path first");
    const auto after = FixtureAccess::get(match, target).view.health;
    steps(match, 1);
    if (kind == Petal::grapes) {
      check(FixtureAccess::get(match, target).view.health < after,
            "Grapes poison begins on following tick");
      bool attributed = false;
      for (const auto& event : match.events()) {
        if (const auto* hit = std::get_if<HealthChange>(&event.data)) {
          if (hit->kind == HealthKind::poison) {
            attributed = hit->source.owner == owner(match).life;
          }
        }
      }
      check(attributed, "poison preserves consumed projectile attribution");
    } else {
      near(FixtureAccess::get(match, target).view.health, after, "Peas/Missile have no poison");
    }
    check(match.queue(Input{owner(match).life, {}, false, false}), "release attack");
    steps(match, 65);
    for (const auto& e : match.view().entities) {
      if (e.petal == kind) {
        check(!FixtureAccess::get(match, e.id).projectile, "projectiles expire after their flight");
      }
    }
  }
  {
    Match match({6}, 5, arena());
    check(match.add_player({1}, {}, {Petal::sand}), "admit breakable group");
    steps(match, 1);
    const auto ids = owner(match).petals[0].entities;
    FixtureAccess::kill(match, ids[0]);
    const auto first = owner(match).petals[0];
    check(first.entities.size() == 3 && first.reload_ticks == first.reload_total_ticks &&
              first.reload_ticks > 0,
          "losing one particle immediately starts shared reload");
    steps(match, 2);
    FixtureAccess::kill(match, ids[2]);
    check(owner(match).petals[0].reload_ticks == first.reload_ticks,
          "losing another particle restarts the original slot timer");
    steps(match, first.reload_ticks);
    check(owner(match).petals[0].entities == std::vector{ids[1], ids[3]},
          "surviving petals stay equipped throughout recharge");
    steps(match, 1);
    const auto restored = owner(match).petals[0];
    check(restored.reload_ticks == 0 && restored.entities.size() == ids.size() &&
              restored.entities[0] != ids[0] && restored.entities[1] == ids[1] &&
              restored.entities[2] != ids[2] && restored.entities[3] == ids[3],
          "only missing particles return, in their original orbit positions");
  }
}
void web_summon_passive_equip() {
  {
    Match match({7}, 5, arena());
    check(match.add_player({1}, {}, {Petal::web}, {Rarity::unusual}), "admit Web");
    steps(match, 1);
    check(match.queue(Input{owner(match).life, {}, true, false}), "fire Web");
    steps(match, 46);
    std::optional<EntityView> area;
    for (const auto& e : match.view().entities) {
      if (e.petal == Petal::web && e.ground_web) {
        area = e;
      }
    }
    check(area.has_value(), "Web becomes ground area after finite flight");
    const auto slowed = FixtureAccess::spawn(match, area->position,
                                             {.radius = 1, .health = 100, .speed_per_second = 20});
    const auto spider = FixtureAccess::spawn(match, area->position + Vec2{0, 5},
                                             {.radius = 1, .health = 100, .speed_per_second = 20},
                                             Faction::hostile, Group::summon, Mob::spider);
    steps(match, 1);
    near(FixtureAccess::get(match, slowed).view.velocity.length(), 5, "Web slows by 75 percent");
    near(FixtureAccess::get(match, spider).view.velocity.length(), 20, "Spider immune to Web");
    check(match.queue(Input{owner(match).life, {}, false, false}), "stop Web fire");
    steps(match, 400);
    check(!FixtureAccess::get(match, slowed).view.ground_web, "unrelated mob unaffected by expiry");
    for (const auto& e : match.view().entities) {
      check(e.id != area->id, "ground Web expires after ten seconds");
    }
  }
  for (unsigned rarity = 0; rarity < 5; ++rarity) {
    auto rules = arena();
    rules.orbit_rad_per_second = 4;
    Match match({80 + rarity}, 5, rules);
    check(match.add_player({1}, {}, {Petal::egg}, {Rarity(rarity)}), "admit Egg contents fixture");
    steps(match, 1);
    const auto egg = petal(match);
    steps(match, 79);
    const auto orbiting = petal(match);
    check(orbiting.id == egg.id, "Egg does not hatch before two seconds");
    check(orbiting.position != egg.position && orbiting.heading_rad == egg.heading_rad &&
              orbiting.heading_rad == 0,
          "Egg stays upright as it moves around the player");
    steps(match, 1);
    const std::array kinds{Mob::baby_ant, Mob::worker_ant, Mob::soldier_ant, Mob::beetle,
                           Mob::beetle};
    const std::array tiers{Rarity::common, Rarity::unusual, Rarity::unusual, Rarity::unusual,
                           Rarity::rare};
    unsigned summons = 0;
    for (const auto& entity : match.view().entities) {
      if (entity.group == Group::summon) {
        ++summons;
        check(entity.mob == kinds[rarity] && entity.rarity == tiers[rarity] &&
                  entity.owner == owner(match).life && entity.faction == Faction::team &&
                  owner(match).petals[0].entity == entity.id,
              "Egg uses original Contents kind/rarity independently of equipped rarity");
      }
    }
    check(summons == 1 && owner(match).petals[0].reload_ticks == 0,
          "hatching replaces Egg without starting recharge");
  }
  {
    Match match({86}, 5, arena());
    check(match.add_player({1}, {}, {Petal::basic, Petal::egg, Petal::basic}),
          "admit Egg between two orbiting petals");
    steps(match, 1);
    const auto egg_radius = [&match] {
      return (petal(match, 1).position - body(match).position).length();
    };
    const double idle_radius = egg_radius();
    constexpr double three_slots = 4 * std::numbers::pi / 3;
    near(petal(match, 2).heading_rad, three_slots, "unhatched Egg takes an orbit position");
    check(match.queue(Input{owner(match).life, {}, true, false}), "attack with Egg equipped");
    steps(match, 1);
    check(egg_radius() > idle_radius, "Egg extends while attacking");
    check(match.queue(Input{owner(match).life, {}, false, true}), "defend with Egg equipped");
    steps(match, 1);
    check(egg_radius() < idle_radius, "Egg contracts while defending");
    check(match.queue(Input{owner(match).life, {}, false, false}), "return to idle orbit");
    steps(match, 78);
    const auto hatchling = petal(match, 1);
    check(hatchling.group == Group::summon && owner(match).petals[1].reload_ticks == 0,
          "hatchling occupies the slot without starting recharge");
    near(petal(match, 2).heading_rad, std::numbers::pi,
         "the two remaining petals are opposite each other as soon as Egg hatches");
    steps(match, 1200);
    check(owner(match).petals[1].entity == hatchling.id && owner(match).petals[1].reload_ticks == 0,
          "the same hatchling remains in the slot beyond the former 15-second expiry");
    near(petal(match, 2).heading_rad, std::numbers::pi,
         "a live hatchling still does not take up an orbit position");
    FixtureAccess::kill(match, hatchling.id);
    check(!owner(match).petals[1].entity && owner(match).petals[1].reload_ticks == 160,
          "defeating the hatchling starts Egg's four-second recharge");
    steps(match, 1);
    near(petal(match, 2).heading_rad, three_slots, "the recharging Egg reserves its orbit position");
    steps(match, 159);
    check(!owner(match).petals[1].entity, "Egg stays gone during recharge");
    steps(match, 1);
    check(petal(match, 1).petal == Petal::egg, "Egg returns after its hatchling's death and recharge");
  }
  {
    Match match({8}, 5, arena());
    check(match.add_player({1}, {}, {Petal::egg}, {Rarity::mythic}), "admit Egg");
    steps(match, 600);
    check(petal(match).petal == Petal::egg, "Mythic Egg waits fifteen seconds");
    steps(match, 1);
    unsigned summons = 0;
    for (const auto& e : match.view().entities) {
      if (e.group == Group::summon) {
        ++summons;
        check(e.mob == Mob::beetle && e.owner == owner(match).life && e.rarity == Rarity::legendary,
              "hatch ownership and rarity");
      }
    }
    check(summons == 1 && match.view().wave.counts.alive == 1,
          "summon excluded from wave population accounting");
    check(owner(match).petals[0].reload_ticks == 0, "Mythic Egg does not recharge at hatch");
  }
  {
    auto rules = arena();
    rules.orbit_rad_per_second = 4;
    Match match({9}, 5, rules);
    check(
        match.add_player({1}, {}, {Petal::basic, Petal::faster}, {Rarity::common, Rarity::mythic}),
        "admit Faster");
    steps(match, 2);
    const auto& faster = catalog::dated().petal(Petal::faster, Rarity::mythic)->mechanics;
    near(petal(match).heading_rad, (4 + faster.rotation_bonus) * .025,
         "Faster changes orbit angular speed with original f32 precision");
    const auto old = petal(match).id;
    check(match.queue(Equip{
              owner(match).life, {Petal::basic, Petal::cactus}, {Rarity::rare, Rarity::common}}),
          "queue live loadout");
    auto stale = owner(match).life;
    ++stale.generation;
    check(!match.queue(Equip{stale, {Petal::rose}, {}}), "reject stale life equip");
    steps(match, 1);
    check(owner(match).loadout_rarities[0] == Rarity::rare && !owner(match).petals[0].entity,
          "live equip applies rarity and selected reload");
    near(body(match).max_health, 125, "Cactus increases max health");
    near(body(match).health, 100, "equipping health passive does not mint healing");
    check(!match.equip({1}, {Petal(999)}) && !match.equip({1}, {Petal::basic}, {Rarity(6)}) &&
              !match.equip({1}, {Petal::basic, Petal::rose}, {Rarity::common}),
          "invalid equip is atomic");
    steps(match, 100);
    check(petal(match).id != old && petal(match).rarity == Rarity::rare,
          "live equip produces selected rarity");
  }
}
void honey_stinger_and_life_cleanup() {
  {
    Match match({12}, 5, arena());
    check(match.add_player({1}, {}, {Petal::honey}, {Rarity::rare}), "admit historical Honey");
    steps(match, 1);
    const auto target =
        FixtureAccess::spawn(match, {14, 0}, {.radius = 1, .health = 500, .speed_per_second = 20});
    steps(match, 2);
    near(FixtureAccess::get(match, target).view.velocity.length(), 16,
         "reconstructed Honey movement slowdown remains explicit");
    check(match.set_loadout({1}, {}), "remove Honey source");
    steps(match, 173);
    near(FixtureAccess::get(match, target).view.velocity.length(), 20,
         "Honey slow expires even after source removed");
  }
  {
    Match match({13}, 5, arena());
    check(match.add_player({1}, {}, {Petal::stinger}), "admit Stinger");
    steps(match, 1);
    const auto target =
        FixtureAccess::spawn(match, {14, 0}, {.radius = 1, .health = 500, .contact_damage = 10});
    steps(match, 1);
    near(FixtureAccess::get(match, target).view.health, 465,
         "fragile Stinger deals adopted burst damage");
    check(!owner(match).petals[0].entity && owner(match).petals[0].reload_ticks == 100,
          "Stinger destruction uses original 2.5 second reload");
  }
  {
    auto rules = arena();
    rules.lifecycle.end_on_team_wipe = false;
    Match match({14}, 5, rules);
    check(match.add_player({1}, {}, {Petal::egg, Petal::peas}, {Rarity::mythic, Rarity::common}),
          "admit summon and projectile owner");
    steps(match, 601);
    check(match.queue(Input{owner(match).life, {}, true, false}), "launch before life removal");
    steps(match, 1);
    FixtureAccess::kill(match, *owner(match).body);
    for (const auto& e : match.view().entities) {
      check(!e.owner, "life removal reaps all owned summons/projectiles");
    }
  }
}

void defeat_snapshot_and_empty_slots() {
  Match match({11}, 5, arena());
  check(match.add_player({1}, {}, {Petal::none, Petal::stinger, Petal::none},
                         {Rarity::common, Rarity::rare, Rarity::common}),
        "original None preserves active slots");
  steps(match, 1);
  check(!owner(match).petals[0].entity && owner(match).petals[1].entity &&
            !owner(match).petals[2].entity,
        "empty active slots do not spawn phantom Basics");
  const auto victim = FixtureAccess::spawn(match, {60, 10}, {.radius = 1, .health = 10});
  auto& entity = FixtureAccess::get(match, victim);
  entity.view.mob = Mob::hornet;
  entity.view.rarity = Rarity::epic;
  entity.view.origin_wave = 1;
  FixtureAccess::kill(match, victim);
  const Defeat* defeat = nullptr;
  for (const auto& event : match.events()) {
    if (const auto* candidate = std::get_if<Defeat>(&event.data)) {
      if (candidate->entity == victim) {
        defeat = candidate;
      }
    }
  }
  check(defeat && defeat->mob == Mob::hornet && defeat->rarity == Rarity::epic &&
            defeat->position == Vec2{60, 10} && defeat->origin_wave == 1,
        "Defeat retains removed mob identity/rarity/position for economy");
  check(match.set_loadout({1}, {Petal::none, Petal::rose}),
        "live set_loadout alias accepts empty slots");
  check(owner(match).loadout == std::vector<Petal>{Petal::none, Petal::rose},
        "live loadout changed by PlayerId");
  const auto player_body = *owner(match).body;
  FixtureAccess::get(match, player_body).view.position = {7, 13};
  FixtureAccess::kill(match, player_body);
  const LifeChange* ended = nullptr;
  for (const auto& event : match.events()) {
    if (const auto* life = std::get_if<LifeChange>(&event.data);
        life && life->body == player_body && life->state != LifeState::alive) {
      ended = life;
    }
  }
  check(ended && ended->position == Vec2{7, 13},
        "LifeChange snapshots final body position before removal");
}
}
int main() {
  const char* current = "startup";
  try {
    const std::pair<const char*, void (*)()> cases[]{
        {"W3-01.mapping", mapping},
        {"W3-01.unsupported-effects", unsupported_effects},
        {"W3-01.rarity-damage-reload", damage_rarity_and_reload},
        {"W3-01.rose-leaf", rose_and_leaf},
        {"W3-01.dahlia-orbit-heal", dahlia_orbit_and_heal},
        {"W3-01.projectile-poison", projectiles_and_poison},
        {"W3-01.web-summon-passive-equip", web_summon_passive_equip},
        {"W3-01.defeat-empty-slots", defeat_snapshot_and_empty_slots},
        {"W3-01.honey-stinger-life", honey_stinger_and_life_cleanup},
    };
    for (const auto& [name, test] : cases) {
      current = name;
      test();
      std::cout << name << " passed\n";
    }
  } catch (const std::exception& error) {
    std::cerr << current << ": " << error.what() << '\n';
    return 1;
  }
}
