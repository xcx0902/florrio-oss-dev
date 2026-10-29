#pragma once
#include "engine/core/rng.hpp"
#include "engine/model/world.hpp"
#include <array>
#include <optional>
#include <utility>
#include <vector>

namespace engine {

struct SpawnBandEntry {
  f32 weight;
  std::uint8_t entity_type;
};

struct SpawnBand {
  f32 total;
  std::vector<SpawnBandEntry> entries;
};

struct SpawnPosition {
  f32 x;
  f32 y;
  [[nodiscard]] constexpr bool operator==(const SpawnPosition&) const = default;
};

/** Grouped spawn rules, one band per spawn region (0..7). The order inside a
 * band is the catalog order; totals are accumulated in binary32. */
class SpawnTable {
 public:
  [[nodiscard]] static SpawnTable from_catalog();
  [[nodiscard]] const SpawnBand& band(std::uint8_t index) const { return bands_[index & 7U]; }

  /** Original113 selection: draw one server RNG value, scale the band total,
   * then subtract entry weights in order. */
  [[nodiscard]] const SpawnBandEntry* choose(std::uint8_t index, ServerRng& rng) const;

  /** One position trial from original113: two RNG draws and the band's
   * normalized x-range. Collision retries are the caller's responsibility. */
  [[nodiscard]] SpawnPosition sample_position(std::uint8_t index, ServerRng& rng,
                                              f32 width = f32(50000.0F),
                                              f32 height = f32(4000.0F)) const;

  /** Original113's up-to-100-trial loop. `occupied` is the spatial query
   * (original function 161); it returns true when the trial must be retried. */
  template <typename Occupied>
  [[nodiscard]] std::optional<SpawnPosition> find_clear_position(
      std::uint8_t index, ServerRng& rng, Occupied&& occupied,
      f32 width = f32(50000.0F), f32 height = f32(4000.0F),
      std::uint32_t max_trials = 100) const {
    for (std::uint32_t trial = 0; trial < max_trials; ++trial) {
      const SpawnPosition position = sample_position(index, rng, width, height);
      if (!occupied(position)) return position;
    }
    return std::nullopt;
  }

  /** Choose a species, then find a clear position and construct it. The factory
   * receives the selected catalog entry and accepted position. */
  template <typename Occupied, typename Factory>
  [[nodiscard]] EntityHandle spawn_from_band(
      World& world, std::uint8_t index, Occupied&& occupied, Factory&& factory) const {
    const SpawnBandEntry* entry = choose(index, world.random());
    if (!entry) return EntityHandle{};
    const auto position = find_clear_position(index, world.random(), std::forward<Occupied>(occupied),
                                              world.width(), world.height());
    if (!position) return EntityHandle{};
    return factory(*entry, *position);
  }

 private:
  std::array<SpawnBand, 8> bands_{};
};

/** Allocate an entity slot and initialize the domain fields. Returns an invalid
 * handle when the pool is exhausted. */
[[nodiscard]] EntityHandle spawn_entity(World& world, EntityKind kind, std::uint16_t type_id,
                                        Vec2 position, f32 radius,
                                        std::uint8_t world_flags = 0,
                                        std::uint8_t entity_flags = 0);

/** Construct from the probed catalog defaults. Dynamic-radius species (Rock /
 * Boulder) are rejected here; use configure_rock / spawn_rock when the caller
 * owns the RNG order. */
[[nodiscard]] EntityHandle spawn_entity_from_defaults(World& world, EntityKind kind,
                                                      std::uint16_t type_id, Vec2 position);

struct RockBody {
  f32 radius;
  f32 health;
};

/** Original 417 configureRock: one server RNG draw, then radius/health. */
[[nodiscard]] RockBody configure_rock(ServerRng& rng, bool massive);
[[nodiscard]] EntityHandle spawn_rock(World& world, Vec2 position, bool massive, ServerRng& rng);

/** Function 144's Rock path: three pre-configure draws, then configureRock. */
[[nodiscard]] EntityHandle spawn_rock_function144(World& world, Vec2 position, bool massive, ServerRng& rng);

/** Cactus initializer: one RNG draw, radius 40..60, max health radius * 0.7,
 * contact damage 30, physics flag 48 = 0. */
struct CactusBody { f32 radius; f32 health; };
[[nodiscard]] CactusBody configure_cactus(ServerRng& rng);
[[nodiscard]] EntityHandle spawn_cactus(World& world, Vec2 position, ServerRng& rng);
[[nodiscard]] EntityHandle spawn_cactus_function144(World& world, Vec2 position, ServerRng& rng);

/** Spawn the explicit per-band counts using the live world as the occupied
 * predicate. Counts are caller-supplied; the original initializer's counts are
 * not asserted here. */
[[nodiscard]] std::vector<EntityHandle> populate_world(
    World& world, const SpawnTable& table, const std::array<std::uint8_t, 8>& counts);

/** Original400 area targets: floor(width * height * scale) for the eight bands.
 * The recovered scales are 6e-7 for bands 0..5 and 2e-7 for bands 6/7. */
[[nodiscard]] std::array<std::uint32_t, 8> population_targets(f32 width, f32 height);

/** Fill the eight ordinary bands to their area targets. Existing mobs are
 * counted by `Entity::spawn_band`; only the deficit is spawned. */
std::vector<EntityHandle> replenish_population(World& world, const SpawnTable& table);
/** Original tick's ant-hole release loop. Reads the live health ratio and
 * spawns the remaining table entries at the hole position, in spawn order. */
void release_ant_hole_ants(World& world);
/** Initial population fill: spawn exactly the area target per band, counting
 * parent spawns only (children carry spawn_band 255). */
std::vector<EntityHandle> populate_world(World& world, const SpawnTable& table);

} // namespace engine
