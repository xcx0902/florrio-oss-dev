cmake_minimum_required(VERSION 3.20)
project(florrio_wave LANGUAGES CXX)

include(cmake/GardenEvidence.cmake)

add_library(
  wave_sim STATIC server/sim/combat.cpp server/sim/match.cpp server/sim/rules.cpp
                  server/sim/waves.cpp
)
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
  wave_wire STATIC server/wire/bootstrap.cpp server/app/bootstrap_session.cpp server/app/garden.cpp
                   server/app/garden_session.cpp server/wire/garden_projection.cpp
)
target_compile_features(wave_wire PUBLIC cxx_std_20)
set_target_properties(wave_wire PROPERTIES CXX_EXTENSIONS OFF)
target_include_directories(wave_wire PUBLIC server)
target_link_libraries(wave_wire PUBLIC wave_sim)

option(WAVE_BUILD_HOST "Build the local WebSocket host" ON)
if(WAVE_BUILD_HOST)
  include(cmake/Dependencies.cmake)
  add_executable(wave_host server/net/host.cpp)
  set_target_properties(wave_host PROPERTIES CXX_EXTENSIONS OFF)
  target_link_libraries(wave_host PRIVATE wave_wire wave_boost_headers Threads::Threads)
endif()

include(CTest)
if(BUILD_TESTING)
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
