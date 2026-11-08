#include "catalog/catalog.hpp"
#include "sim/match.hpp"
#include "../scenarios/garden-w1.hpp"

#include <cmath>
#include <iostream>
#include <set>
#include <stdexcept>
#include <limits>

namespace wave::sim {
struct FixtureAccess {
  static detail::Entity& get(Match& match, EntityId id) { return *match.entities_.get(id); }
  static EntityId spawn(Match& match, Vec2 position, BodyRules body,
                        Faction faction = Faction::garden, Group group = Group::summon,
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
  auto rules = garden_rules();
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
  check(c.version == "20221030-w3.3" && c.sha256.size() == 64 && c.client_wasm_sha256.size() == 64,
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
    if (p.kind == Petal::peas || p.kind == Petal::grapes) {
      check(p.particles == 4, "four-particle slots");
    }
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
  const auto& craft = catalog::craft_table();
  check(craft.client_percent == std::array<unsigned, 5>{60, 40, 20, 10, 3},
        "original craft display");
  check(craft.server_success_per_million ==
            std::array<std::uint32_t, 5>{600000, 400000, 200000, 100000, 30000},
        "separate adopted server craft table");
  check(craft.failure_loss_range == std::array<unsigned, 2>{1, 4} &&
            craft.failure_loss_weights == std::array<unsigned, 4>{1, 1, 1, 1},
        "uniform failed-craft loss 1 through 4");
  const auto thresholds = catalog::xp_thresholds();
  check(thresholds.size() == 256 && catalog::level_table().maximum_level == 255,
        "client level byte cap plus next-level sentinel");
  for (unsigned level = 1; level <= 255; ++level) {
    check(thresholds[level - 1] == 100ULL * (level - 1) * (level - 1),
          "single quadratic XP authority");
    check(catalog::level_for_xp(thresholds[level - 1]) == level,
          "exact cumulative XP level boundary");
    if (level > 1) {
      check(catalog::level_for_xp(thresholds[level - 1] - 1) == level - 1,
            "one XP below each level boundary");
    }
  }
  check(catalog::level_for_xp(thresholds.back()) == 255 &&
            catalog::level_for_xp(std::numeric_limits<std::uint64_t>::max()) == 255,
        "XP beyond sentinel stays within original client level byte");
  check(catalog::unlocked_main_slots(1) == 5 && catalog::unlocked_main_slots(14) == 5 &&
            catalog::unlocked_main_slots(15) == 6 && catalog::unlocked_main_slots(29) == 6 &&
            catalog::unlocked_main_slots(30) == 7 && catalog::unlocked_main_slots(44) == 7 &&
            catalog::unlocked_main_slots(45) == 8 && catalog::unlocked_main_slots(255) == 8,
        "shared five-to-eight slot progression has reachable unlocks");
  check(catalog::drop_table().size() > 780, "complete original nonzero drop table available");
}
void damage_rarity_and_reload() {
  for (const auto rarity : {Rarity::common, Rarity::mythic}) {
    Match match({1}, 5, arena());
    check(match.add_player({1}, {}, {Petal::basic}, {rarity}), "admit rarity");
    steps(match, 1);
    const auto target = FixtureAccess::spawn(match, {14, 0}, {.radius = 1, .health = 1000});
    steps(match, 1);
    near(FixtureAccess::get(match, target).view.health, rarity == Rarity::common ? 990 : 960,
         "authoritative damage uses equipped rarity");
    near(petal(match).max_health, rarity == Rarity::common ? 10 : 25, "equipped rarity health");
    const auto old = petal(match).id;
    FixtureAccess::kill(match, old);
    check(!owner(match).petals[0].entity && owner(match).petals[0].reload_ticks == 100,
          "broken basic reload is 2.5 seconds");
    steps(match, 100);
    check(!owner(match).petals[0].entity, "not reloaded before deadline");
    steps(match, 1);
    check(owner(match).petals[0].entity && *owner(match).petals[0].entity != old,
          "reload gives new generation");
  }
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
    near(body(match, 1).health, 90, "rose heals teammate in range");
    check(!owner(match).petals[0].entity, "teammate rose consumed");
  }
  {
    Match match({4}, 5, arena());
    check(match.add_player({1}, {}, {Petal::leaf}, {Rarity::unusual}), "admit Leaf");
    steps(match, 1);
    FixtureAccess::damage(match, *owner(match).body, 10);
    const auto friendly =
        FixtureAccess::spawn(match, {14, 0}, {.radius = 1, .health = 50}, Faction::team);
    FixtureAccess::damage(match, friendly, 20);
    steps(match, 1);
    near(body(match).health,
         90 + catalog::dated().petal(Petal::leaf, Rarity::unusual)->passive_heal_per_second * .025,
         "Leaf passive heal preserves original formatter precision");
    near(FixtureAccess::get(match, friendly).view.health, 43, "Leaf eaten by friendly mob");
    check(!owner(match).petals[0].entity && owner(match).petals[0].reload_ticks == 40,
          "friendly mob consumption reloads Leaf");
  }
}
void projectiles_and_poison() {
  for (const auto kind : {Petal::peas, Petal::grapes, Petal::missile}) {
    Match match({5}, 5, arena());
    check(match.add_player({1}, {}, {kind}), "admit projectile");
    steps(match, 1);
    const unsigned count = kind == Petal::missile ? 1 : 4;
    check(owner(match).petals[0].entities.size() == count, "multi-particle slot exposed");
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
    const auto target = FixtureAccess::spawn(
        match, flight.view.position + flight.flight_direction * 1.75, {.radius = 1, .health = 100});
    steps(match, 1);
    check(FixtureAccess::get(match, target).view.health < 100, "projectile contact damage");
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
    steps(match, 30);
    for (const auto& e : match.view().entities) {
      if (e.petal == kind) {
        check(!FixtureAccess::get(match, e.id).projectile, "projectiles expire at bounded range");
      }
    }
  }
  {
    Match match({6}, 5, arena());
    check(match.add_player({1}, {}, {Petal::peas}), "admit breakable group");
    steps(match, 1);
    auto ids = owner(match).petals[0].entities;
    FixtureAccess::kill(match, ids[0]);
    check(owner(match).petals[0].entities.size() == 3 && owner(match).petals[0].reload_ticks == 0,
          "one broken particle does not duplicate surviving particles");
    for (std::size_t i = 1; i < ids.size(); ++i) {
      FixtureAccess::kill(match, ids[i]);
    }
    check(owner(match).petals[0].reload_ticks == 40, "last broken particle starts shared reload");
  }
}
void web_summon_passive_equip() {
  {
    Match match({7}, 5, arena());
    check(match.add_player({1}, {}, {Petal::web}, {Rarity::unusual}), "admit Web");
    steps(match, 1);
    check(match.queue(Input{owner(match).life, {}, true, false}), "fire Web");
    steps(match, 30);
    std::optional<EntityView> area;
    for (const auto& e : match.view().entities) {
      if (e.petal == Petal::web && FixtureAccess::get(match, e.id).ground_web) {
        area = e;
      }
    }
    check(area.has_value(), "Web becomes ground area after finite flight");
    const auto slowed = FixtureAccess::spawn(match, area->position,
                                             {.radius = 1, .health = 100, .speed_per_second = 20});
    const auto spider = FixtureAccess::spawn(match, area->position + Vec2{0, 5},
                                             {.radius = 1, .health = 100, .speed_per_second = 20},
                                             Faction::garden, Group::summon, Mob::spider);
    steps(match, 1);
    near(FixtureAccess::get(match, slowed).view.velocity.length(), 5, "Web slows by 75 percent");
    near(FixtureAccess::get(match, spider).view.velocity.length(), 20, "Spider immune to Web");
    check(match.queue(Input{owner(match).life, {}, false, false}), "stop Web fire");
    steps(match, 400);
    check(!FixtureAccess::get(match, slowed).ground_web, "unrelated mob unaffected by expiry");
    for (const auto& e : match.view().entities) {
      check(e.id != area->id, "ground Web expires after ten seconds");
    }
  }
  for (unsigned rarity = 0; rarity < 5; ++rarity) {
    Match match({80 + rarity}, 5, arena());
    check(match.add_player({1}, {}, {Petal::egg}, {Rarity(rarity)}), "admit Egg contents fixture");
    steps(match, 80);
    check(owner(match).petals[0].entity.has_value(), "Egg does not hatch before two seconds");
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
                  entity.owner == owner(match).life,
              "Egg uses original Contents kind/rarity independently of equipped rarity");
      }
    }
    check(summons == 1 && owner(match).petals[0].reload_ticks == 160,
          "each original Egg contents variant consumes its slot and reloads in four seconds");
  }
  {
    Match match({8}, 5, arena());
    check(match.add_player({1}, {}, {Petal::egg}, {Rarity::mythic}), "admit Egg");
    steps(match, 600);
    check(owner(match).petals[0].entity.has_value(), "Mythic Egg waits fifteen seconds");
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
    check(owner(match).petals[0].reload_ticks == 160,
          "hatch consumes Egg and starts four-second reload");
    for (const auto& e : match.view().entities) {
      if (e.group == Group::main_mob) {
        FixtureAccess::get(match, e.id).view.health = 1000000;
      }
    }
    const auto unrelated =
        FixtureAccess::spawn(match, {200, 200}, {.radius = 1, .health = 100}, Faction::team);
    check(match.set_loadout({1}, {}), "stop repeated hatching before lifetime check");
    steps(match, 600);
    for (const auto& e : match.view().entities) {
      check(!e.owner || e.group != Group::summon, "owned summon expires after fifteen seconds");
    }
    check(FixtureAccess::get(match, unrelated).view.health > 0,
          "Egg lifetime does not expire unrelated summon-group mobs");
  }
  {
    auto rules = arena();
    rules.orbit_rad_per_second = 4;
    Match match({9}, 5, rules);
    check(
        match.add_player({1}, {}, {Petal::basic, Petal::faster}, {Rarity::common, Rarity::mythic}),
        "admit Faster");
    steps(match, 2);
    near(petal(match).heading_rad,
         (4 + catalog::dated().petal(Petal::faster, Rarity::mythic)->rotation_bonus) * .025,
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
void legacy() {
  auto rules = fixtures::short_garden_rules();
  Match match({10}, 1, rules);
  check(match.add_player({1}, {}, {Petal::basic, Petal::rose}), "legacy vector API remains valid");
  steps(match, 1);
  near(petal(match).max_health, 5, "explicit fixture health overrides catalog");
  check(!rules.catalog && owner(match).loadout_rarities == std::vector<Rarity>(2, Rarity::common),
        "legacy defaults Common");
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
        {"W3-01.projectile-poison", projectiles_and_poison},
        {"W3-01.web-summon-passive-equip", web_summon_passive_equip},
        {"W3-01.legacy", legacy},
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
