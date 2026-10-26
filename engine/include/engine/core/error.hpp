#pragma once
#include <cstdint>

namespace engine {

enum class Status : std::uint8_t {
  kOk = 0,
  kInvalidArgument = 1,
  kOutOfBounds = 2,
  kNotInitialized = 3,
  kQueueFull = 4,
  kUnsupported = 5,
};

} // namespace engine
