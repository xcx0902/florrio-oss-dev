#pragma once
#include "engine/core/byte_reader.hpp"
#include "engine/model/entity.hpp"
#include <cstdint>
#include <span>
#include <vector>

namespace engine {

/** Exact archived-client snapshot framing.
 *
 * The first byte is the type (1), followed by the sequence varint. Everything
 * after the sequence is XOR-encrypted with the 256-byte key shared by the
 * archived client/server. The decrypted body is:
 *   ack varint, entityBlockLength varint, removalCount varint, u16 framing,
 *   removed u32 handles, u16 framing, entity records, u32 zero terminator,
 *   event framing/terminator/trailing/ignored.
 */
class OriginalClientSnapshotWriter {
 public:
  /** An original sparse field payload, without its XOR1 field delta. */
  struct Field {
    std::uint32_t id;
    std::vector<std::uint8_t> bytes;
  };
  void begin(std::uint32_t sequence, std::uint32_t reliable_ack = 1);
  void write_record(EntityHandle handle, std::uint32_t component_mask,
                    std::span<const Field> fields, bool declare_components = true,
                    bool marked = false);
  void write_delete(EntityHandle handle);
  /** Event index 1 is transient: always apply rather than replay-deduplicate. */
  void write_event(std::uint8_t opcode, std::span<const std::uint8_t> payload,
                   std::uint32_t event_index = 1);
  /** `declare_components` writes the full component mask on the first sighting
   * of an entity. Known entities must use `false`: the archived client skips
   * constructor attachment when the flags byte carries bit 1, and re-declaring
   * components on every tick exhausts its pools and traps. */
  /** Common gameplay components: owner references, species, health, visual,
   * lifecycle, radius and effects. The peer adapter supplies exact kind masks. */
  static constexpr std::uint32_t kDefaultComponentMask = 0x0B186000U;
  void write_entity(EntityHandle handle, std::uint8_t species, std::uint8_t kind,
                    std::uint8_t variant, float x, float y, float angle_radians,
                    float health, float max_health, float radius,
                    bool declare_components = true,
                    std::uint32_t component_mask = kDefaultComponentMask);
  [[nodiscard]] std::vector<std::uint8_t> finish() const;
  /** Undo the packet XOR for tests and diagnostics. */
  [[nodiscard]] static std::vector<std::uint8_t> decrypt(std::vector<std::uint8_t> bytes);

 private:
  std::uint32_t sequence_ = 0;
  std::uint32_t reliable_ack_ = 1;
  ByteWriter block_;
  ByteWriter removals_;
  ByteWriter events_;
  std::uint32_t removal_count_ = 0;
  std::uint32_t entity_count_ = 0;
};

} // namespace engine
