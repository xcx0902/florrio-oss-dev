#include "engine/diagnostics/entities.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/petals.hpp"
#include <cmath>

namespace engine::diagnostics {
bool set_entity_field(World& world, EntityHandle handle, std::uint32_t field, double value) {
  Entity* entity = world.entities().get(handle);
  if (entity == nullptr || !std::isfinite(value)) return false;
  switch (field) {
    case 0: entity->set_position_x(f32::from_double(value)); break;
    case 1: entity->set_position_y(f32::from_double(value)); break;
    case 2: entity->velocity.x = value; break;
    case 3: entity->velocity.y = value; break;
    default: return false;
  }
  entity->bounds_dirty = true;
  return true;
}
EntityHandle spawn_mob(World& world, std::uint16_t type_id, Vec2 position) {
  return spawn_entity_from_defaults(world, EntityKind::kMob, type_id, position);
}
bool set_loadout_slot(World& world, PlayerId id, std::uint32_t slot, std::uint32_t type_id) {
  auto* owner = world.players().get(id);
  if (owner == nullptr) return false;
  auto& state = *owner;
  if (slot >= 8U || type_id > 65535U || !state.player().valid()) return false;
  if (!state.loadout().change_slot_type(world, state, state.profile(),
      static_cast<std::uint8_t>(slot), static_cast<std::uint16_t>(type_id))) return false;
  for (std::uint8_t instance = 0; instance < 3U; ++instance) {
    state.loadout().set_pending(static_cast<std::uint8_t>(slot), instance, false);
    state.loadout().set_pending_timer(static_cast<std::uint8_t>(slot), instance, 0U);
  }
  (void)spawn_loadout_petals(world, state);
  return true;
}
} // namespace engine::diagnostics
