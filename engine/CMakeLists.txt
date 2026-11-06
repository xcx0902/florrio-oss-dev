cmake_minimum_required(VERSION 3.20)
project(florr_engine LANGUAGES CXX)

# All engine options are target-local: do not impose no-exceptions/RTTI or floating-point flags on
# the native host or third-party network headers.
function(florr_engine_options target)
  set_target_properties(
    ${target}
    PROPERTIES CXX_STANDARD 20
               CXX_STANDARD_REQUIRED ON
               CXX_EXTENSIONS OFF
  )
  target_compile_options(
    ${target}
    PRIVATE -Wall
            -Wextra
            -Werror
            -ffp-contract=off
            -fno-fast-math
            -fno-exceptions
            -fno-rtti
  )
endfunction()

# Native test executables share one flag set. They keep exceptions enabled because the test harness
# reports failures by throwing.
set(ENGINE_TEST_FLAGS -Wall -Wextra -Werror -ffp-contract=off -fno-fast-math)

# Usage: florr_engine_test(<target> <source> <library> [NO_TEST]) NO_TEST builds a fixture
# executable that is driven by a test, not by CTest.
function(florr_engine_test target source library)
  add_executable(${target} ${source})
  target_link_libraries(${target} PRIVATE ${library})
  set_target_properties(
    ${target}
    PROPERTIES CXX_STANDARD 20
               CXX_STANDARD_REQUIRED ON
               CXX_EXTENSIONS OFF
  )
  target_compile_options(${target} PRIVATE ${ENGINE_TEST_FLAGS})
  if(NOT "NO_TEST" IN_LIST ARGN)
    add_test(NAME ${target} COMMAND ${target})
  endif()
endfunction()

include("${CMAKE_CURRENT_SOURCE_DIR}/sources.cmake")

add_library(engine_core STATIC ${ENGINE_CORE_SOURCES})
target_include_directories(engine_core PUBLIC include)
florr_engine_options(engine_core)

add_library(engine_worker_adapter STATIC ${ENGINE_WORKER_ADAPTER_SOURCES})
target_link_libraries(engine_worker_adapter PUBLIC engine_core)
florr_engine_options(engine_worker_adapter)

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
  target_link_libraries(engine_wasm PRIVATE engine_worker_adapter)
  florr_engine_options(engine_wasm)
  set_target_properties(engine_wasm PROPERTIES OUTPUT_NAME server SUFFIX ".wasm")
  target_link_options(
    engine_wasm
    PRIVATE
    -O2
    -Wl,--no-entry
    "-sEXPORTED_FUNCTIONS=${ABI_NAMES_CSV}"
    -sSTANDALONE_WASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=67108864
    -sERROR_ON_UNDEFINED_SYMBOLS=1
  )
else()
  if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    include(CTest)
  endif()
  enable_testing()

  florr_engine_test(engine_tests tests/unit/test_main.cpp engine_worker_adapter)
  # Keep the shared suite's stack frames readable in crash reports.
  target_compile_options(engine_tests PRIVATE -fno-inline)

  florr_engine_test(engine_centipede_tests tests/unit/test_centipede.cpp engine_core)
  florr_engine_test(
    engine_death_lifecycle_tests tests/unit/test_death_lifecycle.cpp engine_worker_adapter
  )

  # Keep R04 simulation regressions independent of the shared publisher suite.
  florr_engine_test(engine_sim_tests tests/unit/test_r04_sim.cpp engine_core)
  florr_engine_test(engine_projectile_tests tests/unit/test_projectiles.cpp engine_core)
  florr_engine_test(engine_poison_flash_tests tests/unit/test_poison_flash.cpp engine_core)
  florr_engine_test(engine_rose_tests tests/unit/test_rose.cpp engine_core)
  florr_engine_test(
    engine_passives_pets_tests tests/unit/test_passives_pets.cpp engine_worker_adapter
  )
  florr_engine_test(
    engine_peer_visibility_tests tests/unit/test_peer_visibility.cpp engine_worker_adapter
  )
  florr_engine_test(
    engine_pickup_arrival_tests tests/unit/test_pickup_arrival.cpp engine_worker_adapter
  )

  # Product cross-endian fixture: real WorkerApi -> snapshot bytes for the TS test.
  florr_engine_test(
    engine_native_snapshot_fixture
    ${CMAKE_CURRENT_SOURCE_DIR}/../tests/fixtures/product/protocol/native_fixture.cpp
    engine_worker_adapter NO_TEST
  )

  florr_engine_test(engine_structure_tests tests/unit/test_structure.cpp engine_worker_adapter)

  # M00: explicit seeded domain evidence; no object-memory/padding comparison.
  florr_engine_test(
    engine_single_player_baseline_tests
    ${CMAKE_CURRENT_SOURCE_DIR}/../tests/fixtures/product/multiplayer/single_player_baseline.cpp
    engine_worker_adapter
  )

  foreach(suite multiplayer_state replication multiplayer_protocol player_motion)
    florr_engine_test(engine_${suite}_tests tests/unit/test_${suite}.cpp engine_core)
  endforeach()
  florr_engine_test(
    engine_native_replication_fixture
    ${CMAKE_CURRENT_SOURCE_DIR}/../tests/fixtures/product/multiplayer/native_replication.cpp
    engine_core NO_TEST
  )

  foreach(suite combat lifecycle)
    florr_engine_test(
      engine_multiplayer_${suite}_tests tests/unit/test_multiplayer_${suite}.cpp engine_core
    )
  endforeach()

  florr_engine_test(engine_native_link_tests tests/unit/test_native_link.cpp engine_core)
endif()

# A separate instrumented library never enters the delivery's hot path or ABI.
add_library(engine_perf_core STATIC EXCLUDE_FROM_ALL ${ENGINE_CORE_SOURCES})
target_include_directories(engine_perf_core PUBLIC include)
target_compile_definitions(engine_perf_core PUBLIC ENGINE_PERF=1)
florr_engine_options(engine_perf_core)
add_library(engine_perf_worker_adapter STATIC EXCLUDE_FROM_ALL ${ENGINE_WORKER_ADAPTER_SOURCES})
target_link_libraries(engine_perf_worker_adapter PUBLIC engine_perf_core)
florr_engine_options(engine_perf_worker_adapter)
add_executable(engine_benchmark EXCLUDE_FROM_ALL tests/perf/benchmark.cpp)
target_link_libraries(engine_benchmark PRIVATE engine_perf_worker_adapter)
florr_engine_options(engine_benchmark)
if(EMSCRIPTEN)
  set_target_properties(engine_benchmark PROPERTIES SUFFIX ".cjs")
  target_link_options(
    engine_benchmark PRIVATE -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864
    -sEXIT_RUNTIME=1
  )
endif()
