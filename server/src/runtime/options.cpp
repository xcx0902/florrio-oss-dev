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
  bool config_seen = false;
  bool check_seen = false;
  for (std::size_t index = 0; index < arguments.size(); ++index) {
    const auto key = arguments[index];
    if (key == "--check-config") {
      if (check_seen) {
        result.error = "duplicate check-config";
        return result;
      }
      check_seen = true;
      result.options.action = Action::check_config;
      continue;
    }
    if (key != "--smoke-ticks" && key != "--seed" && key != "--config") {
      result.error = "unknown option (use --help)";
      return result;
    }
    if (++index == arguments.size()) {
      result.error = "option requires an integer value";
      return result;
    }
    const auto value = arguments[index];
    if (key == "--config") {
      if (config_seen || value.empty() || value.starts_with("--")) {
        result.error = "invalid config path";
        return result;
      }
      config_seen = true;
      result.options.config_path = value;
      continue;
    }
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
  if (ticks_seen) {
    if (config_seen || check_seen) {
      result.error = "smoke cannot use service configuration";
    } else {
      result.options.action = Action::smoke;
    }
  } else if (seed_seen) {
    result.error = "seed requires smoke-ticks";
  }
  return result;
}
std::string_view version() {
  return FLORR_SERVER_VERSION;
}
}  // namespace florr::server
