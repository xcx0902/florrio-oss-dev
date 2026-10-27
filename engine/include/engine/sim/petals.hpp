#pragma once
#include "engine/core/vec2.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/world.hpp"
#include "engine/sim/petal_slot.hpp"
#include <cstdint>

namespace engine {

/** Position on a petal orbit. Angle is radians; the result stays binary32. */
[[nodiscard]] Vec2 orbit_position(Vec2 center, f32 radius, f32 angle);

/** Catalog radius for a petal type id, or zero when unknown. */
[[nodiscard]] f32 petal_radius(std::uint16_t type_id);

/** Spawn a petal entity at its orbit position using the catalog draw radius,
 * collision radius, damage and maximum health from the recovered initializer.
 * `orbit_index` is the ring slot assigned by original function 85 (petal +18). */
[[nodiscard]] EntityHandle spawn_petal(World& world, std::uint16_t type_id,
                                       Vec2 center, f32 orbit_radius, f32 angle,
                                       std::uint8_t slot = 0xFF, std::uint8_t instance = 0,
                                       std::uint8_t instance_count = 1,
                                       std::uint8_t orbit_index = 0);

/** Recompute all petal orbit indices after a loadout mutation, mirroring
 * original function 85 (including configured missing instances and flag41
 * shared positions). */
void assign_petal_orbit_indices(World& world);

[[nodiscard]] std::uint8_t petal_orbit_index(const World& world, std::uint8_t slot,
                                             std::uint8_t instance);

/** Orbit angle for one petal: index*(2*pi/unlockedSlots) + loadout phase.
 * The original keeps this in double and wraps it with fmod before sin/cos. */
[[nodiscard]] double petal_orbit_angle(const World& world, std::uint8_t orbit_index);

/** Accelerate a petal toward its orbit target using the recovered
 * updatePetalOrbits acceleration/damping constants. Position integration is
 * performed by the normal movement pass. */
void update_petal_orbit(World& world, const PetalOrbitState& state, double step_milliseconds);

/** Advance all petal orbits. Orbit radii follow the current input buttons and
 * each petal's recovered orbit profile; Wing uses its wave track. */
void update_petal_orbits(World& world, double step_milliseconds);

/** Consume an equipped Peas petal into four launched children. */
bool consume_peas_attack(World& world, EntityHandle petal_handle, EntityHandle owner);

/** Spawn all configured instances for every equipped loadout slot. */
std::size_t spawn_loadout_petals(World& world);

/** Advance slot recharge timers and respawn ready petals. */
std::size_t refresh_loadout_petals(World& world, double step_milliseconds);

/** Remove a destroyed petal from its orbit list and start its slot recharge. */
bool on_petal_destroyed(World& world, EntityHandle handle);

/** Remove every spawned instance belonging to a loadout slot. */
void remove_slot_petals(World& world, std::uint8_t slot);

/** Move orbit/slot bookkeeping after a loadout slot swap. */
void swap_slot_petals(World& world, std::uint8_t first, std::uint8_t second);

/** Spawn a pickup/drop entity for a petal type using the catalog radius. */
[[nodiscard]] EntityHandle spawn_drop(World& world, std::uint16_t type_id, Vec2 position);

/** Equip a touching pickup into its selected slot and queue the actual event-14
 * transfer. Collected pickups stay for the original 2000 ms visual window.
 * Original eligibility delay / proximity query remain a separate gap. */
std::size_t collect_drops(World& world);

/** Initialize a slot from the petal catalog recharge and instance count. */
[[nodiscard]] PetalSlot make_petal_slot(std::uint16_t type_id);

} // namespace engine
