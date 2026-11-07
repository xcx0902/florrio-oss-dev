# Consume only the locked official archive's headers, never Boost's project.
include(FetchContent)
file(READ "${CMAKE_CURRENT_LIST_DIR}/dependencies.lock.json" WAVE_DEPENDENCIES)
foreach(field url sha256 expectedBoostVersion)
  string(
    JSON
    WAVE_BOOST_${field}
    GET
    "${WAVE_DEPENDENCIES}"
    dependencies
    boost
    ${field}
  )
endforeach()
set(WAVE_BOOST_ARCHIVE
    ""
    CACHE FILEPATH "Offline copy of the identical locked Boost archive"
)
if(WAVE_BOOST_ARCHIVE)
  file(SHA256 "${WAVE_BOOST_ARCHIVE}" archive_hash)
  if(NOT archive_hash STREQUAL WAVE_BOOST_sha256)
    message(FATAL_ERROR "Boost archive SHA256 differs from dependencies.lock.json")
  endif()
  set(WAVE_BOOST_url "${WAVE_BOOST_ARCHIVE}")
endif()
if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()
fetchcontent_declare(
  wave_boost
  URL "${WAVE_BOOST_url}"
  URL_HASH "SHA256=${WAVE_BOOST_sha256}"
  TLS_VERIFY TRUE
  TIMEOUT 300
  INACTIVITY_TIMEOUT 30 SOURCE_SUBDIR _wave_headers_only
)
fetchcontent_makeavailable(wave_boost)
file(STRINGS "${wave_boost_SOURCE_DIR}/boost/version.hpp" version_line
     REGEX "^#define BOOST_VERSION "
)
if(NOT version_line STREQUAL "#define BOOST_VERSION ${WAVE_BOOST_expectedBoostVersion}")
  message(FATAL_ERROR "Locked Boost version mismatch: ${version_line}")
endif()
find_package(Threads REQUIRED)
add_library(wave_boost_headers INTERFACE)
target_include_directories(wave_boost_headers SYSTEM INTERFACE "${wave_boost_SOURCE_DIR}")
target_compile_definitions(wave_boost_headers INTERFACE BOOST_ERROR_CODE_HEADER_ONLY=1)
