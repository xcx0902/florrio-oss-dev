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

namespace {

// The standalone wasm module has no CRT constructor pass. Construct the API
// explicitly on first use instead of relying on a global C++ constructor.
alignas(engine::WorkerApi) unsigned char g_api_storage[sizeof(engine::WorkerApi)];
engine::WorkerApi* g_api = nullptr;
std::vector<std::vector<std::uint8_t>> g_flushed;
std::uint32_t g_snapshot_sequence = 0;

std::uint64_t fnv_update(std::uint64_t hash, const void* data, std::size_t size);

engine::WorkerApi& api() {
  if (g_api == nullptr) g_api = new (g_api_storage) engine::WorkerApi();
  return *g_api;
}

} // namespace

extern "C" void sp_server_init(void) {
  if (g_api != nullptr) g_api->~WorkerApi();
  g_api = new (g_api_storage) engine::WorkerApi();
  g_api->init(true);
  g_flushed.clear();
  g_snapshot_sequence = 0;
}

extern "C" void sp_server_send(const std::uint8_t* data, std::uint32_t length) {
  if (data == nullptr || length == 0U) return;
  (void)api().send(std::span<const std::uint8_t>(data, length),
                   std::span<const std::uint8_t>(engine::net::kPacketXorKey));
}

extern "C" void sp_server_think(void) {
  api().think();
  api().enqueue_domain_snapshot(++g_snapshot_sequence);
}

extern "C" void sp_server_flush(void) {
  g_flushed.clear();
  for (auto& packet : api().flush()) g_flushed.push_back(std::move(packet.payload));
}

extern "C" void sp_server_flush_original(void) {
  g_flushed.clear();
  (void)api().flush(); // drain the domain queue; this mode emits original framing
  // Per-think records must be published exactly once. Rebuilding a record at
  // flush time would consume the dirty cache after enqueue already consumed
  // it, silently dropping movement, deaths and control-reference updates.
  for (auto& packet : api().flush_original_client())
    g_flushed.push_back(std::move(packet.payload));
}

extern "C" std::uint32_t sp_server_entity_count(void) {
  return static_cast<std::uint32_t>(api().world().entities().active_count());
}

extern "C" std::uint32_t sp_server_output_count(void) {
  return static_cast<std::uint32_t>(g_flushed.size());
}

extern "C" const std::uint8_t* sp_server_output_data(std::uint32_t index) {
  if (index >= g_flushed.size()) return nullptr;
  return g_flushed[index].data();
}

extern "C" std::uint32_t sp_server_output_size(std::uint32_t index) {
  if (index >= g_flushed.size()) return 0U;
  return static_cast<std::uint32_t>(g_flushed[index].size());
}

namespace {

std::uint64_t fnv_update(std::uint64_t hash, const void* data, std::size_t size) {
  const auto* bytes = static_cast<const std::uint8_t*>(data);
  for (std::size_t index = 0; index < size; ++index) {
    hash ^= static_cast<std::uint64_t>(bytes[index]);
    hash *= 1099511628211ULL;
  }
  return hash;
}

} // namespace

extern "C" std::uint64_t sp_server_state_digest(void) {
  std::uint64_t hash = 1469598103934665603ULL;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active) continue;
    const std::uint32_t handle = entity.handle.raw;
    const std::uint32_t type = entity.type_id;
    const float x = entity.position.x.value;
    const float y = entity.position.y.value;
    const float health = entity.health.value;
    const std::uint8_t kind = static_cast<std::uint8_t>(entity.kind);
    hash = fnv_update(hash, &handle, sizeof(handle));
    hash = fnv_update(hash, &type, sizeof(type));
    hash = fnv_update(hash, &x, sizeof(x));
    hash = fnv_update(hash, &y, sizeof(y));
    hash = fnv_update(hash, &health, sizeof(health));
    hash = fnv_update(hash, &kind, sizeof(kind));
  }
  return hash;
}

extern "C" std::uint32_t sp_server_state_count(void) {
  return static_cast<std::uint32_t>(api().world().entities().active_count());
}

extern "C" double sp_server_state_sum_x(void) {
  double total = 0.0;
  for (const auto& entity : api().world().entities().entities())
    if (entity.active) total += static_cast<double>(entity.position.x.value);
  return total;
}

extern "C" double sp_server_state_sum_y(void) {
  double total = 0.0;
  for (const auto& entity : api().world().entities().entities())
    if (entity.active) total += static_cast<double>(entity.position.y.value);
  return total;
}

extern "C" double sp_server_state_sum_health(void) {
  double total = 0.0;
  for (const auto& entity : api().world().entities().entities())
    if (entity.active) total += static_cast<double>(entity.health.value);
  return total;
}

extern "C" double sp_server_state_min_x(void) {
  double value = 0.0;
  bool first = true;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active) continue;
    const double current = static_cast<double>(entity.position.x.value);
    if (first || current < value) { value = current; first = false; }
  }
  return value;
}

extern "C" double sp_server_state_max_x(void) {
  double value = 0.0;
  bool first = true;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active) continue;
    const double current = static_cast<double>(entity.position.x.value);
    if (first || current > value) { value = current; first = false; }
  }
  return value;
}

extern "C" double sp_server_state_min_y(void) {
  double value = 0.0;
  bool first = true;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active) continue;
    const double current = static_cast<double>(entity.position.y.value);
    if (first || current < value) { value = current; first = false; }
  }
  return value;
}

extern "C" double sp_server_state_max_y(void) {
  double value = 0.0;
  bool first = true;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active) continue;
    const double current = static_cast<double>(entity.position.y.value);
    if (first || current > value) { value = current; first = false; }
  }
  return value;
}

extern "C" std::uint32_t sp_server_state_record_size(void) { return 48U; }

extern "C" std::uint32_t sp_server_state_dump(std::uint8_t* output, std::uint32_t capacity) {
  return api().dump_state(output, capacity);
}

extern "C" std::uint32_t sp_server_player_handle(void) {
  return api().world().player().valid() ? api().world().player().raw : 0U;
}

extern "C" std::uint32_t sp_server_player_valid(void) {
  return api().world().entities().get(api().world().player()) != nullptr ? 1U : 0U;
}

extern "C" float sp_server_player_x(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? entity->position.x.value : 0.0F;
}

extern "C" float sp_server_player_y(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? entity->position.y.value : 0.0F;
}

extern "C" float sp_server_player_health(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? entity->health.value : 0.0F;
}

/** Diagnostics used by tools/parity/server-state-trace.mjs to explain AI and
 * contact divergence. They are read-only observers and do not alter the tick. */
extern "C" std::uint32_t sp_server_debug_ai_targets(void) {  std::uint32_t count = 0;
  for (const engine::EntityHandle handle : api().world().ai_entities()) {
    const engine::Entity* entity = api().world().entities().get(handle);
    if (entity != nullptr && entity->active && entity->ai.target.valid()) ++count;
  }
  return count;
}

extern "C" std::uint32_t sp_server_debug_player_nearby(void) {
  const engine::Entity* player = api().world().entities().get(api().world().player());
  if (player == nullptr) return 0U;
  std::uint32_t count = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    const double dx = static_cast<double>(entity.position.x.value)
                    - static_cast<double>(player->position.x.value);
    const double dy = static_cast<double>(entity.position.y.value)
                    - static_cast<double>(player->position.y.value);
    const double reach = static_cast<double>(entity.collision_radius.value)
                       + static_cast<double>(player->collision_radius.value);
    if (dx * dx + dy * dy < reach * reach) ++count;
  }
  return count;
}

extern "C" std::uint32_t sp_server_debug_death_count(void) {
  return static_cast<std::uint32_t>(api().world().deaths().size());
}

extern "C" std::uint32_t sp_server_debug_last_death_type(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0U : static_cast<std::uint32_t>(deaths.back().type_id);
}

extern "C" std::uint32_t sp_server_debug_last_death_attacker_kind(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0U : static_cast<std::uint32_t>(deaths.back().attacker_kind);
}

extern "C" std::uint32_t sp_server_debug_last_death_attacker_type(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0U : static_cast<std::uint32_t>(deaths.back().attacker_type);
}

extern "C" std::uint32_t sp_server_debug_last_death_kind(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0U : static_cast<std::uint32_t>(deaths.back().kind);
}

extern "C" double sp_server_debug_last_death_x(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0.0 : static_cast<double>(deaths.back().x);
}

extern "C" double sp_server_debug_last_death_y(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0.0 : static_cast<double>(deaths.back().y);
}

extern "C" double sp_server_debug_last_death_tick(void) {
  const auto& deaths = api().world().deaths();
  return deaths.empty() ? 0.0 : static_cast<double>(deaths.back().tick);
}

extern "C" float sp_server_debug_player_ax(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? static_cast<float>(entity->acceleration.x) : 0.0F;
}

extern "C" std::uint32_t sp_server_debug_entity_loot(std::uint32_t handle, std::uint32_t index) {
  const engine::Entity* entity =
    api().world().entities().get(engine::EntityHandle{handle});
  if (entity == nullptr) return 0xFFFFFFFFU;
  if (index == 0U) return entity->loot_count;
  const std::uint32_t slot = index - 1U;
  return slot < entity->loot_petals.size() ? entity->loot_petals[slot] : 0xFFFFFFFFU;
}

extern "C" std::uint32_t sp_server_debug_ai_timer_handle(void) {
  return engine::ai_debug::last_timer_handle;
}

extern "C" std::uint32_t sp_server_debug_ai_timer_fires(void) {
  return engine::ai_debug::timer_fires;
}

extern "C" std::uint32_t sp_server_debug_rng_draws(void) {
  return api().world().rng_draws();
}

extern "C" std::uint32_t sp_server_debug_phase_count(void) {
  return static_cast<std::uint32_t>(api().world().phase_draws().size());
}

extern "C" std::uint32_t sp_server_debug_phase_draw(std::uint32_t index) {
  const auto& draws = api().world().phase_draws();
  return index < draws.size() ? draws[index] : 0U;
}

extern "C" std::uint32_t sp_server_debug_rng(void) {
  return api().world().random().state();
}

extern "C" float sp_server_debug_player_angle(void) {
  return api().world().input().normalized_angle.value;
}

extern "C" float sp_server_debug_player_strength(void) {
  return api().world().input().strength.value;
}

extern "C" float sp_server_debug_player_vx(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? static_cast<float>(entity->velocity.x) : 0.0F;
}

extern "C" float sp_server_debug_player_vy(void) {
  const engine::Entity* entity = api().world().entities().get(api().world().player());
  return entity != nullptr ? static_cast<float>(entity->velocity.y) : 0.0F;
}

extern "C" float sp_server_debug_mob_x(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return entity.position.x.value;
  }
  return 0.0F;
}

extern "C" float sp_server_debug_mob_angle(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return entity.angle.value;
  }
  return 0.0F;
}

extern "C" float sp_server_debug_mob_ai_angle(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return entity.ai.current_angle.value;
  }
  return 0.0F;
}

extern "C" float sp_server_debug_mob_vx(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return static_cast<float>(entity.velocity.x);
  }
  return 0.0F;
}

extern "C" float sp_server_debug_mob_vy(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return static_cast<float>(entity.velocity.y);
  }
  return 0.0F;
}

extern "C" float sp_server_debug_mob_y(std::uint32_t type_id, std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob || entity.type_id != type_id) continue;
    if (seen++ == index) return entity.position.y.value;
  }
  return 0.0F;
}

extern "C" std::uint32_t sp_server_debug_mob_count(std::uint32_t type_id) {
  std::uint32_t count = 0;
  for (const auto& entity : api().world().entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.type_id == type_id) ++count;
  return count;
}

extern "C" std::uint32_t sp_server_debug_drop_type(std::uint32_t index) {
  std::uint32_t seen = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kDrop) continue;
    if (seen++ == index) return entity.type_id;
  }
  return 0U;
}

extern "C" std::uint32_t sp_server_debug_kind_count(std::uint32_t kind) {
  std::uint32_t count = 0;
  for (const auto& entity : api().world().entities().entities()) {
    if (entity.active && static_cast<std::uint32_t>(entity.kind) == kind) ++count;
  }
  return count;
}

extern "C" std::uint32_t sp_server_debug_petal_count(void) {
  return static_cast<std::uint32_t>(api().world().petals().size());
}

extern "C" float sp_server_debug_petal_x(std::uint32_t index) {
  const auto& petals = api().world().petals();
  if (index >= petals.size()) return 0.0F;
  const engine::Entity* entity = api().world().entities().get(petals[index].handle);
  return entity != nullptr ? entity->position.x.value : 0.0F;
}

extern "C" float sp_server_debug_petal_y(std::uint32_t index) {
  const auto& petals = api().world().petals();
  if (index >= petals.size()) return 0.0F;
  const engine::Entity* entity = api().world().entities().get(petals[index].handle);
  return entity != nullptr ? entity->position.y.value : 0.0F;
}

extern "C" float sp_server_debug_petal_angle(std::uint32_t index) {
  const auto& petals = api().world().petals();
  return index < petals.size() ? petals[index].angle.value : 0.0F;
}

/** Numeric view of one active entity, keyed by the raw handle. This exists so
 * tools/parity/server-state-trace.mjs can explain a per-entity difference
 * without exposing component offsets. Unsupported handles/fields return 0. */
extern "C" float sp_server_debug_entity_field(std::uint32_t handle, std::uint32_t field) {
  const engine::Entity* entity = api().world().entities().get(engine::EntityHandle{handle});
  if (entity == nullptr || !entity->active) return 0.0F;
  switch (field) {
    case 0: return entity->position.x.value;
    case 1: return entity->position.y.value;
    case 2: return static_cast<float>(entity->velocity.x);
    case 3: return static_cast<float>(entity->velocity.y);
    case 4: return static_cast<float>(entity->acceleration.x);
    case 5: return static_cast<float>(entity->acceleration.y);
    case 6: return entity->angle.value;
    case 7: return entity->radius.value;
    case 8: return entity->health.value;
    case 9: return entity->max_health.value;
    case 10: return entity->ai.current_angle.value;
    case 11: return entity->ai.idle_speed.value;
    case 12: return static_cast<float>(entity->ai.target.raw);
    case 13: return static_cast<float>(entity->ai.owner.raw);
    case 14: return entity->ai.guard_active ? 1.0F : 0.0F;
    case 15: return entity->ai.guard_point.x.value;
    case 16: return entity->ai.guard_point.y.value;
    case 17: return entity->ai.angle_locked ? 1.0F : 0.0F;
    case 18: return entity->ai.wave_enabled ? 1.0F : 0.0F;
    case 19: return entity->ai.attack_cooldown_ms.value;
    case 20: return entity->ai.attack_range.value;
    case 21: return entity->ai.chase_speed.value;
    case 22: return static_cast<float>(entity->type_id);
    case 23: return entity->ai.drift_rate.value;
    case 24: return entity->ai.wave_frequency.value;
    case 25: return entity->collision_radius.value;
    case 26: return entity->contact_damage.value;
    case 27: return static_cast<float>(entity->ai.predecessor.raw);
    case 28: return entity->ai.sine_frequency.value;
    case 29: return entity->ai.sine_amplitude.value;
    case 30: return static_cast<float>(entity->ai.clock_ms);
    case 31: return entity->ai.sine_enabled ? 1.0F : 0.0F;
    case 32: return static_cast<float>(entity->ai.turn_rate.value);
    case 33: return static_cast<float>(entity->ai.timer_deadline_ms);
    case 34: return entity->ai.timer_active ? 1.0F : 0.0F;
    case 35: return static_cast<float>(entity->ai.timer_interval_ms);
    case 36: return static_cast<float>(entity->lifetime_remaining_ms);
    case 37: return static_cast<float>(entity->owner);
    case 38: {
      const auto& order = api().world().ai_entities();
      const auto found = std::find(order.begin(), order.end(), entity->handle);
      return found == order.end() ? -1.0F : static_cast<float>(found - order.begin());
    }
    default: return 0.0F;
  }
}

extern "C" std::uint32_t sp_server_debug_linked_roots(void) {
  return engine::debug_linked_roots(api().world());
}
extern "C" std::uint32_t sp_server_debug_linked_segments(void) {
  return engine::debug_linked_segments(api().world());
}

/** Controlled parity-fixture mutations. Unlike the read-only state dump these
 * are explicit debug calls, never used by the worker message protocol. */
extern "C" std::uint32_t sp_server_debug_set_entity_field(
    std::uint32_t handle, std::uint32_t field, double value) {
  engine::Entity* entity = api().world().entities().get(engine::EntityHandle{handle});
  if (entity == nullptr || !std::isfinite(value)) return 0U;
  switch (field) {
    case 0: entity->set_position_x(engine::f32::from_double(value)); break;
    case 1: entity->set_position_y(engine::f32::from_double(value)); break;
    case 2: entity->velocity.x = value; break;
    case 3: entity->velocity.y = value; break;
    case 4: entity->acceleration.x = value; break;
    case 5: entity->acceleration.y = value; break;
    case 6: entity->angle = engine::f32::from_double(value); break;
    case 8: entity->health = engine::f32::from_double(value); break;
    case 9: entity->max_health = engine::f32::from_double(value); break;
    case 10: entity->ai.current_angle = engine::f32::from_double(value); break;
    case 12: entity->ai.target = engine::EntityHandle{static_cast<std::uint32_t>(value)}; break;
    case 19: entity->ai.attack_cooldown_ms = engine::f32::from_double(value); break;
    case 36: entity->lifetime_remaining_ms = value; break;
    default: return 0U;
  }
  entity->bounds_dirty = true;
  return 1U;
}


/** Development cheat: spawn a mob by catalogue id at a world position. */
extern "C" std::uint32_t sp_server_debug_spawn_mob(std::uint32_t type_id, float x, float y) {
  const engine::EntityHandle handle = engine::spawn_entity_from_defaults(
    api().world(), engine::EntityKind::kMob, static_cast<std::uint16_t>(type_id),
    engine::Vec2(engine::f32(x), engine::f32(y)));
  return handle.valid() ? handle.raw : 0U;
}

/** Development cheat: replace one loadout slot and respawn it immediately. */
extern "C" std::uint32_t sp_server_debug_set_loadout_slot(std::uint32_t slot,
                                                           std::uint32_t type_id) {
  if (slot >= 8U || type_id > 65535U) return 0U;
  auto& world = api().world();
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

extern "C" std::uint32_t sp_server_debug_fire_attack(std::uint32_t handle) {
  return engine::dispatch_attack_callback(api().world(), engine::EntityHandle{handle}) ? 1U : 0U;
}

extern "C" std::uint32_t sp_server_debug_entity_owner(std::uint32_t handle) {
  const engine::Entity* entity = api().world().entities().get(engine::EntityHandle{handle});
  return entity != nullptr ? entity->owner : 0xFFFFFFFFU;
}
