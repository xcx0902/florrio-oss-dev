#include "florr/server/room.hpp"
#include <unistd.h>
#include <sys/random.h>
#include <cerrno>
#include <stdexcept>

namespace florr::server {
void secure_random(std::span<std::uint8_t> bytes) {
  while (!bytes.empty()) {
    const auto count = std::min<std::size_t>(bytes.size(), 256);
    if (::getentropy(bytes.data(), count) != 0) {
      if (errno == EINTR) {
        continue;
      }
      throw std::runtime_error("host entropy unavailable");
    }
    bytes = bytes.subspan(count);
  }
}
bool token_equal(const ResumeToken& a, const ResumeToken& b) {
  // Volatile accumulator prevents an optimizing early-exit memcmp replacement.
  volatile std::uint32_t difference = 0;
  for (std::size_t i = 0; i < a.size(); ++i) {
    difference = difference | static_cast<std::uint32_t>(a[i] ^ b[i]);
  }
  return difference == 0;
}
}  // namespace florr::server
