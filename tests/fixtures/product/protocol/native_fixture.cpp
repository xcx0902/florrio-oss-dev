// Product-native cross-endian fixture: real WorkerApi -> real domain snapshot
// bytes. It intentionally uses no archived replay, old WASM export or golden.
#include "engine/net/worker_api.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"

#include <array>
#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

namespace {

void write_packet(std::ofstream& output, const std::vector<std::uint8_t>& packet) {
  const auto size = static_cast<std::uint32_t>(packet.size());
  for (int shift = 0; shift < 32; shift += 8)
    output.put(static_cast<char>((size >> shift) & 0xffU));
  output.write(reinterpret_cast<const char*>(packet.data()), static_cast<std::streamsize>(packet.size()));
}

} // namespace

int main(int argc, char** argv) {
  if (argc != 2) return 2;
  engine::WorkerApi api;
  api.init(false);
  const engine::EntityHandle player = engine::spawn_player_default(
    api.world(), "Fixture", engine::make_default_profile(), false);
  if (!player.valid()) return 3;
  if (engine::Entity* body = api.world().entities().get(player)) {
    body->position = engine::Vec2{engine::f32(100.0F), engine::f32(50.0F)};
    body->velocity = engine::Vec2d{};
  }
  const std::array<std::uint8_t, 16> inventory{1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
  if (!api.set_snapshot_byte_array(player, 60U, inventory)) return 9;
  const engine::EntityHandle mob = api.spawn(
    engine::EntityKind::kMob, 1U, engine::Vec2{engine::f32(140.0F), engine::f32(90.0F)});
  if (!mob.valid()) return 4;
  const std::array<std::uint8_t, 8> chat{'f', 'i', 'x', 't', 'u', 'r', 'e', 0};
  api.emit_event(9U, chat);

  const std::vector<std::uint8_t> first = api.domain_snapshot_bytes(7U, 2U);
  if (!api.despawn(mob)) return 5;
  const std::vector<std::uint8_t> second = api.domain_snapshot_bytes(8U, 7U);
  if (first.empty() || second.empty()) return 6;

  std::ofstream output(argv[1], std::ios::binary);
  if (!output) return 7;
  output.write("FLRR", 4);
  output.put(1); // fixture format version
  output.put(2); // packet count
  write_packet(output, first);
  write_packet(output, second);
  return output ? 0 : 8;
}
