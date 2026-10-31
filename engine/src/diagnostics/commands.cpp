#include "engine/abi.h"
#include "engine/net/packet_key.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/petals.hpp"
#include <cmath>
#include <cstddef>
#include <new>
#include <span>
#include <vector>

namespace engine { WorkerApi& current_worker_api(); }

extern "C" std::uint32_t sp_server_player_handle(void) {
  return engine::current_worker_api().world().player().valid() ? engine::current_worker_api().world().player().raw : 0U;
}

extern "C" std::uint32_t sp_server_player_valid(void) {
  return engine::current_worker_api().world().entities().get(engine::current_worker_api().world().player()) != nullptr ? 1U : 0U;
}

extern "C" std::uint32_t sp_server_debug_set_entity_field(
    std::uint32_t handle, std::uint32_t field, double value) {
  engine::Entity* entity = engine::current_worker_api().world().entities().get(engine::EntityHandle{handle});
  if (entity == nullptr || !std::isfinite(value)) return 0U;
  switch (field) {
    case 0: entity->set_position_x(engine::f32::from_double(value)); break;
    case 1: entity->set_position_y(engine::f32::from_double(value)); break;
    case 2: entity->velocity.x = value; break;
    case 3: entity->velocity.y = value; break;
    default: return 0U;
  }
  entity->bounds_dirty = true;
  return 1U;
}

extern "C" std::uint32_t sp_server_debug_spawn_mob(std::uint32_t type_id, float x, float y) {
  const engine::EntityHandle handle = engine::spawn_entity_from_defaults(
    engine::current_worker_api().world(), engine::EntityKind::kMob, static_cast<std::uint16_t>(type_id),
    engine::Vec2(engine::f32(x), engine::f32(y)));
  return handle.valid() ? handle.raw : 0U;
}

extern "C" std::uint32_t sp_server_debug_set_loadout_slot(std::uint32_t slot,
                                                           std::uint32_t type_id) {
  if (slot >= 8U || type_id > 65535U) return 0U;
  auto& world = engine::current_worker_api().world();
  if (!world.player().valid()) return 0U;
  if (!world.loadout().change_slot_type(world, world.profile(),
        static_cast<std::uint8_t>(slot), static_cast<std::uint16_t>(type_id))) return 0U;
  for (std::uint8_t instance = 0; instance < 3U; ++instance) {
    world.loadout().set_pending(static_cast<std::uint8_t>(slot), instance, false);
    world.loadout().set_pending_timer(static_cast<std::uint8_t>(slot), instance, 0U);
  }
  (void)engine::spawn_loadout_petals(world);
  return 1U;
}
