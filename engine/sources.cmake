# Single owner for the engine core translation-unit list.
# Both CMake and tools/build-engine-wasm.mjs read this file; add a source here
# once and both native and wasm builds see it.
set(ENGINE_CORE_SOURCES
  src/core/contracts.cpp
  src/sim/tick.cpp
  src/sim/movement.cpp
  src/sim/bounds.cpp
  src/sim/spawn.cpp
  src/sim/collision.cpp
  src/sim/collision_filter.cpp
  src/sim/combat.cpp
  src/sim/effects.cpp
  src/sim/ai.cpp
  src/sim/loot.cpp
  src/sim/progression.cpp
  src/sim/damage.cpp
  src/sim/petal_effects.cpp
  src/sim/petals.cpp
  src/sim/passives.cpp
  src/sim/pets.cpp
  src/sim/player.cpp
  src/sim/player_loadout.cpp
  src/sim/spatial.cpp
  src/sim/quadtree.cpp
  src/sim/species_attacks.cpp
  src/net/input.cpp
  src/net/snapshot_writer.cpp
  src/net/worker_api.cpp
  src/wasm/abi.cpp
)
