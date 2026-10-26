#pragma once
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

/** Worker-facing ABI. The final implementation will be compiled to wasm and
 * called by client/public/server-worker.js with the original message shape. */
void sp_server_init(void);
void sp_server_send(const std::uint8_t* data, std::uint32_t length);
void sp_server_think(void);
void sp_server_flush(void);

/** Output queue access for the worker shim. Call after sp_server_flush. */
std::uint32_t sp_server_entity_count(void);
std::uint32_t sp_server_output_count(void);
const std::uint8_t* sp_server_output_data(std::uint32_t index);
std::uint32_t sp_server_output_size(std::uint32_t index);

/** Deterministic state trace used by tools/parity/server-state-trace.mjs.
 * The digest covers every active entity's handle, type, position and health. */
std::uint64_t sp_server_state_digest(void);
std::uint32_t sp_server_state_count(void);
double sp_server_state_sum_x(void);
double sp_server_state_sum_y(void);
double sp_server_state_sum_health(void);
double sp_server_state_min_x(void);
double sp_server_state_max_x(void);
double sp_server_state_min_y(void);
double sp_server_state_max_y(void);
/** Packed per-entity state dump for the strict semantic trace diff.
 * Records are 32 bytes: u32 handle, u16 type, u8 kind, u8 reserved,
 * f32 x/y/angle/radius/health/maxHealth. Returns the active count; writes at
 * most capacity records. Call with capacity 0 to query the count. */
std::uint32_t sp_server_state_record_size(void);
std::uint32_t sp_server_state_dump(std::uint8_t* output, std::uint32_t capacity);
std::uint32_t sp_server_player_handle(void);
std::uint32_t sp_server_player_valid(void);
float sp_server_player_x(void);
float sp_server_player_y(void);
float sp_server_player_health(void);

/** Controlled fixture-only mutations; never called by the worker protocol. */
std::uint32_t sp_server_debug_set_entity_field(std::uint32_t handle, std::uint32_t field, double value);
std::uint32_t sp_server_debug_fire_attack(std::uint32_t handle);
std::uint32_t sp_server_debug_entity_owner(std::uint32_t handle);

/** Read-only diagnostics for the semantic trace diff. */
std::uint32_t sp_server_debug_ai_targets(void);
std::uint32_t sp_server_debug_player_nearby(void);
std::uint32_t sp_server_debug_death_count(void);
std::uint32_t sp_server_debug_last_death_type(void);
std::uint32_t sp_server_debug_last_death_kind(void);
std::uint32_t sp_server_debug_last_death_attacker_kind(void);
std::uint32_t sp_server_debug_last_death_attacker_type(void);
double sp_server_debug_last_death_x(void);
double sp_server_debug_last_death_y(void);
double sp_server_debug_last_death_tick(void);
std::uint32_t sp_server_debug_petal_count(void);
std::uint32_t sp_server_debug_kind_count(std::uint32_t kind);
std::uint32_t sp_server_debug_drop_type(std::uint32_t index);
float sp_server_debug_mob_x(std::uint32_t type_id, std::uint32_t index);
float sp_server_debug_mob_y(std::uint32_t type_id, std::uint32_t index);
float sp_server_debug_mob_angle(std::uint32_t type_id, std::uint32_t index);
float sp_server_debug_mob_ai_angle(std::uint32_t type_id, std::uint32_t index);
float sp_server_debug_mob_vx(std::uint32_t type_id, std::uint32_t index);
float sp_server_debug_mob_vy(std::uint32_t type_id, std::uint32_t index);
/** One field of the active entity with the given raw handle, for parity
 * debugging. Returns 0 for an unknown handle or field. Field ids are
 * documented in engine/src/wasm/abi.cpp. */
float sp_server_debug_entity_field(std::uint32_t handle, std::uint32_t field);
/** Contact-resolution diagnostics: set a target handle, run a tick, then read
 * the pairs that moved it. Field ids: 0 target, 1 other, 2 overlap,
 * 3..6 before positions, 7..10 after positions. */
void sp_server_debug_set_contact_target(std::uint32_t handle);
/** Record every processed contact pair (debug only; resets the log). */
void sp_server_debug_record_all_contacts(std::uint32_t enable);
std::uint32_t sp_server_debug_contact_count(void);
float sp_server_debug_contact_field(std::uint32_t index, std::uint32_t field);
std::uint32_t sp_server_debug_linked_roots(void);
std::uint32_t sp_server_debug_linked_segments(void);
float sp_server_debug_last_damage(std::uint32_t field);
std::uint32_t sp_server_debug_mob_count(std::uint32_t type_id);
float sp_server_debug_player_vx(void);
float sp_server_debug_player_ax(void);
float sp_server_debug_player_strength(void);
float sp_server_debug_player_angle(void);
std::uint32_t sp_server_debug_rng(void);
/** Cumulative server-RNG draw count and per-phase snapshots for attribution. */
std::uint32_t sp_server_debug_rng_draws(void);
std::uint32_t sp_server_debug_ai_timer_handle(void);
std::uint32_t sp_server_debug_entity_loot(std::uint32_t handle, std::uint32_t index);
std::uint32_t sp_server_debug_ai_timer_fires(void);
std::uint32_t sp_server_debug_phase_count(void);
std::uint32_t sp_server_debug_phase_draw(std::uint32_t index);
float sp_server_debug_player_vy(void);
float sp_server_debug_petal_x(std::uint32_t index);
float sp_server_debug_petal_y(std::uint32_t index);
float sp_server_debug_petal_angle(std::uint32_t index);

#ifdef __cplusplus
}
#endif
