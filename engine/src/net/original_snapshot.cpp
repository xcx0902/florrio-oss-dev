#include "engine/net/original_snapshot.hpp"
#include "engine/net/angle.hpp"
#include <array>
#include <algorithm>
#include <cmath>
#include <cstring>

namespace engine {
namespace {

// Client wasm data address 32272 / server wasm address 4576.
constexpr std::array<std::uint8_t, 256> kSnapshotKey = {
  0x37,0x0d,0x2d,0x2e,0xf7,0x65,0xf4,0x13,0xc5,0xce,0xb2,0x96,0x7b,0xd8,0x72,0x42,
  0x94,0x36,0x95,0x99,0xbf,0x3b,0xac,0x3d,0x90,0x94,0x6f,0xe9,0xec,0xaf,0x4d,0x91,
  0x98,0x5e,0x30,0x17,0xf6,0x1b,0xf0,0x23,0x4b,0x1d,0x51,0xc6,0xbe,0xfb,0x12,0x7c,
  0x53,0x75,0xa9,0x46,0x76,0x7e,0x6a,0xcf,0x30,0x44,0xe0,0x2b,0xd3,0xc3,0x5c,0xc9,
  0x6d,0x68,0x42,0x7d,0x1a,0x3c,0x7b,0x3f,0x4a,0xcd,0x79,0x68,0xbe,0x41,0xb9,0x65,
  0xcc,0xf8,0x81,0xd4,0xe3,0x55,0x5b,0x57,0x6f,0x53,0xb9,0x06,0xb0,0xae,0x65,0xd3,
  0xb2,0xb8,0xdb,0x60,0xd0,0x7a,0xe9,0xa3,0x80,0x2c,0xb8,0x4e,0x5c,0x2a,0xf8,0xdd,
  0x31,0x35,0x10,0x05,0xd6,0x02,0x59,0x92,0xbe,0x39,0xe2,0x68,0x40,0xe8,0x25,0x66,
  0x54,0x9e,0x21,0x94,0xb0,0x7f,0x97,0x8f,0x3d,0xfb,0x45,0x30,0x3d,0xb8,0x23,0xd1,
  0xed,0xdc,0x59,0x5d,0xa2,0xcd,0x40,0x8c,0xea,0x62,0xe2,0x06,0x4d,0x49,0x5d,0xec,
  0x61,0x24,0xff,0xe3,0x86,0x6e,0x76,0x04,0xd7,0xf1,0x80,0xac,0x5f,0x32,0x90,0xff,
  0x5e,0x38,0x3a,0xc8,0x9d,0x39,0x42,0x76,0xcf,0x23,0xfa,0x80,0x47,0xbc,0x9a,0xea,
  0xb0,0x55,0xe3,0x41,0x9a,0x10,0x0b,0xcd,0x32,0x88,0xfa,0x29,0xaf,0x77,0x9a,0xc1,
  0x68,0xe9,0xea,0x06,0x2c,0xaf,0x0f,0x9f,0x50,0x61,0xb0,0x74,0x79,0x73,0xec,0x2b,
  0x87,0xd1,0xae,0x87,0xd8,0xc1,0x30,0xdf,0x30,0x47,0x02,0xed,0x0e,0x43,0xca,0x65,
  0x8e,0x15,0x95,0x1a,0xb5,0x2b,0xee,0xf4,0x9e,0x8c,0xb8,0xb4,0x3c,0x24,0x8e,0xf0,
};

std::uint32_t float_bits(float value) {
  std::uint32_t bits = 0;
  std::memcpy(&bits, &value, sizeof(bits));
  return bits;
}

void write_delta(ByteWriter& writer, std::uint32_t delta) {
  writer.write_varint32(delta ^ 1U);
}

} // namespace

void OriginalClientSnapshotWriter::begin(std::uint32_t sequence, std::uint32_t reliable_ack) {
  sequence_ = sequence;
  reliable_ack_ = reliable_ack;
  block_ = ByteWriter{};
  removals_ = ByteWriter{};
  events_ = ByteWriter{};
  removal_count_ = 0;
  entity_count_ = 0;
}

void OriginalClientSnapshotWriter::write_record(EntityHandle handle, std::uint32_t component_mask,
                                               std::span<const Field> fields,
                                               bool declare_components, bool marked) {
  block_.write_u32_le(handle.to_wire());
  const auto flags = static_cast<std::uint8_t>((declare_components ? 1U : 2U)
    | (marked ? 128U : 0U));
  block_.write_u8(static_cast<std::uint8_t>(flags ^ 54U));
  if (declare_components) block_.write_u32_le(component_mask & 0x3FFFFFFFU);
  std::vector<const Field*> ordered;
  ordered.reserve(fields.size());
  for (const auto& field : fields) ordered.push_back(&field);
  std::sort(ordered.begin(), ordered.end(), [](const Field* a, const Field* b) { return a->id < b->id; });
  std::uint32_t previous = 0;
  for (const Field* field : ordered) {
    write_delta(block_, field->id - previous);
    block_.write_bytes(field->bytes);
    previous = field->id;
  }
  write_delta(block_, 0U);
  ++entity_count_;
}

void OriginalClientSnapshotWriter::write_delete(EntityHandle handle) {
  removals_.write_u32_le(handle.to_wire());
  ++removal_count_;
}

void OriginalClientSnapshotWriter::write_event(std::uint8_t opcode,
                                              std::span<const std::uint8_t> payload,
                                              std::uint32_t event_index) {
  events_.write_varint32(event_index);
  events_.write_varint32(opcode);
  events_.write_bytes(payload);
}

void OriginalClientSnapshotWriter::write_entity(EntityHandle handle, std::uint8_t species,
                                                std::uint8_t kind, std::uint8_t variant,
                                                float x, float y, float angle_radians,
                                                float health, float max_health, float radius,
                                                bool declare_components,
                                                std::uint32_t component_mask) {
  const auto scalar = [](std::uint32_t id, float value) {
    ByteWriter payload; payload.write_u32_le(float_bits(value));
    return Field{id, payload.bytes()};
  };
  ByteWriter angle; angle.write_u16_le(pack_snapshot_angle(angle_radians));
  std::vector<Field> fields{scalar(7U, radius), {8U, angle.bytes()},
    scalar(28U, y), scalar(49U, x), scalar(53U, health), scalar(55U, max_health)};
  if (kind == static_cast<std::uint8_t>(EntityKind::kPlayer)) {
    fields.push_back({2U, {species}}); // legacy argument is the original aim byte
    fields.push_back({26U, {0U}});
    fields.push_back({31U, {variant}});
  } else if (kind == static_cast<std::uint8_t>(EntityKind::kPetal)) {
    fields.push_back({50U, {species}});
  } else if (kind == static_cast<std::uint8_t>(EntityKind::kDrop)) {
    fields.push_back({22U, {species}});
  } else {
    fields.push_back({43U, {species}});
  }
  write_record(handle, component_mask, fields, declare_components);
}

std::vector<std::uint8_t> OriginalClientSnapshotWriter::finish() const {
  // The entity list is terminated by a zero 32-bit wire handle. The client
  // reads it with the aligned 4-byte integer reader, so it must be exactly
  // four bytes; the old 2-byte prefix plus 4-byte zero shifted every
  // following record by two bytes.
  ByteWriter terminator;
  terminator.write_u32_le(0U);

  ByteWriter plain;
  plain.write_varint32(reliable_ack_);
  ByteWriter entity_block;
  entity_block.write_varint32(removal_count_);
  entity_block.write_u16_le(0U);
  entity_block.write_bytes(removals_.bytes());
  entity_block.write_u16_le(0U);
  entity_block.write_bytes(block_.bytes());
  entity_block.write_bytes(terminator.bytes());
  const std::uint32_t block_length = static_cast<std::uint32_t>(entity_block.bytes().size());
  plain.write_varint32(block_length);
  plain.write_bytes(entity_block.bytes());
  plain.write_u8(0U); // event framing
  plain.write_bytes(events_.bytes());
  plain.write_u8(0U); // event terminator
  plain.write_u8(0U); // trailing framing
  plain.write_u8(0U); // ignored varint

  ByteWriter header;
  header.write_u8(1U);
  header.write_varint32(sequence_);
  const auto encrypted_start = header.bytes().size();
  header.write_bytes(plain.bytes());
  auto bytes = header.bytes();
  for (std::size_t index = encrypted_start; index < bytes.size(); ++index)
    bytes[index] ^= kSnapshotKey[(index - encrypted_start) & 255U];
  return bytes;
}

std::vector<std::uint8_t> OriginalClientSnapshotWriter::decrypt(std::vector<std::uint8_t> bytes) {
  ByteReader reader(bytes);
  (void)reader.read_u8();
  if (!reader.read_varint32()) return bytes;
  const auto encrypted_start = reader.cursor();
  for (std::size_t index = encrypted_start; index < bytes.size(); ++index)
    bytes[index] ^= kSnapshotKey[(index - encrypted_start) & 255U];
  return bytes;
}

} // namespace engine
