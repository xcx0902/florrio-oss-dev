#include "engine/model/entity_relations.hpp"
#include "engine/model/world.hpp"
#include "engine/model/catalog.hpp"
namespace engine {
DamageSource damage_source(const World& world, EntityHandle handle) {
  const Entity* entity = world.entities().get(handle);
  DamageSource result;
  result.entity = handle;
  if (entity == nullptr) return result;
  if (entity->attribution.entity.valid()) result = entity->attribution;
  else {
    const auto owner = owning_player(world, handle);
    if (const auto* state = world.players().by_body(owner)) {
      result.player = state->id();
      result.body = owner;
      result.life = state->life_epoch;
      result.name = state->player_name();
    } else {
      EntityHandle root = handle;
      for (unsigned guard = 0; guard < 16; ++guard) {
        const auto* candidate = world.entities().get(root);
        if (candidate == nullptr) break;
        if (candidate->kind == EntityKind::kMob) {
          if (const auto* definition = Catalog::instance().entity(candidate->type_id))
            result.name = definition->name;
          break;
        }
        if (candidate->owner == kInvalidEntity) break;
        root = EntityHandle{candidate->owner};
      }
    }
  }
  result.entity = handle;
  result.kind = entity->kind;
  result.type_id = entity->type_id;
  return result;
}
PlayerId owning_player_id(const World& world, EntityHandle handle) {
  return damage_source(world, handle).player;
}
void inherit_entity_owner(World& world, EntityHandle child, EntityHandle parent) {
  auto* entity = world.entities().get(child);
  if (entity == nullptr) return;
  entity->owner = parent.valid() ? parent.raw : kInvalidEntity;
  entity->attribution = damage_source(world, parent);
  entity->attribution.entity = child;
  entity->attribution.kind = entity->kind;
  entity->attribution.type_id = entity->type_id;
  entity->control_root = controlling_root(world, parent);
  const auto* root = world.entities().get(entity->control_root);
  const auto* owner = world.entities().get(parent);
  entity->world_controlled = root != nullptr ? root->kind == EntityKind::kMob
    : owner != nullptr && owner->world_controlled;
}
EntityHandle owning_player(const World& world, EntityHandle attacker) {
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
EntityHandle controlling_root(const World& world, EntityHandle handle) {
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    const Entity* entity = world.entities().get(handle);
    if (entity == nullptr) return handle;
    if (entity->owner != std::numeric_limits<std::uint32_t>::max()) {
      const EntityHandle owner{entity->owner};
      if (world.entities().get(owner) != nullptr) {
        handle = owner;
        continue;
      }
    }
    return entity->control_root.valid() ? entity->control_root : handle;
  }
  return handle;
}
}
