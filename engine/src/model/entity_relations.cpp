#include "engine/model/entity_relations.hpp"
#include "engine/model/world.hpp"
namespace engine {
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
    return handle;
  }
  return handle;
}
}
