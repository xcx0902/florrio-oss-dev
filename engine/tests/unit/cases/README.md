# Engine test case map

`test_main.cpp` is only the runner/support include. Every case below lives in one
`cases/*.inc` translation-unit fragment included in original order, so helper
visibility and test order are unchanged from the pre-split file. The total is
113 tests, matching the pre-split runner count after the archived fixed-layout wrappers were retired.

| Case file | Tests | Count |
| --- | --- | ---: |
| `ai.inc` | `test_ai_target_selection`, `test_collision_layer_filter`, `test_status_effects_and_slow`, `test_slow_scales_player_control_impulse`, `test_slow_does_not_scale_integrate_movement`, `test_attribution_and_legendary`, `test_loadout_restore_and_backpack`, `test_petal_special_effects` | 8 |
| `ai_families.inc` | `test_ai_recovered_species_profiles`, `test_ai_behavior_modifiers`, `test_hornet_stinger_callback`, `test_hornet_stinger_lifecycle`, `test_ai_target_motion_and_guard`, `test_centipede_exact_chain_and_rare`, `test_ai_round_before_remainder`, `test_ai_activity_branch_and_wire`, `test_ant_hole_exact_children`, `test_ant_hole_release`, `test_web_tag_domain_side_effects` | 11 |
| `catalog.inc` | `test_dense_field_catalog`, `test_progression`, `test_reward_health_and_level_cap`, `test_player_default_spawn`, `test_petal_combat_catalog`, `test_drop_chances`, `test_loot_retention`, `test_healing_clamp`, `test_contact_combat_and_loot`, `test_multi_instance_orbit_spacing`, `test_orbit_reindex_after_removal`, `test_flag41_slot_without_component_keeps_shared_position`, `test_peas_attack_consumes_petal`, `test_twin_widens_orbit_spacing`, `test_rose_healing`, `test_rose_contracts_orbit_and_heals_promptly`, `test_rose_timer_arms_at_full_health`, `test_petal_recharge`, `test_auto_population`, `test_ant_hole_children`, `test_population_targets`, `test_worker_api_default_spawn` | 22 |
| `combat_ai.inc` | `test_ai_family_profiles`, `test_quadtree_compaction_order`, `test_quadtree_order_and_collision_bounds`, `test_area_effects_and_deferred_launch`, `test_attribution_death_and_pickups`, `test_killer_name_uses_attacker_identity`, `test_loadout_exact_layout`, `test_alert_to_attacker_is_local` | 8 |
| `core.inc` | `test_f32`, `test_vec2`, `test_rng`, `test_varint_roundtrip`, `test_byte_reader_bounds`, `test_xor`, `test_fixed_step` | 7 |
| `core_tail.inc` | `test_world_clock_tracks_tick`, `test_loadout_reserve_cycle_and_packet_cache`, `test_contact_nearest_candidate_first`, `test_chain_constraint_clamps_segments`, `test_collision_bounds_cache_rebuild_counter`, `test_loadout_flag41_pending_cache`, `test_loadout_slot_epochs_bump_on_change`, `test_loadout_pending_cache_order`, `test_effect_payload_released_on_destroy`, `test_tick_phase_trace`, `test_quadtree_update_counter`, `test_deferred_launch_due_order` | 12 |
| `entity_pool.inc` | `test_entity_handle`, `test_entity_pool`, `test_world_tick`, `test_zone_restriction`, `test_petal_orbit` | 5 |
| `snapshot_codec.inc` | `test_input_decoder`, `test_snapshot_header`, `test_snapshot_writer_fields` | 3 |
| `snapshot_dense.inc` | `test_domain_dense_live_values`, `test_default_dense_groups`, `test_domain_dense_player_wire_boundaries`, `test_full_field_framing`, `test_full_field_effect_flags`, `test_input_discard_deletion_then_swap` | 6 |
| `snapshot_domain.inc` | `test_domain_profile_snapshot`, `test_player_loadout_replication`, `test_snapshot_angle_quantization`, `test_camera_snapshot_deltas`, `test_pickup_transfer_snapshot`, `test_domain_boot_visibility`, `test_domain_snapshot` | 7 |
| `spawn_loadout.inc` | `test_petals`, `test_populate_world`, `test_player_loadout`, `test_profile_discard_and_swap`, `test_discard_removes_petals`, `test_cactus_construction`, `test_player_spawn`, `test_drop_pickup`, `test_spawn_table`, `test_spawn_and_movement`, `test_collision`, `test_damage_and_effects`, `test_petal_orbit_profiles` | 13 |
| `worker_api.inc` | `test_world_initialize`, `test_player_input_appearance`, `test_state_dump`, `test_worker_api`, `test_rock_construction`, `test_entity_spawn_defaults`, `test_spatial_query`, `test_component_store`, `test_catalog`, `test_protocol_constants`, `test_quadtree` | 11 |

**Total: 113**


## Required category coverage

The split follows the goal's ten categories by dominant topic. Some files cover
adjacent behavior (for example `catalog.inc` includes loot and combat cases),
but no category was dropped and no test was renamed to hide a move.

| Category | Case files |
| --- | --- |
| core | `core.inc`, `core_tail.inc` |
| entity_pool | `entity_pool.inc` |
| spawn | `spawn_loadout.inc` |
| ai | `ai.inc`, `ai_families.inc`, `combat_ai.inc` |
| collision | `worker_api.inc`, `core_tail.inc` |
| combat_death | `combat_ai.inc`, `catalog.inc`, `snapshot_dense.inc` |
| effects | `snapshot_dense.inc`, `catalog.inc` |
| loadout | `spawn_loadout.inc`, `catalog.inc` |
| snapshot | `snapshot_codec.inc`, `snapshot_domain.inc`, `snapshot_dense.inc` |
| worker_api | `worker_api.inc` |

The CTest target remains `engine_tests`; no per-file executable or new
registration framework was introduced. The support macros/globals are in
`engine/tests/support/test_support.hpp`.
