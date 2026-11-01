add_library(server_runtime STATIC src/runtime/options.cpp src/runtime/smoke.cpp)
target_include_directories(server_runtime PUBLIC include)
target_link_libraries(server_runtime PUBLIC engine_core PRIVATE florr_boost_headers Threads::Threads)
target_compile_definitions(server_runtime PRIVATE FLORR_SERVER_VERSION="${CMAKE_PROJECT_VERSION}")
set_target_properties(server_runtime PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_compile_options(server_runtime PRIVATE -Wall -Wextra -Werror)

add_executable(florr_server src/main.cpp)
target_link_libraries(florr_server PRIVATE server_runtime)
set_target_properties(florr_server PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_compile_options(florr_server PRIVATE -Wall -Wextra -Werror)

add_executable(server_native_tests tests/test_native.cpp)
target_link_libraries(server_native_tests PRIVATE server_runtime)
set_target_properties(server_native_tests PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_compile_options(server_native_tests PRIVATE -Wall -Wextra -Werror)
add_test(NAME server_native_tests COMMAND server_native_tests)
add_test(NAME server_help COMMAND florr_server --help)
set_tests_properties(server_help PROPERTIES PASS_REGULAR_EXPRESSION "smoke-ticks")
add_test(NAME server_version COMMAND florr_server --version)
set_tests_properties(server_version PROPERTIES PASS_REGULAR_EXPRESSION "florr_server 0.1.0")
add_test(NAME server_smoke COMMAND florr_server --smoke-ticks 20)
set_tests_properties(server_smoke PROPERTIES PASS_REGULAR_EXPRESSION "\"tick\":20,\"timeMs\":1000")
add_test(NAME server_invalid_config COMMAND "${CMAKE_COMMAND}"
  "-DSERVER=$<TARGET_FILE:florr_server>" -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/invalid_config.cmake")

# Capture evaluated options and toolchain separately from source identity.
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/native-toolchain.json" CONTENT
  "{\n  \"schema\":1,\n  \"compiler\":\"${CMAKE_CXX_COMPILER}\",\n  \"compilerId\":\"${CMAKE_CXX_COMPILER_ID}\",\n  \"compilerVersion\":\"${CMAKE_CXX_COMPILER_VERSION}\",\n  \"system\":\"${CMAKE_SYSTEM_NAME}\",\n  \"processor\":\"${CMAKE_SYSTEM_PROCESSOR}\",\n  \"configuration\":\"$<CONFIG>\",\n  \"coreOptions\":\"$<JOIN:$<TARGET_PROPERTY:engine_core,COMPILE_OPTIONS>, >\",\n  \"hostOptions\":\"$<JOIN:$<TARGET_PROPERTY:server_runtime,COMPILE_OPTIONS>, >\",\n  \"coreStandard\":\"$<TARGET_PROPERTY:engine_core,CXX_STANDARD>\",\n  \"hostStandard\":\"$<TARGET_PROPERTY:server_runtime,CXX_STANDARD>\",\n  \"boostHeaders\":\"${florr_boost_SOURCE_DIR}\",\n  \"boostVersion\":${FLORR_BOOST_expectedBoostVersion},\n  \"boostSha256\":\"${FLORR_BOOST_sha256}\"\n}\n")
