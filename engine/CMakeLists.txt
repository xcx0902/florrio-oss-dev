cmake_minimum_required(VERSION 3.20)
project(florr_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include("${CMAKE_CURRENT_SOURCE_DIR}/sources.cmake")

add_library(engine_core STATIC ${ENGINE_CORE_SOURCES})
target_include_directories(engine_core PUBLIC include)
target_compile_options(engine_core PRIVATE
  -Wall -Wextra -Werror
  -ffp-contract=off
  -fno-fast-math
  -fno-exceptions
  -fno-rtti
)

if(EMSCRIPTEN)
  file(READ "${CMAKE_CURRENT_SOURCE_DIR}/abi-exports.json" ABI_JSON)
  set(ABI_NAMES "")
  foreach(GROUP core diagnostics runtime)
    string(JSON GROUP_SIZE LENGTH "${ABI_JSON}" ${GROUP})
    math(EXPR GROUP_LAST "${GROUP_SIZE} - 1")
    foreach(INDEX RANGE 0 ${GROUP_LAST})
      string(JSON ABI_NAME GET "${ABI_JSON}" ${GROUP} ${INDEX})
      list(APPEND ABI_NAMES "_${ABI_NAME}")
    endforeach()
  endforeach()
  list(JOIN ABI_NAMES "," ABI_NAMES_CSV)
  add_executable(engine_wasm src/wasm/entry.cpp)
  target_link_libraries(engine_wasm PRIVATE engine_core)
  set_target_properties(engine_wasm PROPERTIES OUTPUT_NAME server SUFFIX ".wasm")
  target_link_options(engine_wasm PRIVATE -O2 -Wl,--no-entry
    "-sEXPORTED_FUNCTIONS=${ABI_NAMES_CSV}" -sSTANDALONE_WASM=1
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sERROR_ON_UNDEFINED_SYMBOLS=1)
else()
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

# Product cross-endian fixture: real WorkerApi -> snapshot bytes for the TS test.
add_executable(engine_native_snapshot_fixture
  ${CMAKE_CURRENT_SOURCE_DIR}/../tests/fixtures/product/protocol/native_fixture.cpp)
target_link_libraries(engine_native_snapshot_fixture PRIVATE engine_core)
target_compile_options(engine_native_snapshot_fixture PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)

add_executable(engine_product_workload tests/perf/workload.cpp)
target_link_libraries(engine_product_workload PRIVATE engine_core)
target_compile_options(engine_product_workload PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)

add_executable(engine_structure_tests tests/unit/test_structure.cpp)
target_link_libraries(engine_structure_tests PRIVATE engine_core)
target_compile_options(engine_structure_tests PRIVATE -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)
add_test(NAME engine_structure_tests COMMAND engine_structure_tests)

endif()
