#pragma once
#include "engine/model/world_config.hpp"
#include <span>
#include <string>
#include <string_view>

namespace florr::server {
enum class Action { serve, smoke, check_config, help, version };
struct Options {
  Action action = Action::serve;
  std::string config_path = "server/config/default.json";
  std::uint32_t smoke_ticks = 0;
  engine::WorldConfig world{.populate = true};
};
struct ParseResult {
  Options options;
  std::string_view error;
  [[nodiscard]] bool ok() const { return error.empty(); }
};
[[nodiscard]] ParseResult parse_options(std::span<const std::string_view> arguments);
struct SmokeResult {
  std::uint64_t tick;
  double time_ms;
  std::size_t entities;
  std::uint32_t seed;
  std::uint32_t rng_state;
  std::uint32_t rng_draws;
  std::uint64_t handle_rng_state;
  std::uint32_t death_rng_state;
};
[[nodiscard]] SmokeResult run_smoke(const Options& options);
[[nodiscard]] std::string_view version();
} // namespace florr::server
