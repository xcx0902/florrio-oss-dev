#include "florr/server/runtime.hpp"
#include "../../engine/tests/support/test_support.hpp"
#include <array>

int main() {
  using namespace std::literals;
  using florr::server::parse_options;
  CHECK(!parse_options({}).ok());
  for (const auto value : {""sv, "0"sv, "-1"sv, "+1"sv, "1x"sv, "1.5"sv,
      "4294967296"sv, "1000001"sv, " 20"sv}) {
    const std::array args{"--smoke-ticks"sv, value};
    CHECK(!parse_options(args).ok());
  }
  const std::array missing{"--smoke-ticks"sv};
  const std::array unknown{"--config"sv, "missing.json"sv};
  const std::array duplicate{"--smoke-ticks"sv, "1"sv, "--smoke-ticks"sv, "2"sv};
  const std::array invalid_seed{"--smoke-ticks"sv, "1"sv, "--seed"sv, "2147483647"sv};
  const std::array duplicate_seed{"--seed"sv, "1"sv, "--seed"sv, "2"sv, "--smoke-ticks"sv, "1"sv};
  CHECK(!parse_options(missing).ok()); CHECK(!parse_options(unknown).ok());
  CHECK(!parse_options(duplicate).ok()); CHECK(!parse_options(invalid_seed).ok());
  CHECK(!parse_options(duplicate_seed).ok());
  const std::array help{"--help"sv}, version{"--version"sv};
  CHECK(parse_options(help).options.action == florr::server::Action::help);
  CHECK(parse_options(version).options.action == florr::server::Action::version);
  const std::array args{"--smoke-ticks"sv, "20"sv};
  const auto parsed = parse_options(args);
  CHECK(parsed.ok());
  const auto smoke = florr::server::run_smoke(parsed.options);
  const auto repeat = florr::server::run_smoke(parsed.options);
  CHECK(smoke.tick == 20 && smoke.time_ms == 1000.0 && smoke.entities > 0);
  CHECK(smoke.seed == 285456437U && smoke.rng_draws > 120U);
  CHECK(smoke.entities == repeat.entities && smoke.rng_state == repeat.rng_state
      && smoke.rng_draws == repeat.rng_draws && smoke.handle_rng_state == repeat.handle_rng_state);
  const std::array seeded{"--smoke-ticks"sv, "20"sv, "--seed"sv, "37"sv};
  const auto other = florr::server::run_smoke(parse_options(seeded).options);
  CHECK(other.seed == 37U && smoke.rng_state != other.rng_state);
  return engine::test::failures ? 1 : 0;
}
