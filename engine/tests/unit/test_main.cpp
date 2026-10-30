#include "engine/abi.h"
#include "engine/core/byte_reader.hpp"
#include "engine/core/f32.hpp"
#include "engine/core/fixed_step.hpp"
#include "engine/core/rng.hpp"
#include "engine/core/vec2.hpp"
#include "engine/model/catalog.hpp"
#include "engine/model/component_store.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/world.hpp"
#include "engine/net/input.hpp"
#include "engine/net/angle.hpp"
#include "engine/net/protocol.hpp"
#include "engine/net/snapshot_writer.hpp"
#include "engine/net/snapshot_writer.hpp"

#include "engine/net/dense_fields.hpp"
#include "engine/sim/quadtree.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/collision.hpp"
#include "engine/sim/collision_filter.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/damage.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/petal_orbit.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"

#include <array>
#include <algorithm>
#include <map>
#include "engine/net/packet_key.hpp"
#include <cmath>
#include <cstdio>
#include <cstring>
#include <set>
#include <cstdint>
#include <vector>

#include "../support/test_support.hpp"

namespace {

#include "cases/core.inc"
#include "cases/entity_pool.inc"
#include "cases/spawn_loadout.inc"
#include "cases/snapshot_codec.inc"
#include "cases/worker_api.inc"
#include "cases/catalog.inc"
#include "cases/ai.inc"
#include "cases/snapshot_domain.inc"
#include "cases/combat_ai.inc"
#include "cases/snapshot_dense.inc"
#include "cases/ai_families.inc"
#include "cases/core_tail.inc"

int main(int argc, char** argv) {
  engine::test::tapOutput = argc > 1 && std::strcmp(argv[1], "--tap") == 0;
  if (engine::test::tapOutput) std::printf("TAP version 13\n");
  engine::test::runTest("test_f32", test_f32);
  engine::test::runTest("test_vec2", test_vec2);
  engine::test::runTest("test_rng", test_rng);
  engine::test::runTest("test_varint_roundtrip", test_varint_roundtrip);
  engine::test::runTest("test_byte_reader_bounds", test_byte_reader_bounds);
  engine::test::runTest("test_xor", test_xor);
  engine::test::runTest("test_fixed_step", test_fixed_step);
  engine::test::runTest("test_entity_handle", test_entity_handle);
  engine::test::runTest("test_entity_pool", test_entity_pool);
  engine::test::runTest("test_world_tick", test_world_tick);
  engine::test::runTest("test_spawn_table", test_spawn_table);
  engine::test::runTest("test_drop_pickup", test_drop_pickup);
  engine::test::runTest("test_profile_discard_and_swap", test_profile_discard_and_swap);
  engine::test::runTest("test_discard_removes_petals", test_discard_removes_petals);
  engine::test::runTest("test_cactus_construction", test_cactus_construction);
  engine::test::runTest("test_player_spawn", test_player_spawn);
  engine::test::runTest("test_player_loadout", test_player_loadout);
  engine::test::runTest("test_populate_world", test_populate_world);
  engine::test::runTest("test_petals", test_petals);
  engine::test::runTest("test_zone_restriction", test_zone_restriction);
  engine::test::runTest("test_petal_orbit", test_petal_orbit);
  engine::test::runTest("test_spawn_and_movement", test_spawn_and_movement);
  engine::test::runTest("test_collision", test_collision);
  engine::test::runTest("test_damage_and_effects", test_damage_and_effects);
  engine::test::runTest("test_petal_orbit_profiles", test_petal_orbit_profiles);
  engine::test::runTest("test_input_decoder", test_input_decoder);
  engine::test::runTest("test_snapshot_header", test_snapshot_header);
  engine::test::runTest("test_snapshot_writer_fields", test_snapshot_writer_fields);
  engine::test::runTest("test_dense_field_catalog", test_dense_field_catalog);
  engine::test::runTest("test_progression", test_progression);
  engine::test::runTest("test_reward_health_and_level_cap", test_reward_health_and_level_cap);
  engine::test::runTest("test_player_default_spawn", test_player_default_spawn);
  engine::test::runTest("test_petal_combat_catalog", test_petal_combat_catalog);
  engine::test::runTest("test_drop_chances", test_drop_chances);
  engine::test::runTest("test_loot_retention", test_loot_retention);
  engine::test::runTest("test_healing_clamp", test_healing_clamp);
  engine::test::runTest("test_contact_combat_and_loot", test_contact_combat_and_loot);
  engine::test::runTest("test_multi_instance_orbit_spacing", test_multi_instance_orbit_spacing);
  engine::test::runTest("test_twin_widens_orbit_spacing", test_twin_widens_orbit_spacing);
  engine::test::runTest("test_orbit_reindex_after_removal", test_orbit_reindex_after_removal);
  engine::test::runTest("test_flag41_slot_without_component_keeps_shared_position", test_flag41_slot_without_component_keeps_shared_position);
  engine::test::runTest("test_peas_attack_consumes_petal", test_peas_attack_consumes_petal);
  engine::test::runTest("test_rose_healing", test_rose_healing);
  engine::test::runTest("test_rose_contracts_orbit_and_heals_promptly", test_rose_contracts_orbit_and_heals_promptly);
  engine::test::runTest("test_rose_timer_arms_at_full_health", test_rose_timer_arms_at_full_health);
  engine::test::runTest("test_petal_recharge", test_petal_recharge);
  engine::test::runTest("test_auto_population", test_auto_population);
  engine::test::runTest("test_ant_hole_children", test_ant_hole_children);
  engine::test::runTest("test_population_targets", test_population_targets);
  engine::test::runTest("test_worker_api_default_spawn", test_worker_api_default_spawn);
  engine::test::runTest("test_ai_target_selection", test_ai_target_selection);
  engine::test::runTest("test_collision_layer_filter", test_collision_layer_filter);
  engine::test::runTest("test_status_effects_and_slow", test_status_effects_and_slow);
  engine::test::runTest("test_slow_scales_player_control_impulse", test_slow_scales_player_control_impulse);
  engine::test::runTest("test_slow_does_not_scale_integrate_movement", test_slow_does_not_scale_integrate_movement);
  engine::test::runTest("test_attribution_and_legendary", test_attribution_and_legendary);
  engine::test::runTest("test_loadout_restore_and_backpack", test_loadout_restore_and_backpack);
  engine::test::runTest("test_petal_special_effects", test_petal_special_effects);
  engine::test::runTest("test_domain_profile_snapshot", test_domain_profile_snapshot);
  engine::test::runTest("test_player_loadout_replication", test_player_loadout_replication);
  engine::test::runTest("test_snapshot_angle_quantization", test_snapshot_angle_quantization);
  engine::test::runTest("test_camera_snapshot_deltas", test_camera_snapshot_deltas);
  engine::test::runTest("test_pickup_transfer_snapshot", test_pickup_transfer_snapshot);
  engine::test::runTest("test_domain_snapshot", test_domain_snapshot);
  engine::test::runTest("test_domain_boot_visibility", test_domain_boot_visibility);
  engine::test::runTest("test_full_field_framing", test_full_field_framing);
  engine::test::runTest("test_full_field_effect_flags", test_full_field_effect_flags);
  engine::test::runTest("test_input_discard_deletion_then_swap", test_input_discard_deletion_then_swap);
  engine::test::runTest("test_domain_dense_live_values", test_domain_dense_live_values);
  engine::test::runTest("test_default_dense_groups", test_default_dense_groups);
  engine::test::runTest("test_domain_dense_player_wire_boundaries", test_domain_dense_player_wire_boundaries);
  engine::test::runTest("test_player_input_appearance", test_player_input_appearance);
  engine::test::runTest("test_ai_family_profiles", test_ai_family_profiles);
  engine::test::runTest("test_quadtree_order_and_collision_bounds", test_quadtree_order_and_collision_bounds);
  engine::test::runTest("test_area_effects_and_deferred_launch", test_area_effects_and_deferred_launch);
  engine::test::runTest("test_attribution_death_and_pickups", test_attribution_death_and_pickups);
  engine::test::runTest("test_killer_name_uses_attacker_identity", test_killer_name_uses_attacker_identity);
  engine::test::runTest("test_loadout_exact_layout", test_loadout_exact_layout);
  engine::test::runTest("test_alert_to_attacker_is_local", test_alert_to_attacker_is_local);
  engine::test::runTest("test_ai_recovered_species_profiles", test_ai_recovered_species_profiles);
  engine::test::runTest("test_ai_behavior_modifiers", test_ai_behavior_modifiers);
  engine::test::runTest("test_hornet_stinger_callback", test_hornet_stinger_callback);
  engine::test::runTest("test_hornet_stinger_lifecycle", test_hornet_stinger_lifecycle);
  engine::test::runTest("test_ai_target_motion_and_guard", test_ai_target_motion_and_guard);
  engine::test::runTest("test_centipede_exact_chain_and_rare", test_centipede_exact_chain_and_rare);
  engine::test::runTest("test_ai_round_before_remainder", test_ai_round_before_remainder);
  engine::test::runTest("test_ai_activity_branch_and_wire", test_ai_activity_branch_and_wire);
  engine::test::runTest("test_ant_hole_exact_children", test_ant_hole_exact_children);
  engine::test::runTest("test_ant_hole_release", test_ant_hole_release);
  engine::test::runTest("test_web_tag_domain_side_effects", test_web_tag_domain_side_effects);
  engine::test::runTest("test_world_clock_tracks_tick", test_world_clock_tracks_tick);
  engine::test::runTest("test_loadout_reserve_cycle_and_packet_cache", test_loadout_reserve_cycle_and_packet_cache);
  engine::test::runTest("test_quadtree", test_quadtree);
  engine::test::runTest("test_quadtree_compaction_order", test_quadtree_compaction_order);
  engine::test::runTest("test_catalog", test_catalog);
  engine::test::runTest("test_entity_spawn_defaults", test_entity_spawn_defaults);
  engine::test::runTest("test_rock_construction", test_rock_construction);
  engine::test::runTest("test_spatial_query", test_spatial_query);
  engine::test::runTest("test_component_store", test_component_store);

  engine::test::runTest("test_state_dump", test_state_dump);
  engine::test::runTest("test_contact_nearest_candidate_first", test_contact_nearest_candidate_first);
  engine::test::runTest("test_chain_constraint_clamps_segments", test_chain_constraint_clamps_segments);
  engine::test::runTest("test_worker_api", test_worker_api);
  engine::test::runTest("test_world_initialize", test_world_initialize);
  engine::test::runTest("test_protocol_constants", test_protocol_constants);
  engine::test::runTest("test_collision_bounds_cache_rebuild_counter", test_collision_bounds_cache_rebuild_counter);
  engine::test::runTest("test_loadout_flag41_pending_cache", test_loadout_flag41_pending_cache);
  engine::test::runTest("test_loadout_slot_epochs_bump_on_change", test_loadout_slot_epochs_bump_on_change);
  engine::test::runTest("test_loadout_pending_cache_order", test_loadout_pending_cache_order);
  engine::test::runTest("test_effect_payload_released_on_destroy", test_effect_payload_released_on_destroy);
  engine::test::runTest("test_tick_phase_trace", test_tick_phase_trace);
  engine::test::runTest("test_quadtree_update_counter", test_quadtree_update_counter);
  engine::test::runTest("test_deferred_launch_due_order", test_deferred_launch_due_order);
  if (engine::test::tapOutput) {
    std::printf("1..%d\n", engine::test::testsRun);
    std::printf("# pass %d\n", engine::test::testsRun - engine::test::testsFailed);
    std::printf("# fail %d\n", engine::test::testsFailed);
  }
  if (engine::test::failures != 0) {
    std::fprintf(stderr, "%d test(s) failed\n", engine::test::failures);
    return 1;
  }
  if (!engine::test::tapOutput) std::printf("all engine unit tests passed\n");
  return 0;
}