// Dedicated native browser fixture. No fixture operation is reachable on the wire.
#include "../src/net/host.hpp"
#include "engine/sim/petals.hpp"
#include <boost/asio/signal_set.hpp>
#include <csignal>
#include <iostream>
#include <map>

namespace florr::server {
struct NetworkTestAccess {
  static void prepare(NetworkServer& server,
                      std::map<std::pair<std::string, std::uint64_t>, std::uint64_t>& lives) {
    for (const auto* name : {"garden", "other"}) {
      const auto* room = server.impl_->rooms.find(name);
      if (!room) {
        continue;
      }
      auto& world = const_cast<engine::World&>(room->world());
      world.players().for_each([&](engine::PlayerState& player) {
        if (player.life != engine::PlayerLife::kAlive ||
            lives[{name, player.id().raw}] == player.life_epoch) {
          return;
        }
        lives[{name, player.id().raw}] = player.life_epoch;
        auto* body = world.entities().get(player.player());
        const bool attacker = player.player_name() == "Alice";
        body->set_position({engine::f32(attacker ? -240.0F : 240.0F), engine::f32(0)});
        body->velocity = {};
        for (std::uint8_t slot = 0; slot < 8; ++slot) {
          engine::remove_slot_petals(world, player, slot);
        }
        auto profile = engine::make_default_profile();
        profile.clear_inventory();
        // Fixed catalog equipment makes Alice win through real contact damage.
        // Bob's reserve items exercise the native death/drop transaction.
        for (std::uint8_t slot = 0; slot < 10; ++slot) {
          profile.set_inventory(slot, attacker
                                          ? engine::catalog::PetalId::kHeaviestEpic
                                          : (slot == 0 || slot >= 5
                                                 ? engine::catalog::PetalId::kBasicCommon
                                                 : engine::catalog::PetalId::kAntennaeLegendary));
        }
        profile.set_inventory_count(10);
        player.profile() = profile;
        player.loadout().restore_from_profile(profile);
        (void)engine::spawn_loadout_petals(world, player);
      });
    }
  }
};
}
int main(int argc, char** argv) {
  if (argc == 2 && std::string_view(argv[1]) == "--check") {
    std::cout << "native browser fixture: fixed spawn and catalog equipment\n";
    return 0;
  }
  if (argc != 2) {
    std::cerr << "expected browser Origin\n";
    return 2;
  }
  using namespace florr::server;
  boost::asio::io_context io(1);
  Config config;
  config.listenPort = 0;
  config.allowedOrigins = {argv[1]};
  config.closeTimeoutMs = 100;
  config.shutdownDrainMs = 200;
  NetworkServer server(io, config, {.populate = false, .handle_seed = 37});
  boost::asio::signal_set signals(io, SIGINT, SIGTERM);
  boost::asio::steady_timer fixture(io);
  std::map<std::pair<std::string, std::uint64_t>, std::uint64_t> lives;
  std::function<void()> prepare;
  prepare = [&] {
    fixture.expires_after(std::chrono::milliseconds(5));
    fixture.async_wait([&](const boost::system::error_code& error) {
      if (!error) {
        NetworkTestAccess::prepare(server, lives);
        prepare();
      }
    });
  };
  signals.async_wait([&](const boost::system::error_code& error, int) {
    if (!error) {
      fixture.cancel();
      server.stop();
    }
  });
  server.start();
  prepare();
  std::cout << "{\"port\":" << server.port() << "}\n" << std::flush;
  io.run();
}
