#include "florr/server/runtime.hpp"
#include <charconv>

namespace florr::server {
ParseResult parse_options(std::span<const std::string_view> arguments) {
  ParseResult result;
  if (arguments.size() == 1 && arguments[0] == "--help") {
    result.options.action = Action::help;
    return result;
  }
  if (arguments.size() == 1 && arguments[0] == "--version") {
    result.options.action = Action::version;
    return result;
  }
  bool ticks_seen = false;
  bool seed_seen = false;
  for (std::size_t index = 0; index < arguments.size(); ++index) {
    const auto key = arguments[index];
    if (key != "--smoke-ticks" && key != "--seed") {
      result.error = "unknown option (use --help)";
      return result;
    }
    if (++index == arguments.size()) {
      result.error = "option requires an integer value";
      return result;
    }
    const auto value = arguments[index];
    std::uint32_t number = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), number);
    if (error != std::errc{} || end != value.data() + value.size() || number == 0) {
      result.error = "option requires a positive bounded integer";
      return result;
    }
    if (key == "--smoke-ticks") {
      if (ticks_seen || number > 1000000U) {
        result.error = "smoke-ticks must occur once and be in [1,1000000]";
        return result;
      }
      ticks_seen = true;
      result.options.smoke_ticks = number;
    } else {
      if (seed_seen || number >= 2147483647U) {
        result.error = "seed must occur once and be in [1,2147483646]";
        return result;
      }
      seed_seen = true;
      result.options.world.game_seed = number;
    }
  }
  if (!ticks_seen) result.error = "--smoke-ticks N is required until the network runtime is implemented";
  return result;
}
std::string_view version() { return FLORR_SERVER_VERSION; }
} // namespace florr::server
