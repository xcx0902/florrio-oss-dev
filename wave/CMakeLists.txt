cmake_minimum_required(VERSION 3.20)
project(florrio_wave LANGUAGES CXX)

include(cmake/GardenEvidence.cmake)

add_library(wave_sim STATIC
  server/sim/combat.cpp
  server/sim/match.cpp
  server/sim/rules.cpp
  server/sim/waves.cpp
)
target_compile_features(wave_sim PUBLIC cxx_std_20)
set_target_properties(wave_sim PROPERTIES CXX_EXTENSIONS OFF)
target_include_directories(wave_sim PUBLIC server PRIVATE "${CMAKE_CURRENT_BINARY_DIR}")
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(wave_sim PRIVATE -Wall -Wextra -Wpedantic -ffp-contract=off)
endif()

include(CTest)
if(BUILD_TESTING)
  add_executable(wave_w1 tests/native/w1.cpp)
  target_link_libraries(wave_w1 PRIVATE wave_sim)
  set_target_properties(wave_w1 PROPERTIES CXX_EXTENSIONS OFF)
  set(WAVE_REPORT_DIR "${CMAKE_CURRENT_BINARY_DIR}/reports" CACHE PATH "W1 fixture traces")
  file(MAKE_DIRECTORY "${WAVE_REPORT_DIR}")
  foreach(fixture IN ITEMS W1-01 W1-02 W1-03 W1-04 W1-05 W1-06 W0-GARDEN)
    add_test(NAME "${fixture}" COMMAND wave_w1 "${fixture}" "${WAVE_REPORT_DIR}/${fixture}.txt")
    set_tests_properties("${fixture}" PROPERTIES LABELS w1)
  endforeach()
endif()
