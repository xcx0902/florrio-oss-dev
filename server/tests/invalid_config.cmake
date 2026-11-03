foreach(
  option
  "--config;missing.json"
  "--unknown"
  "--smoke-ticks"
  "--smoke-ticks;invalid"
  "--smoke-ticks;0"
  "--smoke-ticks;4294967296"
  "--smoke-ticks;20;--seed;2147483647"
)
  execute_process(
    COMMAND "${SERVER}" ${option}
    RESULT_VARIABLE status
    OUTPUT_VARIABLE output
    ERROR_VARIABLE error
  )
  if(NOT status EQUAL 2
     OR NOT output STREQUAL ""
     OR NOT error MATCHES "florr_server:"
  )
    message(
      FATAL_ERROR
        "Invalid config must exit 2 without a smoke result: ${option}: ${status} ${output} ${error}"
    )
  endif()
endforeach()
