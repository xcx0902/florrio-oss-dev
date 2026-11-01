// Offline-only ABI thunks. Core mutations always take an explicit World.
#include "engine/abi.h"
#include "engine/diagnostics/entities.hpp"
#include "engine/net/worker_api.hpp"

namespace engine { WorkerApi& current_worker_api(); }

extern "C" std::uint32_t sp_server_player_handle(void) {
  const auto handle = engine::current_worker_api().world().player();
  return handle.valid() ? handle.raw : 0U;
}
extern "C" std::uint32_t sp_server_player_valid(void) {
  auto& world = engine::current_worker_api().world();
  return world.entities().get(world.player()) != nullptr ? 1U : 0U;
}
extern "C" std::uint32_t sp_server_debug_set_entity_field(
    std::uint32_t handle, std::uint32_t field, double value) {
  return engine::diagnostics::set_entity_field(engine::current_worker_api().world(),
      engine::EntityHandle{handle}, field, value) ? 1U : 0U;
}
extern "C" std::uint32_t sp_server_debug_spawn_mob(std::uint32_t type_id, float x, float y) {
  const auto handle = engine::diagnostics::spawn_mob(engine::current_worker_api().world(),
      static_cast<std::uint16_t>(type_id), engine::Vec2(engine::f32(x), engine::f32(y)));
  return handle.valid() ? handle.raw : 0U;
}
extern "C" std::uint32_t sp_server_debug_set_loadout_slot(std::uint32_t slot, std::uint32_t type_id) {
  return engine::diagnostics::set_loadout_slot(engine::current_worker_api().world(), slot, type_id) ? 1U : 0U;
}
