// Product-native cross-endian fixture: real WorkerApi input -> think -> publish
// -> real domain snapshot bytes. It intentionally uses no archived replay, old
// WASM export, generated expectation or golden.
#include "engine/core/byte_reader.hpp"
#include "engine/net/protocol.hpp"
#include "engine/net/snapshot_writer.hpp"
#include "engine/net/worker_api.hpp"

#include <array>
#include <cstdint>
#include <fstream>
#include <span>
#include <string>
#include <vector>

namespace {

constexpr std::array<std::uint8_t, 4> kKey{0x11U, 0x22U, 0x33U, 0x44U};

std::vector<std::uint8_t> input_packet(const std::vector<std::uint8_t>& body) {
  std::vector<std::uint8_t> packet = body;
  engine::apply_packet_xor(packet, kKey);
  return packet;
}

/** sequence 1, opcode 6 (spawn/name), NUL-terminated name. */
std::vector<std::uint8_t> spawn_packet(std::string_view name) {
  engine::ByteWriter writer;
  writer.write_varint32(1);
  writer.write_varint32(6);
  writer.write_bytes(std::span<const std::uint8_t>(
    reinterpret_cast<const std::uint8_t*>(name.data()), name.size()));
  writer.write_u8(0);
  return input_packet(writer.bytes());
}

/** sequence 2, opcode 12, buttons + binary32 angle/strength. */
std::vector<std::uint8_t> movement_packet() {
  engine::ByteWriter writer;
  writer.write_varint32(2);
  writer.write_varint32(12);
  writer.write_varint32(1U);
  writer.write_f32_le(0.0F);
  writer.write_f32_le(200.0F);
  return input_packet(writer.bytes());
}

/** sequence 3, opcode 5, chat text; WorkerApi publishes event 9. */
std::vector<std::uint8_t> chat_packet(std::string_view text) {
  engine::ByteWriter writer;
  writer.write_varint32(3);
  writer.write_varint32(5);
  writer.write_bytes(std::span<const std::uint8_t>(
    reinterpret_cast<const std::uint8_t*>(text.data()), text.size()));
  writer.write_u8(0);
  return input_packet(writer.bytes());
}

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

  // The fixture goes through the real send gate: opcode 6 creates the player,
  // spawn_loadout_petals() creates the default five Basic slots, and think()
  // advances the fixed-step world. No entity is constructed directly.
  if (!api.send(spawn_packet("Fixture"), kKey)) return 3;
  api.think();
  const engine::EntityHandle player = api.world().player();
  if (!player.valid() || api.world().entities().get(player) == nullptr) return 4;

  const std::vector<std::uint8_t> baseline = api.domain_snapshot_bytes(6U, 0U);

  // Opcode 12 is decoded by the input decoder and consumed by a real tick.
  if (!api.send(movement_packet(), kKey)) return 5;
  for (int tick = 0; tick < 20; ++tick) api.think();
  const engine::Entity* body = api.world().entities().get(player);
  if (body == nullptr) return 6;

  const engine::EntityHandle mob = api.spawn(
    engine::EntityKind::kMob, 1U,
    engine::Vec2{engine::f32(body->position.x.value + 200.0F), body->position.y});
  if (!mob.valid()) return 7;
  if (!api.send(chat_packet("fixture"), kKey)) return 8;
  api.think();

  const std::vector<std::uint8_t> first = api.domain_snapshot_bytes(7U, 2U);
  if (!api.despawn(mob)) return 9;
  const std::vector<std::uint8_t> second = api.domain_snapshot_bytes(8U, 7U);
  // Direct wire-boundary probe: the schema allows only uint8-publishable ids;
  // snapshot field 2 is the species byte. This packet is not a catalog row.
  const engine::EntityHandle boundary_handle = engine::EntityHandle::from_parts(0U, 1U);
  engine::SnapshotWriter boundary_writer;
  boundary_writer.begin(9U, 0U);
  boundary_writer.write_mask_byte_field(boundary_handle, 1U, 2U, 255U);
  std::array<std::uint8_t, 16> inventory{};
  inventory[0] = 255U;
  const std::array<std::uint16_t, 8> recharge{};
  boundary_writer.write_mask_loadout_fields(boundary_handle, 1U, inventory, recharge, true, false);
  const std::vector<std::uint8_t> boundary = boundary_writer.finish();
  if (baseline.empty() || first.empty() || second.empty() || boundary.empty()) return 10;

  std::ofstream output(argv[1], std::ios::binary);
  if (!output) return 11;
  output.write("FLRR", 4);
  output.put(1); // fixture format version
  output.put(4); // packet count: baseline, input+mob+event, deletion, id boundary
  write_packet(output, baseline);
  write_packet(output, first);
  write_packet(output, second);
  write_packet(output, boundary);
  return output ? 0 : 12;
}
