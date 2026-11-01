#include "florr/server/runtime.hpp"
#include "florr/server/config.hpp"
#include "florr/server/network.hpp"
#include <iostream>
#include <vector>

int main(int argc, char** argv) {
  std::vector<std::string_view> arguments;
  for (int index = 1; index < argc; ++index) arguments.emplace_back(argv[index]);
  const auto parsed = florr::server::parse_options(arguments);
  if (!parsed.ok()) {
    std::cerr << "florr_server: " << parsed.error << '\n';
    return 2;
  }
  if (parsed.options.action == florr::server::Action::help) {
    std::cout << "Usage: florr_server [--config PATH] [--check-config]\n"
                 "       florr_server --smoke-ticks N [--seed N]\n"
                 "       florr_server --help | --version\n"
                 "N ticks: 1..1000000; seed: 1..2147483646. Fixed 50ms, no waiting.\n";
    return 0;
  }
  if(parsed.options.action==florr::server::Action::serve || parsed.options.action==florr::server::Action::check_config) {
    try {
      const auto config=florr::server::load_config(parsed.options.config_path);
      if(parsed.options.action==florr::server::Action::check_config) {std::cout<<"{\"valid\":true}\n";return 0;}
      return florr::server::run_service(config);
    } catch(const std::exception&) {
      // Do not echo paths, JSON values or untrusted exception text to logs.
      std::cerr<<"florr_server: configuration or runtime initialization failed\n";return 2;
    }
  }
  if (parsed.options.action == florr::server::Action::version) {
    std::cout << "florr_server " << florr::server::version() << '\n';
    return 0;
  }
  const auto result = florr::server::run_smoke(parsed.options);
  std::cout << "{\"tick\":" << result.tick << ",\"timeMs\":" << result.time_ms
      << ",\"entities\":" << result.entities << ",\"seed\":" << result.seed
      << ",\"rngState\":" << result.rng_state << ",\"rngDraws\":" << result.rng_draws
      << ",\"handleRngState\":\"" << result.handle_rng_state
      << "\",\"deathRngState\":" << result.death_rng_state << "}\n";
}
