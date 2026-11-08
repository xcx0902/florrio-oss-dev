cmake_minimum_required(VERSION 3.20)
project(florrio_wave LANGUAGES CXX)

include(cmake/GardenEvidence.cmake)
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
  wave_sim STATIC server/sim/combat.cpp server/sim/effects.cpp server/sim/mobs.cpp
                  server/sim/match.cpp server/sim/rules.cpp server/sim/waves.cpp
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
  server/wire/bootstrap.cpp server/app/bootstrap_session.cpp server/app/garden.cpp
  server/app/garden_session.cpp server/app/economy_queue.cpp server/wire/garden_projection.cpp
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
  add_executable(wave_dev_inventory tests/native/dev_inventory.cpp)
  target_link_libraries(wave_dev_inventory PRIVATE wave_wire)
  add_test(NAME DEV-inventory COMMAND wave_dev_inventory)
  set_tests_properties(DEV-inventory PROPERTIES LABELS dev)
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
  add_executable(wave_w2 tests/native/w2.cpp)
  target_link_libraries(wave_w2 PRIVATE wave_wire)
  set_target_properties(wave_w2 PROPERTIES CXX_EXTENSIONS OFF)
  add_test(NAME W2-WIRE-BOOTSTRAP COMMAND wave_w2)
  set_tests_properties(W2-WIRE-BOOTSTRAP PROPERTIES LABELS w2)
  add_executable(wave_w2_garden tests/native/w2_garden.cpp)
  target_include_directories(wave_w2_garden PRIVATE tests)
  target_link_libraries(wave_w2_garden PRIVATE wave_wire)
  set_target_properties(wave_w2_garden PROPERTIES CXX_EXTENSIONS OFF)
  add_test(NAME W2-GARDEN COMMAND wave_w2_garden)
  set_tests_properties(W2-GARDEN PROPERTIES LABELS w2)
  if(WAVE_BUILD_HOST)
    add_executable(wave_host_fixture server/net/host.cpp)
    target_compile_definitions(wave_host_fixture PRIVATE WAVE_HOST_TESTING=1)
    target_include_directories(wave_host_fixture PRIVATE tests)
    target_link_libraries(wave_host_fixture PRIVATE wave_wire wave_boost_headers Threads::Threads)
    set_target_properties(wave_host_fixture PROPERTIES CXX_EXTENSIONS OFF)
  endif()

  add_executable(wave_w1 tests/native/w1.cpp)
  target_link_libraries(wave_w1 PRIVATE wave_sim)
  set_target_properties(wave_w1 PROPERTIES CXX_EXTENSIONS OFF)
  set(WAVE_REPORT_DIR
      "${CMAKE_CURRENT_BINARY_DIR}/reports"
      CACHE PATH "W1 fixture traces"
  )
  file(MAKE_DIRECTORY "${WAVE_REPORT_DIR}")
  foreach(
    fixture IN
    ITEMS W1-01
          W1-02
          W1-03
          W1-04
          W1-05
          W1-06
          W0-GARDEN
  )
    add_test(NAME "${fixture}" COMMAND wave_w1 "${fixture}" "${WAVE_REPORT_DIR}/${fixture}.txt")
    set_tests_properties("${fixture}" PROPERTIES LABELS w1)
  endforeach()
endif()
