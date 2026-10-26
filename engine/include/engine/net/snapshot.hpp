#pragma once
#include "engine/core/byte_reader.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/world.hpp"
#include <cstdint>
#include <span>
#include <vector>

namespace engine {

/** Transitional snapshot writer: original type-1 header + delete/update/event
 * counts, with the current fixed entity record as the opaque update payload.
 * The final component/event encoding will replace the record body. */
class SnapshotWriter {
 public:
  explicit SnapshotWriter(std::uint32_t sequence = 0, std::uint32_t reliable_ack = 0) {
    begin(sequence, reliable_ack);
  }
  void begin(std::uint32_t sequence, std::uint32_t reliable_ack = 0);
  void write_delete(EntityHandle handle);
  void write_event(std::uint8_t opcode, std::span<const std::uint8_t> payload);
  void write_entity(EntityHandle handle, EntityKind kind, Vec2 position, f32 angle, f32 health,
                    f32 max_health, std::uint8_t level);
  /** Write every active entity in slot order. */
  void write_world(const World& world);
  [[nodiscard]] std::vector<std::uint8_t> finish() const;

 private:
  std::uint32_t sequence_ = 0;
  std::uint32_t reliable_ack_ = 0;
  ByteWriter deletes_;
  ByteWriter records_;
  ByteWriter events_;
  std::uint32_t delete_count_ = 0;
  std::uint32_t record_count_ = 0;
  std::uint32_t event_count_ = 0;
};

} // namespace engine
