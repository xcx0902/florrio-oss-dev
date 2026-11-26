cmake_minimum_required(VERSION 3.20)
project(florrio_wave LANGUAGES CXX)

include(cmake/ScenarioDefaults.cmake)
find_package(SQLite3 REQUIRED)
find_package(Threads REQUIRED)
find_package(Python3 REQUIRED COMPONENTS Interpreter)
add_custom_target(
  wave_catalog_check
  COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tools/catalog/generate.py" --check
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/.."
  COMMENT "Validate the dated W3 catalog and generated header"
)
add_library(wave_store STATIC server/store/store.cpp)
target_compile_features(wave_store PUBLIC cxx_std_20)
target_include_directories(wave_store PUBLIC server)
target_link_libraries(wave_store PUBLIC SQLite::SQLite3 Threads::Threads)
set_target_properties(wave_store PROPERTIES CXX_EXTENSIONS OFF)

add_library(
  wave_sim STATIC
  server/sim/combat.cpp
  server/sim/effects.cpp
  server/sim/mobs.cpp
  server/sim/match.cpp
  server/sim/rules.cpp
  server/sim/waves.cpp
  server/sim/scenarios.cpp
)
add_dependencies(wave_sim wave_catalog_check)
target_compile_features(wave_sim PUBLIC cxx_std_20)
set_target_properties(wave_sim PROPERTIES CXX_EXTENSIONS OFF)
target_include_directories(
  wave_sim
  PUBLIC server
  PRIVATE "${CMAKE_CURRENT_BINARY_DIR}"
)
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(wave_sim PRIVATE -Wall -Wextra -Wpedantic -ffp-contract=off)
endif()

add_library(
  wave_wire STATIC
  server/wire/protocol.cpp server/app/room_manager.cpp server/app/client_session.cpp
  server/app/economy_queue.cpp server/wire/world_projection.cpp
)
target_compile_features(wave_wire PUBLIC cxx_std_20)
set_target_properties(wave_wire PROPERTIES CXX_EXTENSIONS OFF)
target_include_directories(wave_wire PUBLIC server)
target_link_libraries(wave_wire PUBLIC wave_sim wave_store)

option(WAVE_BUILD_HOST "Build the local WebSocket host" ON)
if(WAVE_BUILD_HOST)
  include(cmake/Dependencies.cmake)
  add_executable(wave_host server/net/host.cpp)
  set_target_properties(wave_host PROPERTIES CXX_EXTENSIONS OFF)
  target_link_libraries(wave_host PRIVATE wave_wire wave_boost_headers Threads::Threads)
  # Explicit target only: release/default builds do not produce a debug host.
  add_executable(wave_host_dev EXCLUDE_FROM_ALL server/net/host.cpp)
  target_compile_definitions(wave_host_dev PRIVATE WAVE_HOST_DEVELOPMENT=1)
  set_target_properties(wave_host_dev PROPERTIES CXX_EXTENSIONS OFF)
  target_link_libraries(wave_host_dev PRIVATE wave_wire wave_boost_headers Threads::Threads)
endif()

include(CTest)
if(BUILD_TESTING)
  add_executable(wave_w5_scenarios tests/native/w5_scenarios.cpp)
  target_include_directories(wave_w5_scenarios PRIVATE tests "${CMAKE_CURRENT_BINARY_DIR}")
  target_link_libraries(wave_w5_scenarios PRIVATE wave_wire)
  add_test(NAME W5-scenarios COMMAND wave_w5_scenarios)
  set_tests_properties(W5-scenarios PROPERTIES LABELS w5)
  add_executable(wave_test_capacity tests/native/capacity.cpp)
  target_include_directories(wave_test_capacity PRIVATE tests)
  target_link_libraries(wave_test_capacity PRIVATE wave_wire)
  add_test(NAME wave-capacity COMMAND wave_test_capacity)
  set_tests_properties(wave-capacity PROPERTIES LABELS "w2;capacity")
  add_executable(wave_dev tests/native/dev.cpp)
  target_link_libraries(wave_dev PRIVATE wave_wire)
  add_test(NAME DEV COMMAND wave_dev)
  set_tests_properties(DEV PROPERTIES LABELS dev)
  add_executable(wave_w3_seed tests/native/w3_seed.cpp)
  target_link_libraries(wave_w3_seed PRIVATE wave_store)
  foreach(suite IN ITEMS catalog behaviors store economy wire)
    add_executable(wave_w3_${suite} tests/native/w3_${suite}.cpp)
    target_include_directories(wave_w3_${suite} PRIVATE tests)
    target_link_libraries(wave_w3_${suite} PRIVATE wave_wire)
    add_test(NAME W3-${suite} COMMAND wave_w3_${suite})
    set_tests_properties(W3-${suite} PROPERTIES LABELS w3)
  endforeach()
  add_test(NAME W3-catalog-validation
           COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tools/catalog/generate.py"
                   --check --self-test
  )
  set_tests_properties(W3-catalog-validation PROPERTIES LABELS w3)
  foreach(suite IN ITEMS protocol room_session)
    add_executable(wave_test_${suite} tests/native/${suite}.cpp)
    target_include_directories(wave_test_${suite} PRIVATE tests)
    target_link_libraries(wave_test_${suite} PRIVATE wave_wire)
    set_target_properties(wave_test_${suite} PROPERTIES CXX_EXTENSIONS OFF)
    add_test(NAME wave-${suite} COMMAND wave_test_${suite})
    set_tests_properties(wave-${suite} PROPERTIES LABELS w2)
  endforeach()
  add_executable(wave_w4_squads tests/native/w4_squads.cpp)
  target_include_directories(wave_w4_squads PRIVATE tests)
  target_link_libraries(wave_w4_squads PRIVATE wave_wire)
  add_test(NAME W4-squads COMMAND wave_w4_squads)
  set_tests_properties(W4-squads PROPERTIES LABELS w4)
  set_property(
    TEST W3-economy wave-room_session
    APPEND
    PROPERTY LABELS w4
  )
  if(WAVE_BUILD_HOST)
    add_executable(wave_host_fixture server/net/host.cpp)
    target_compile_definitions(wave_host_fixture PRIVATE WAVE_HOST_TESTING=1)
    target_include_directories(wave_host_fixture PRIVATE tests)
    target_link_libraries(wave_host_fixture PRIVATE wave_wire wave_boost_headers Threads::Threads)
    set_target_properties(wave_host_fixture PROPERTIES CXX_EXTENSIONS OFF)
  endif()

  add_executable(wave_test_simulation tests/native/simulation.cpp)
  target_link_libraries(wave_test_simulation PRIVATE wave_sim)
  set_target_properties(wave_test_simulation PROPERTIES CXX_EXTENSIONS OFF)
  foreach(
    case IN
    ITEMS batches
          transition
          blocked-spawn
          lifecycle
          combat
          isolation
          special-waves
  )
    add_test(NAME sim-${case} COMMAND wave_test_simulation "${case}")
    set_tests_properties(sim-${case} PROPERTIES LABELS w1)
  endforeach()
endif()
