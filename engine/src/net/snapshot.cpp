#include "engine/net/snapshot.hpp"
#include "engine/net/snapshot_header.hpp"

namespace engine {

void SnapshotWriter::begin(std::uint32_t sequence, std::uint32_t reliable_ack) {
  sequence_ = sequence;
  reliable_ack_ = reliable_ack;
  deletes_ = ByteWriter{};
  records_ = ByteWriter{};
  events_ = ByteWriter{};
  delete_count_ = 0;
  record_count_ = 0;
  event_count_ = 0;
}

void SnapshotWriter::write_delete(EntityHandle handle) {
  deletes_.write_u32_le(handle.to_wire());
  ++delete_count_;
}

void SnapshotWriter::write_event(std::uint8_t opcode, std::span<const std::uint8_t> payload) {
  events_.write_u8(opcode);
  events_.write_bytes(payload);
  ++event_count_;
}

void SnapshotWriter::write_entity(EntityHandle handle, EntityKind kind, Vec2 position, f32 angle,
                                  f32 health, f32 max_health, std::uint8_t level) {
  records_.write_u32_le(handle.to_wire());
  records_.write_u8(static_cast<std::uint8_t>(kind));
  records_.write_f32_le(position.x.to_float());
  records_.write_f32_le(position.y.to_float());
  records_.write_f32_le(angle.to_float());
  records_.write_f32_le(health.to_float());
  records_.write_f32_le(max_health.to_float());
  records_.write_u8(level);
  ++record_count_;
}

void SnapshotWriter::write_world(const World& world) {
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    const std::uint8_t level = entity.kind == EntityKind::kPlayer
      ? world.profile().level() : 0U;
    write_entity(entity.handle, entity.kind, entity.position, entity.angle, entity.health,
                 entity.max_health, level);
  }
}

std::vector<std::uint8_t> SnapshotWriter::finish() const {
  ByteWriter writer;
  write_snapshot_header(writer, {sequence_, reliable_ack_});
  writer.write_varint32(delete_count_);
  writer.write_varint32(record_count_); // opaque update records
  writer.write_varint32(event_count_);
  writer.write_bytes(deletes_.bytes());
  writer.write_bytes(records_.bytes());
  writer.write_bytes(events_.bytes());
  return writer.bytes();
}

} // namespace engine
