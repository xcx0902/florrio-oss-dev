cmake_minimum_required(VERSION 3.20)
project(florr_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(engine_core STATIC
  src/schema/contracts.cpp
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
  src/net/snapshot.cpp
  src/net/snapshot_header.cpp
  src/net/original_snapshot.cpp
  src/net/worker_api.cpp
  src/wasm/abi.cpp
)
target_include_directories(engine_core PUBLIC include)
target_compile_options(engine_core PRIVATE
  -Wall -Wextra -Werror
  -ffp-contract=off
  -fno-fast-math
  -fno-exceptions
  -fno-rtti
)

add_executable(engine_tests tests/unit/test_main.cpp)
target_link_libraries(engine_tests PRIVATE engine_core)
target_compile_options(engine_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math -fno-inline)

enable_testing()
add_test(NAME engine_tests COMMAND engine_tests)

add_executable(engine_centipede_tests tests/unit/test_centipede.cpp)
target_link_libraries(engine_centipede_tests PRIVATE engine_core)
target_compile_options(engine_centipede_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_centipede_tests COMMAND engine_centipede_tests)

add_executable(engine_death_lifecycle_tests tests/unit/test_death_lifecycle.cpp)
target_link_libraries(engine_death_lifecycle_tests PRIVATE engine_core)
target_compile_options(engine_death_lifecycle_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_death_lifecycle_tests COMMAND engine_death_lifecycle_tests)

# Keep R04 simulation regressions independent of the shared publisher suite.
add_executable(engine_sim_tests tests/unit/test_r04_sim.cpp)
target_link_libraries(engine_sim_tests PRIVATE engine_core)
target_compile_options(engine_sim_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_sim_tests COMMAND engine_sim_tests)

add_executable(engine_projectile_tests tests/unit/test_projectiles.cpp)
target_link_libraries(engine_projectile_tests PRIVATE engine_core)
target_compile_options(engine_projectile_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_projectile_tests COMMAND engine_projectile_tests)

add_executable(engine_poison_flash_tests tests/unit/test_poison_flash.cpp)
target_link_libraries(engine_poison_flash_tests PRIVATE engine_core)
target_compile_options(engine_poison_flash_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_poison_flash_tests COMMAND engine_poison_flash_tests)

add_executable(engine_rose_tests tests/unit/test_rose.cpp)
target_link_libraries(engine_rose_tests PRIVATE engine_core)
target_compile_options(engine_rose_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_rose_tests COMMAND engine_rose_tests)

add_executable(engine_passives_pets_tests tests/unit/test_passives_pets.cpp)
target_link_libraries(engine_passives_pets_tests PRIVATE engine_core)
target_compile_options(engine_passives_pets_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_passives_pets_tests COMMAND engine_passives_pets_tests)

add_executable(engine_peer_visibility_tests tests/unit/test_peer_visibility.cpp)
target_link_libraries(engine_peer_visibility_tests PRIVATE engine_core)
target_compile_options(engine_peer_visibility_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_peer_visibility_tests COMMAND engine_peer_visibility_tests)

add_executable(engine_pickup_arrival_tests tests/unit/test_pickup_arrival.cpp)
target_link_libraries(engine_pickup_arrival_tests PRIVATE engine_core)
target_compile_options(engine_pickup_arrival_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_pickup_arrival_tests COMMAND engine_pickup_arrival_tests)

# The engine_core translation unit above always compiles generated assertions.
# Native CTest also compares actual compiler layout with the YAML inputs, so
# stale generated output cannot pass just because its own assertions agree.
if(NOT CMAKE_CROSSCOMPILING)
  find_program(ENGINE_SCHEMA_NODE NAMES node nodejs REQUIRED)
  set(ENGINE_SCHEMA_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/..")
  set(ENGINE_SCHEMA_CHECKER "${ENGINE_SCHEMA_ROOT}/tools/check-schema-layouts.mjs")
  file(GLOB ENGINE_SCHEMA_LAYOUTS CONFIGURE_DEPENDS "${ENGINE_SCHEMA_ROOT}/schema/layout/*.yaml")
  set(ENGINE_SCHEMA_PROBE "${CMAKE_CURRENT_BINARY_DIR}/schema-contracts-probe.inc")
  add_custom_command(OUTPUT "${ENGINE_SCHEMA_PROBE}"
    COMMAND "${ENGINE_SCHEMA_NODE}" "${ENGINE_SCHEMA_CHECKER}" --emit-probe "${ENGINE_SCHEMA_PROBE}"
    DEPENDS "${ENGINE_SCHEMA_CHECKER}" ${ENGINE_SCHEMA_LAYOUTS}
    VERBATIM)
  add_executable(engine_schema_contracts_tests tests/unit/test_schema_contracts.cpp "${ENGINE_SCHEMA_PROBE}")
  target_link_libraries(engine_schema_contracts_tests PRIVATE engine_core)
  target_include_directories(engine_schema_contracts_tests PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
  target_compile_options(engine_schema_contracts_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
  add_test(NAME engine_schema_contracts
    COMMAND "${ENGINE_SCHEMA_NODE}" "${ENGINE_SCHEMA_CHECKER}" --check "$<TARGET_FILE:engine_schema_contracts_tests>")
  add_test(NAME engine_schema_contracts_checker
    COMMAND "${ENGINE_SCHEMA_NODE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/tests/unit/test_schema_contracts.test.mjs")
endif()

add_executable(engine_native_replay tests/oracle/native-state-replay.cpp)
target_link_libraries(engine_native_replay PRIVATE engine_core)
target_compile_options(engine_native_replay PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
