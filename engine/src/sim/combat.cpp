#include "engine/sim/combat.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/collision_filter.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/quadtree.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/player.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace engine {

namespace {

EntityHandle owner_player(const World& world, EntityHandle attacker) {
  EntityHandle current = attacker;
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    const Entity* entity = world.entities().get(current);
    if (entity == nullptr) return EntityHandle{};
    if (entity->kind == EntityKind::kPlayer) return current;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) return EntityHandle{};
    current = EntityHandle{entity->owner};
  }
  return EntityHandle{};
}

std::string killer_name_for(const World& world, EntityHandle attacker) {
  // Original 43 copies the *destroying entity's own name string* (entity+160).
  // Petals and projectiles inherit their owner's name; mobs and flowers use
  // their catalog/player name. An entity's killer_name is the name of whoever
  // killed that entity, so it must never be reused here: a mob that the player
  // had just killed would otherwise report the player's own flower name.
  EntityHandle source = attacker;
  bool rooted = false;
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    const Entity* entity = world.entities().get(source);
    if (entity == nullptr) return {};
    if (entity->kind == EntityKind::kPlayer) return world.player_name();
    if (entity->kind == EntityKind::kMob) { rooted = true; break; }
    if (entity->kind != EntityKind::kPetal && entity->kind != EntityKind::kProjectile) break;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) break;
    source = EntityHandle{entity->owner};
  }
  // A petal/projectile with no owner chain is nameless in the original name
  // component; do not invent a catalog name for it.
  if (!rooted) return {};
  const Entity* entity = world.entities().get(source);
  if (entity == nullptr || entity->type_id == 0U) return {};
  const auto* definition = Catalog::instance().entity(entity->type_id);
  return definition == nullptr ? std::string{} : std::string(definition->name);
}

f32 level_damage_scale(const World& world, EntityHandle first, EntityHandle second) {
  const Entity* a = world.entities().get(first);
  const Entity* b = world.entities().get(second);
  if (a == nullptr || b == nullptr) return f32(1.0F);
  if (a->kind != EntityKind::kPlayer || b->kind != EntityKind::kPlayer) return f32(1.0F);
  const std::uint8_t first_level = world.profile().level();
  const std::uint8_t second_level = world.profile().level();
  const std::uint8_t highest = first_level > second_level ? first_level : second_level;
  const double value = static_cast<double>(static_cast<int>(highest) - 5) * 0.2;
  return f32::from_double(std::min(1.0, std::max(0.0, value)));
}

} // namespace

void kill_entity(World& world, EntityHandle target, EntityHandle attacker) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr || entity->death_processed) return;
  if (!attacker.valid() && entity->last_attacker.valid()) attacker = entity->last_attacker;
  entity->death_processed = true;
  // Original43 calls424 immediately, a full second before corpse removal.
  // Leave the ordinary owner/children alive, but let the next segment steer
  // independently on the next AI tick instead of following the dead head.
  world.detach_linked_entities(target);
  const EntityKind kind = entity->kind;
  const Vec2 position = entity->position;
  const std::uint16_t type_id = entity->type_id;
  const Entity* attacker_entity = world.entities().get(attacker);
  world.record_death(kind, type_id, position,
                     attacker_entity != nullptr ? attacker_entity->kind : EntityKind::kNone,
                     attacker_entity != nullptr ? attacker_entity->type_id : 0U);
  if (kind == EntityKind::kPlayer || kind == EntityKind::kMob) {
    entity->killer_name = killer_name_for(world, attacker);
    // Original updateKillerName writes the destroying entity's name into the
    // player's own replicated string field. Keep the world-level copy for the
    // local death payload only: mobs keep dying (and may die with no attacker)
    // after the player, and those later deaths must not erase or replace the
    // name the death screen is about to show.
    if (kind == EntityKind::kPlayer && target == world.player())
      world.set_last_killer(attacker, entity->killer_name);
  }

  if (kind == EntityKind::kPetal) {
    // Original 43 clears the equipped handle and arms the recharge timer first;
    // the petal entity itself survives as a health-0 corpse and is reaped one
    // second later (probed in the attack trace: hp reaches 0 at ~2.4 s and the
    // world entity count drops at 3.35 s).
    (void)on_petal_destroyed(world, target);
    entity->health = f32(0.0F);
    // The shipped attack trace dies at 2350 ms and is reaped at 3350 ms, i.e.
    // one second later regardless of the attack button; the earlier 800 ms
    // "attack-held" branch was not observable in any golden trace (R01).
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }

  if (kind == EntityKind::kPlayer) {
    entity->death_flag = true;
    entity->death_time_ms = world.time_ms() + 1000.0;
    // Original43 retains the body's carried loadout throughout its corpse
    // window. retainPlayerLoot writes a separate loot component and the peer's
    // lost-item list; it does not replace the carried inventory in-place.
    PlayerProfile retained_profile = world.profile();
    const LootResult loot = retain_player_loot(retained_profile, world.random(), world.death_shuffle_random());
    world.profile().set_lost_items(loot.lost_count, loot.lost);
    // The first three eligible petals are ground loot. The remainder (up to
    // ten, historically named `lost`) belongs to the controller and respawns.
    world.set_last_death_kept(std::span<const std::uint16_t>(loot.lost.data(), loot.lost_count));
    std::vector<std::uint16_t> retained(loot.retained.begin(),
                                        loot.retained.begin() + loot.retained_count);
    (void)spawn_loot_drops(world, retained, position, target);
    world.set_last_death(world.loadout().score(), world.profile().level());
    // Original 43 walks all 24 owned handles (8 slots x 3 instances), damages
    // live children to zero and queues handle-less children for removal.
    std::array<EntityHandle, 24> children{};
    std::array<std::uint8_t, 24> child_slots{};
    std::array<std::uint8_t, 24> child_instances{};
    std::size_t child_count = 0;
    for (std::uint8_t slot = 0; slot < 8U; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        const EntityHandle handle = world.loadout().handle(slot, instance);
        if (!handle.valid() || child_count >= children.size()) continue;
        child_slots[child_count] = slot;
        child_instances[child_count] = instance;
        children[child_count++] = handle;
      }
    }
    for (std::size_t index = 0; index < child_count; ++index) {
      Entity* child = world.entities().get(children[index]);
      if (child == nullptr) {
        world.loadout().clear_handle(child_slots[index], child_instances[index]);
        continue;
      }
      if (child->health.value > 0.0F)
        (void)damage_entity(world, child->handle, child->health, attacker);
      else
        (void)world.destroy(child->handle);
    }
    // Original43 schedules health+48 = now+1000 for players too. The viewer's
    // controlled-body handle and the healthless children remain live until
    // the ordinary removal sweep releases their intrusive references.
    return;
  }

  if (kind == EntityKind::kMob) {
    // Loot entries were attached at spawn by the component draws; the death
    // path only materializes them and consumes no additional RNG values.
    std::vector<std::uint16_t> petals(entity->loot_petals.begin(),
                                      entity->loot_petals.begin() + entity->loot_count);
    (void)spawn_loot_drops(world, petals, position, target);
    const EntityHandle owner = owner_player(world, attacker);
    if (owner.valid() && world.player() == owner) {
      const auto* definition = Catalog::instance().entity(type_id);
      if (definition != nullptr) {
        // spawnEntity writes the entity definition scale into loot +4; the
        // damage path awards that value to the attacker's player.
        const f32 reward(definition->scale);
        award_player_experience(world, reward);
      }
    }
    // Mobs also persist as health-0 corpses for one second before the world
    // removes them; the population refill sees the corpse and only reacts on
    // the following tick, which is the shipped one-tick count dip.
    entity->health = f32(0.0F);
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }

  if (kind == EntityKind::kProjectile) {
    entity->health = f32(0.0F);
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }
  (void)world.destroy(target);
}

f32 heal_entity(Entity& entity, f32 amount) {
  if (entity.health.value <= 0.0F) return entity.health;
  entity.health += amount;
  if (entity.health.value > entity.max_health.value) entity.health = entity.max_health;
  if (entity.health.value < 0.0F) entity.health = f32(0.0F);
  return entity.health;
}

f32 heal_entity(World& world, EntityHandle target, f32 amount) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr) return f32(0.0F);
  if (entity->health.value <= 0.0F) return entity->health;
  if (blocks_healing(*entity)) return entity->health;
  return heal_entity(*entity, amount);
}

namespace damage_debug {
struct Last {
  bool valid = false;
  std::uint32_t target = 0;
  std::uint32_t source = 0;
  float amount = 0.0F;
  std::uint64_t tick = 0;
};
Last last{};
} // namespace damage_debug

DamageResult damage_entity(World& world, EntityHandle target, f32 amount, EntityHandle attacker,
                           std::uint16_t options) {
  if (amount.value > 0.0F) {
    damage_debug::last.valid = true;
    damage_debug::last.target = target.raw;
    damage_debug::last.source = attacker.valid() ? attacker.raw : 0U;
    damage_debug::last.amount = amount.value;
    damage_debug::last.tick = world.tick();
  }
  Entity* entity = world.entities().get(target);
  if (entity == nullptr) return {f32(0.0F), false};
  if (entity->health.value <= 0.0F) return {entity->health, false};
  if (amount.value < 0.0F) return {entity->health, false};
  if (attacker.valid()) entity->last_attacker = attacker;
  entity->health -= amount;
  if (entity->health.value < 0.0F) entity->health = f32(0.0F);
  const bool died = entity->health.value <= 0.0F;
  (void)alert_to_attacker(world, target, attacker);
  // Original43's low option byte suppresses notification only. Health,
  // attacker propagation and death still run; the high byte is independent.
  if (amount.value > 0.0F && (options & 0xFFU) == 0U) {
    entity->hit_epoch = static_cast<std::uint32_t>(world.tick() + 1U);
    world.record_hit(target, attacker, amount, entity->health);
  }
  if (died) kill_entity(world, target, attacker);
  return {entity->health, died};
}

namespace contact_debug {
struct Entry {
  std::uint32_t target = 0;
  std::uint32_t other = 0;
  double overlap = 0.0;
  float target_x_before = 0.0F, target_y_before = 0.0F;
  float target_x_after = 0.0F, target_y_after = 0.0F;
  float other_x_before = 0.0F, other_y_before = 0.0F;
  float other_x_after = 0.0F, other_y_after = 0.0F;
  std::uint32_t sequence = 0;
};
std::uint32_t target = 0;
bool record_all = false;
int contact_order = 6;
std::array<Entry, 512> entries{};
std::uint32_t count = 0;
} // namespace contact_debug


namespace {
QuadTree& contact_tree() {
  static QuadTree tree(Aabb{f32(-25500.0F), f32(-2500.0F), f32(25500.0F), f32(2500.0F)}, 4, 9);
  return tree;
}
const World* tree_world = nullptr;
std::uint64_t tree_identity = 0;
std::uint64_t tree_tick = 0;
} // namespace

void update_contact_tree(World& world) {
  std::vector<Entity*> bodies;
  for (auto& entity : world.entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F) continue;
    if (entity.kind == EntityKind::kDrop) continue;
    if (entity.collision_radius.value <= 0.0F) continue;
    bodies.push_back(&entity);
  }
  auto box = [](const Entity& entity) {
    const float radius = entity.collision_radius.value;
    return Aabb{f32(entity.position.x.value - radius),
                f32(entity.position.y.value - radius),
                f32(entity.position.x.value + radius),
                f32(entity.position.y.value + radius)};
  };
  std::vector<bool> present(kEntitySlotCount, false);
  for (Entity* entity : bodies) {
    const std::uint32_t slot = entity->handle.index();
    if (slot < kEntitySlotCount) present[slot] = true;
  }
  QuadTree& tree = contact_tree();
  const bool rebuild = tree_world != &world || tree_identity != world.identity()
                    || world.tick() != tree_tick + 1U;
  if (rebuild) {
    tree.clear();
    for (Entity* entity : bodies) {
      const std::uint32_t slot = entity->handle.index();
      if (slot < kEntitySlotCount) tree.insert(slot, box(*entity));
    }
  } else {
    tree.remove_missing(present);
    for (Entity* entity : bodies) {
      const std::uint32_t slot = entity->handle.index();
      if (slot < kEntitySlotCount) tree.update(slot, box(*entity));
    }
  }
  tree.compact();
  tree_world = &world;
  tree_identity = world.identity();
  tree_tick = world.tick();
  world.note_quadtree_update();
}

std::size_t resolve_contacts(World& world) {
  struct Body {
    EntityHandle handle;
    Entity* entity;
  };
  std::vector<Body> bodies;
  for (auto& entity : world.entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F) continue;
    if (entity.kind == EntityKind::kDrop) continue;
    if (entity.collision_radius.value <= 0.0F) continue;
    bodies.push_back({entity.handle, &entity});
  }
  std::size_t contacts = 0;
  // The original broad phase is a loose quadtree: a body descends into a
  // child only when its AABB is fully contained by that child, otherwise it
  // stays at the parent. The tree is traversed in node order, so a body's own
  // cell is visited before its siblings. This is the candidate order used by
  // debug strategy 6; strategies 0-5 keep the distance/slot experiments.
  auto body_box = [](const Entity& entity) {
    const float radius = entity.collision_radius.value;
    return Aabb{f32(entity.position.x.value - radius),
                f32(entity.position.y.value - radius),
                f32(entity.position.x.value + radius),
                f32(entity.position.y.value + radius)};
  };
  if (tree_world != &world || tree_identity != world.identity() || tree_tick != world.tick())
    update_contact_tree(world);
  QuadTree& tree = contact_tree();

  std::vector<int> body_by_slot(kEntitySlotCount, -1);
  for (std::size_t index = 0; index < bodies.size(); ++index) {
    const std::uint32_t slot = bodies[index].handle.index();
    if (slot >= kEntitySlotCount) continue;
    body_by_slot[slot] = static_cast<int>(index);
  }
  std::vector<std::vector<std::size_t>> tree_order(bodies.size());
  std::vector<std::size_t> candidates;
  for (std::size_t first = 0; first < bodies.size(); ++first) {
    tree.query(body_box(*bodies[first].entity), candidates);

    for (const std::size_t candidate : candidates) {
      if (candidate >= kEntitySlotCount) continue;
      const int mapped = body_by_slot[candidate];
      if (mapped >= 0 && static_cast<std::size_t>(mapped) != first)
        tree_order[first].push_back(static_cast<std::size_t>(mapped));
    }
  }

  std::vector<std::size_t> order;
  for (std::size_t first = 0; first < bodies.size(); ++first) {
    // The original outer body loop checks health immediately before querying;
    // the body may have died after the initial broadphase snapshot.
    if (!bodies[first].entity->active || bodies[first].entity->health.value <= 0.0F) continue;
    order.clear();
    if (contact_debug::contact_order == 7) {
      // Entity-list order: the archived pass walks the body array in
      // activation order (ascending slot for a freshly populated world) and
      // resolves each unordered pair once with the lower slot as p1.
      for (std::size_t second = first + 1; second < bodies.size(); ++second)
        order.push_back(second);
    } else if (contact_debug::contact_order >= 6) {
      order = tree_order[first];
    } else {
    for (std::size_t second = first + 1; second < bodies.size(); ++second)
      order.push_back(second);
    std::stable_sort(order.begin(), order.end(), [&bodies, first](std::size_t left, std::size_t right) {
      const Entity& a = *bodies[first].entity;
      const Entity& left_entity = *bodies[left].entity;
      const Entity& right_entity = *bodies[right].entity;
      const double left_dx = static_cast<double>(left_entity.position.x.value)
                           - static_cast<double>(a.position.x.value);
      const double left_dy = static_cast<double>(left_entity.position.y.value)
                           - static_cast<double>(a.position.y.value);
      const double right_dx = static_cast<double>(right_entity.position.x.value)
                            - static_cast<double>(a.position.x.value);
      const double right_dy = static_cast<double>(right_entity.position.y.value)
                             - static_cast<double>(a.position.y.value);
      const double left_distance = left_dx * left_dx + left_dy * left_dy;
      const double right_distance = right_dx * right_dx + right_dy * right_dy;
      switch (contact_debug::contact_order) {
        case 1: return left < right;
        case 2: return left > right;
        case 3:
        case 4: {
          const double left_overlap = static_cast<double>(a.collision_radius.value + left_entity.collision_radius.value)
                                    - std::sqrt(left_distance);
          const double right_overlap = static_cast<double>(a.collision_radius.value + right_entity.collision_radius.value)
                                     - std::sqrt(right_distance);
          if (left_overlap != right_overlap)
            return contact_debug::contact_order == 3 ? left_overlap > right_overlap : left_overlap < right_overlap;
          return left < right;
        }
        case 5:
          if (left_distance != right_distance) return left_distance > right_distance;
          return left < right;
        default:
          if (left_distance != right_distance) return left_distance < right_distance;
          return left < right;
      }
    });
    }

    for (const std::size_t second : order) {
      if (second <= first) continue;
      Entity& a = *bodies[first].entity;
      Entity& b = *bodies[second].entity;
      if (!a.active || !b.active || b.health.value <= 0.0F) continue;
      if (a.kind == EntityKind::kPetal && b.kind == EntityKind::kPetal) continue;
      if (a.kind == EntityKind::kDrop || b.kind == EntityKind::kDrop) continue;
      if (a.kind != EntityKind::kPlayer && a.kind != EntityKind::kMob && a.kind != EntityKind::kPetal && a.kind != EntityKind::kProjectile) continue;
      if (b.kind != EntityKind::kPlayer && b.kind != EntityKind::kMob && b.kind != EntityKind::kPetal && b.kind != EntityKind::kProjectile) continue;
      const bool a_owned = a.owner != std::numeric_limits<std::uint32_t>::max();
      const bool b_owned = b.owner != std::numeric_limits<std::uint32_t>::max();
      if (a_owned && b_owned && a.owner == b.owner) continue;
      if (a.kind == EntityKind::kPlayer && b_owned && EntityHandle{b.owner} == a.handle) continue;
      if (b.kind == EntityKind::kPlayer && a_owned && EntityHandle{a.owner} == b.handle) continue;
      // Original 390 skips the whole pair when either physics record has the
      // +50 one-shot marker.
      if (a.physics_flag50 || b.physics_flag50) continue;
      if (!layers_collide(a, b)) continue;
      const double dx = static_cast<double>(b.position.x.value) - static_cast<double>(a.position.x.value);
      const double dy = static_cast<double>(b.position.y.value) - static_cast<double>(a.position.y.value);
      const double reach = static_cast<double>(a.collision_radius.value)
        + static_cast<double>(b.collision_radius.value);
      const double distance_squared = dx * dx + dy * dy;
      // Original 162 admits a pair with binary32 subtraction, products and
      // sum. The response (390) then uses binary64. A binary64 admission test
      // resolves extra near-tangent chain contacts and accumulates drift.
      const f32 admission_x = b.position.x - a.position.x;
      const f32 admission_y = b.position.y - a.position.y;
      const f32 admission_reach = a.collision_radius + b.collision_radius;
      if ((admission_x * admission_x + admission_y * admission_y).value
          >= (admission_reach * admission_reach).value) continue;
      const double distance = std::sqrt(distance_squared);
      double normal_x = 1.0;
      double normal_y = 0.0;
      if (distance >= 2.220446049250313e-16) {
        normal_x = dx / distance;
        normal_y = dy / distance;
      }
      const double overlap = distance_squared < reach * reach ? reach - distance : 0.0;
      contact_debug::Entry* debug_entry = nullptr;
      if ((contact_debug::record_all
           || (contact_debug::target != 0
               && (a.handle.raw == contact_debug::target || b.handle.raw == contact_debug::target)))
          && contact_debug::count < contact_debug::entries.size()) {
        debug_entry = &contact_debug::entries[contact_debug::count++];
        debug_entry->target = a.handle.raw == contact_debug::target ? a.handle.raw : b.handle.raw;
        debug_entry->other = a.handle.raw == contact_debug::target ? b.handle.raw : a.handle.raw;
        debug_entry->sequence = static_cast<std::uint32_t>(contacts);
        debug_entry->overlap = overlap;
        if (a.handle.raw == contact_debug::target) {
          debug_entry->target_x_before = a.position.x.value;
          debug_entry->target_y_before = a.position.y.value;
          debug_entry->other_x_before = b.position.x.value;
          debug_entry->other_y_before = b.position.y.value;
        } else {
          debug_entry->target_x_before = b.position.x.value;
          debug_entry->target_y_before = b.position.y.value;
          debug_entry->other_x_before = a.position.x.value;
          debug_entry->other_y_before = a.position.y.value;
        }
      }
      // Original 162/390 response. 162 snapshots velocity + acceleration for
      // both bodies, then calls 390 twice with the pair swapped:
      //   call(p1, p2):  dot = (v1 + a1 - v2 - a2) . (p1 - p2)
      //     mass path (both physics +48 set):
      //       v1 += (p1 - p2) * (-2 * dot * eff2) / (|d|^2 * (eff1 + eff2))
      //       no position change; 162 then splits the overlap by mass.
      //     otherwise:
      //       v1 += (p1 - p2) * (-2 * dot / |d|^2)
      //       p1 is pushed fully out of p2 along the world-space normal.
      // Because both calls reuse the pre-call velocity snapshot, the pair is
      // one equal-and-opposite impulse with per-body mass weights.
      // A body whose physics +48 byte is clear (Rock, Boulder, Cactus, Ant
      // Hole) never receives contact response: the call with that body as p1
      // returns before touching velocity or position.
      const bool mass_path = a.physics_flag48 && b.physics_flag48;
      const double effective_a = static_cast<double>(a.collision_radius.value)
        * static_cast<double>(a.collision_radius.value) * static_cast<double>(a.mass.value);
      const double effective_b = static_cast<double>(b.collision_radius.value)
        * static_cast<double>(b.collision_radius.value) * static_cast<double>(b.mass.value);
      const double effective_total = effective_a + effective_b;
      const double weight_a = effective_total > 0.0 ? effective_b / effective_total : 0.5;
      const double weight_b = effective_total > 0.0 ? effective_a / effective_total : 0.5;
      const double relative_x = (a.velocity.x + a.acceleration.x)
                              - (b.velocity.x + b.acceleration.x);
      const double relative_y = (a.velocity.y + a.acceleration.y)
                              - (b.velocity.y + b.acceleration.y);
      // Preserve 390's dot/mass/division grouping before multiplying the
      // unnormalised separation. Normalising first changes the low f64 bits.
      const double dot = relative_x * -dx + relative_y * -dy;
      const double response_a = distance_squared > 0.0
        ? (mass_path ? dot * effective_b * -2.0 / (distance_squared * effective_total)
                     : dot * -2.0 / distance_squared) : 0.0;
      const double response_b = distance_squared > 0.0
        ? (mass_path ? dot * effective_a * -2.0 / (distance_squared * effective_total)
                     : dot * -2.0 / distance_squared) : 0.0;
      if (a.physics_flag48) {
        a.velocity.x = a.velocity.x + -dx * response_a;
        a.velocity.y = a.velocity.y + -dy * response_a;
        if (!mass_path && overlap > 0.0) {
          a.set_position_x(f32::from_double(static_cast<double>(a.position.x.value)
                                          - normal_x * overlap));
          a.set_position_y(f32::from_double(static_cast<double>(a.position.y.value)
                                          - normal_y * overlap));
        }
      }
      if (b.physics_flag48) {
        b.velocity.x = b.velocity.x + dx * response_b;
        b.velocity.y = b.velocity.y + dy * response_b;
        if (!mass_path) {
          // The swapped second call resolves the residual overlap left by the
          // first full push.
          const double residual_dx = static_cast<double>(b.position.x.value)
                                   - static_cast<double>(a.position.x.value);
          const double residual_dy = static_cast<double>(b.position.y.value)
                                   - static_cast<double>(a.position.y.value);
          const double residual_squared = residual_dx * residual_dx + residual_dy * residual_dy;
          if (residual_squared > 0.0 && residual_squared < reach * reach) {
            const double residual_distance = std::sqrt(residual_squared);
            const double residual_overlap = reach - residual_distance;
            b.set_position_x(f32::from_double(static_cast<double>(b.position.x.value)
                                            + residual_dx / residual_distance * residual_overlap));
            b.set_position_y(f32::from_double(static_cast<double>(b.position.y.value)
                                            + residual_dy / residual_distance * residual_overlap));
          }
        }
      }
      // Original 390 tail: a body carrying world flag 32 (the player) receives
      // a fixed 0.2 normal impulse along (self - other). The vector is the
      // pre-correction separation captured at entry, so it is evaluated from
      // dx/dy/distance rather than the already-pushed positions.
      if (distance > 0.0) {
        if ((a.world_flags & 32U) != 0U) {
          a.velocity.x += -dx * 0.2 / distance;
          a.velocity.y += -dy * 0.2 / distance;
        }
        if ((b.world_flags & 32U) != 0U) {
          b.velocity.x += dx * 0.2 / distance;
          b.velocity.y += dy * 0.2 / distance;
        }
      }
      if (debug_entry != nullptr) {
        if (a.handle.raw == contact_debug::target) {
          debug_entry->target_x_after = a.position.x.value;
          debug_entry->target_y_after = a.position.y.value;
          debug_entry->other_x_after = b.position.x.value;
          debug_entry->other_y_after = b.position.y.value;
        } else {
          debug_entry->target_x_after = b.position.x.value;
          debug_entry->target_y_after = b.position.y.value;
          debug_entry->other_x_after = a.position.x.value;
          debug_entry->other_y_after = a.position.y.value;
        }
      }
      const f32 scale = level_damage_scale(world, a.handle, b.handle);
      // Original 162 passes controlling-root equality to 390; its damage
      // tail has no attack-button, movement or AI-aggression gate. Production
      // move tick305 proves an idle Basic petal and worker Ant kill each other.
      // Ordinary mobs share the world's manager root, so their contacts remain
      // non-damaging even when the bodies have different immediate owners.
      const bool suppress_damage = same_controlling_root(world, a.handle, b.handle);
      const f32 damage_to_a = suppress_damage ? f32(0.0F) : b.contact_damage * scale;
      const f32 damage_to_b = suppress_damage ? f32(0.0F) : a.contact_damage * scale;
      const EntityHandle a_handle = a.handle;
      const EntityHandle b_handle = b.handle;
      const EntityHandle a_owner = a_owned ? EntityHandle{a.owner} : EntityHandle{};
      const EntityHandle b_owner = b_owned ? EntityHandle{b.owner} : EntityHandle{};
      if (!suppress_damage && a.kind == EntityKind::kPetal) on_petal_hit(world, a_handle, b_handle, a_owner);
      if (!suppress_damage && b.kind == EntityKind::kPetal) on_petal_hit(world, b_handle, a_handle, b_owner);
      if (damage_to_a.value > 0.0F) (void)damage_entity(world, a_handle, damage_to_a, b_handle);
      if (damage_to_b.value > 0.0F) (void)damage_entity(world, b_handle, damage_to_b, a_handle);
      if (a.kind == EntityKind::kPetal) on_petal_incoming_hit(world, a_handle, b_handle);
      if (b.kind == EntityKind::kPetal) on_petal_incoming_hit(world, b_handle, a_handle);
      if (mass_path && overlap > 0.0) {
        // Original 390 applies damage/death (including spawning loot) before
        // returning to 162 for this split. A newly created drop must retain
        // the dying body's pre-separation position, not its final corpse pose.
        a.set_position_x(f32::from_double(static_cast<double>(a.position.x.value)
                                        - normal_x * overlap * weight_a));
        a.set_position_y(f32::from_double(static_cast<double>(a.position.y.value)
                                        - normal_y * overlap * weight_a));
        b.set_position_x(f32::from_double(static_cast<double>(b.position.x.value)
                                        + normal_x * overlap * weight_b));
        b.set_position_y(f32::from_double(static_cast<double>(b.position.y.value)
                                        + normal_y * overlap * weight_b));
      }
      ++contacts;
      // The contact query returns 1 when its querying body dies,
      // aborting the remaining node/child traversal after this complete pair.
      if (a.health.value <= 0.0F) break;
    }
  }
  return contacts;
}

} // namespace engine

extern "C" void sp_server_debug_set_contact_order(int order) {
  engine::contact_debug::contact_order = order;
}

extern "C" void sp_server_debug_set_contact_target(std::uint32_t handle) {
  engine::contact_debug::target = handle;
  engine::contact_debug::record_all = false;
  engine::contact_debug::count = 0;
  for (auto& entry : engine::contact_debug::entries) entry = engine::contact_debug::Entry{};
}

extern "C" void sp_server_debug_record_all_contacts(std::uint32_t enable) {
  engine::contact_debug::target = 0;
  engine::contact_debug::record_all = enable != 0U;
  engine::contact_debug::count = 0;
  for (auto& entry : engine::contact_debug::entries) entry = engine::contact_debug::Entry{};
}

extern "C" std::uint32_t sp_server_debug_contact_count(void) {
  return engine::contact_debug::count;
}

extern "C" float sp_server_debug_contact_field(std::uint32_t index, std::uint32_t field) {
  using engine::contact_debug::Entry;
  const auto& entries = engine::contact_debug::entries;
  if (index >= entries.size()) return 0.0F;
  const Entry& entry = entries[index];
  switch (field) {
    case 0: return static_cast<float>(entry.target & 0xFFFFU);
    case 1: return static_cast<float>(entry.other & 0xFFFFU);
    case 11: return static_cast<float>((entry.target >> 16) & 0xFFFFU);
    case 12: return static_cast<float>((entry.other >> 16) & 0xFFFFU);
    case 13: return static_cast<float>(entry.sequence);
    case 2: return static_cast<float>(entry.overlap);
    case 3: return entry.target_x_before;
    case 4: return entry.target_y_before;
    case 5: return entry.other_x_before;
    case 6: return entry.other_y_before;
    case 7: return entry.target_x_after;
    case 8: return entry.target_y_after;
    case 9: return entry.other_x_after;
    case 10: return entry.other_y_after;
    default: return 0.0F;
  }
}

extern "C" float sp_server_debug_last_damage(std::uint32_t field) {
  switch (field) {
    case 0: return engine::damage_debug::last.valid ? 1.0F : 0.0F;
    case 1: return static_cast<float>(engine::damage_debug::last.target);
    case 2: return static_cast<float>(engine::damage_debug::last.source);
    case 3: return engine::damage_debug::last.amount;
    case 4: return static_cast<float>(engine::damage_debug::last.tick);
    default: return 0.0F;
  }
}
