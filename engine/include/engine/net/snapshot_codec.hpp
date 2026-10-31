#pragma once
#include "engine/core/byte_reader.hpp"
#include "engine/model/entity.hpp"
#include <cstdint>
#include <optional>
#include <string_view>
#include <span>
#include <vector>

namespace engine {

/** Header shared by the current type-1 sparse/dense snapshot. */
struct SnapshotHeader {
  std::uint32_t sequence = 0;
  std::uint32_t reliable_ack = 0;
};

void write_snapshot_header(ByteWriter& writer, const SnapshotHeader& header);
[[nodiscard]] std::optional<SnapshotHeader> read_snapshot_header(ByteReader& reader);

/** Type 1 + sequence + reliable ack + three zero block counts. */
[[nodiscard]] std::vector<std::uint8_t> empty_snapshot(std::uint32_t sequence,
                                                       std::uint32_t reliable_ack = 0);

/** Current sparse/dense snapshot and event encoder. ByteWriter owns all primitive framing. */
class SnapshotEncoder {
 public:
  void begin(std::uint32_t sequence, std::uint32_t reliable_ack = 0);
  void write_delete(EntityHandle handle);
  void write_bare_entity(EntityHandle handle);
  /** flags=1: 32-bit component mask, then sparse field terminator. */
  void write_mask_entity(EntityHandle handle, std::uint32_t component_mask);
  /** Mask entry plus one sparse byte field (delta=1, u8 value, terminator). */
  void write_mask_byte_field(EntityHandle handle, std::uint32_t component_mask,
                             std::uint32_t field, std::uint8_t value);
  /** Mask entry plus one sparse interpolated float field 5. */
  /** Domain entry: 2 (species), 5/24 (camera target), 7 (radius), 8 (angle),
   * 26 (domain kind), 28/49 (visual y/x), 31 (expression/variant), 38
   * (lifecycle flags), 53 (health) and 55
   * (maximum health). The field mapping follows the recovered client
   * constructor table; kind is a documented permanent domain extension.
   * Camera axes (5/24) and visual axes (49/28) have independent dirty clocks:
   * visual coordinates can change during movement then return after clamping. */
  void write_mask_domain_fields(EntityHandle handle, std::uint32_t component_mask,
                                std::uint8_t species_id, std::uint8_t kind,
                                std::uint8_t variant, float x, float y,
                                float angle_radians, float health, float max_health, float radius,
                                std::uint8_t lifecycle_flags = 0U,
                                bool include_camera_x = true, bool include_camera_y = true,
                                bool include_angle = true,
                                std::optional<std::uint8_t> activity_flags = std::nullopt,
                                bool include_visual_x = true, bool include_visual_y = true,
                                bool mark_arrival = false);
  /** Generic interpolated float field. Field ids 5/7/24/28/49/59 are known. */
  void write_mask_double_field(EntityHandle handle, std::uint32_t mask, std::uint32_t field, double value);
  void write_mask_float_field(EntityHandle handle, std::uint32_t component_mask,
                              std::uint32_t field, float value);
  struct FloatField { std::uint32_t field; float value; };
  /** Multiple ascending float fields in one update entry. */
  void write_mask_float_fields(EntityHandle handle, std::uint32_t component_mask,
                               std::span<const FloatField> fields);
  /** Mask entry plus the inline double array field 35. */
  /** Mask entry plus inline string field 4 (NUL-terminated). */
  /** Dense byte-only group: values are written in group field order. */
  void write_dense_byte_group(EntityHandle handle, std::span<const std::uint8_t> values);
  /** One dense update entry containing several byte-only groups, in order. */
  void write_dense_byte_groups(EntityHandle handle,
                               std::span<const std::span<const std::uint8_t>> groups);
  void write_dense_float_group(EntityHandle handle, std::span<const float> values);
  /** Group 116 (health/maxHealth) followed by group 120 (raw angle, angle,
   * radius) in one dense update, matching the client's present-group plan. */
  void write_dense_health_angle_groups(EntityHandle handle, float health, float max_health,
                                       std::uint16_t angle_raw, float angle, float radius);
  /** Dense payload must contain every group selected by the last mask:
   * 52, 56, 72 (camera target), 116, 120 (visual transform), 140 (radius),
   * and 152 (species/kind/variant).
   * The three identity bytes are required even after player profile updates;
   * flags bit 64 stays clear, so the profile extension is not repeated. */
  static constexpr std::uint32_t kDefaultDenseComponentMask =
    (1U << 0) | (1U << 1) | (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  void write_dense_default_groups(const Entity& entity);
  /** Complete indexed player arrays, including zero entries on clear/discard.
   * Each array can be omitted when unchanged on this stream. */
  void write_mask_loadout_fields(EntityHandle handle, std::uint32_t component_mask,
    const std::array<std::uint8_t, 16>& inventory,
    const std::array<std::uint16_t, 8>& recharge,
    bool inventory_changed = true, bool recharge_changed = true);
  void write_dense_string_group(EntityHandle handle, std::string_view value);
  void write_dense_angle_float_group(EntityHandle handle, std::uint16_t angle_raw,
                                     float first, float second);
  /** Partial group 152: fields 2, 26, 31 (u8) and 58 (varint). */
  void write_dense_group152_base(EntityHandle handle, std::uint8_t field2,
                                 std::uint8_t field26, std::uint8_t field31,
                                 std::uint32_t field58);
  /** Group 152 extended: base + 59 f32, 60 byte[16], 61 short[8], 62/63 u8. */
  void write_dense_bit_group(EntityHandle handle, std::span<const bool> values);
  void write_dense_float_bit_group(EntityHandle handle, float value, bool bit_value);
  void write_dense_reference_group(EntityHandle handle, std::uint32_t first, std::uint32_t second);
  /** Inline group -27: ten fields, ending in varints 41, 44 and 51. */
  void write_dense_group_minus27(EntityHandle handle, std::string_view field4,
                                 std::uint32_t field15, double field18, std::string_view field25,
                                 float field27, bool field33, double field35, std::uint32_t field41,
                                 std::uint32_t field44, std::uint32_t field51);
  void write_dense_group_minus16(EntityHandle handle, std::span<const std::uint32_t> field3,
                                  std::span<const std::string_view> field10,
                                  std::uint8_t field11, std::uint8_t field12, float field19,
                                  std::uint32_t field30, std::span<const std::uint32_t> field39,
                                  float field42, float field45, std::uint8_t field46,
                                  std::uint32_t field52);
  void write_dense_group72(EntityHandle handle, std::uint8_t field1, float field5,
                           std::string_view field6, std::span<const std::uint8_t> field16,
                           std::uint8_t field20, float field21, float field24, float field32,
                           std::uint8_t field34, std::uint8_t field47, std::uint32_t field56);
  void write_dense_group152_extended(EntityHandle handle, std::uint8_t field2,
                                     std::uint8_t field26, std::uint8_t field31,
                                     std::uint32_t field58, float field59,
                                     std::span<const std::uint8_t> field60,
                                     std::span<const std::uint16_t> field61,
                                     std::uint8_t field62, std::uint8_t field63);
  /** Dense group 52 (fields 22,54), byte values only. */
  void write_dense_byte_group52(EntityHandle handle, std::uint8_t field22, std::uint8_t field54);
  /** Mask entry plus one inline array element. */
  void write_mask_byte_array_field(EntityHandle handle, std::uint32_t component_mask,
                                   std::uint32_t field, std::uint32_t index, std::uint8_t value);
  void write_mask_varint_array_field(EntityHandle handle, std::uint32_t component_mask,
                                     std::uint32_t field, std::uint32_t index, std::uint32_t value);
  void write_mask_short_array_field(EntityHandle handle, std::uint32_t component_mask,
                                    std::uint32_t field, std::uint32_t index, std::uint16_t value);
  void write_mask_varint_field(EntityHandle handle, std::uint32_t component_mask,
                               std::uint32_t field, std::uint32_t value);
  void write_mask_reference_field(EntityHandle handle, std::uint32_t component_mask,
                                  std::uint32_t field, std::uint32_t target);
  void write_mask_string_field(EntityHandle handle, std::uint32_t component_mask,
                               std::uint32_t field, std::string_view value);
  void write_mask_string_array_field(EntityHandle handle, std::uint32_t component_mask,
                                     std::uint32_t field, std::uint32_t index, std::string_view value);
  /** flags=0: sparse component ordinal declarations (delta XOR 1, terminator 1). */
  void write_sparse_entity(EntityHandle handle, std::span<const std::uint32_t> ordinals);
  void write_mask_bit_field(EntityHandle handle, std::uint32_t component_mask,
                            std::uint32_t field, bool value);
  struct BitField { std::uint32_t field; bool value; };
  void write_mask_bit_fields(EntityHandle handle, std::uint32_t component_mask,
                             std::span<const BitField> fields);
  void write_mask_angle_field8(EntityHandle handle, std::uint32_t component_mask, std::uint16_t raw);
  void write_mask_handle_array_field3(EntityHandle handle, std::uint32_t component_mask,
                                      std::uint32_t index, std::uint32_t target);
  /** Mask entry with field 5 (f32) then field 8 (u16 raw angle). */
  void write_mask_float_angle8(EntityHandle handle, std::uint32_t component_mask,
                               float field5, std::uint16_t angle_raw);
  void write_chat_event(std::string_view text);
  void write_entity_time_event(EntityHandle handle);
  void write_visual_event(EntityHandle handle, std::uint8_t index);
  void write_event(std::uint8_t opcode, std::span<const std::uint8_t> payload);
  [[nodiscard]] std::vector<std::uint8_t> finish() const;

 private:
  std::uint32_t sequence_ = 0;
  std::uint32_t reliable_ack_ = 0;
  ByteWriter deletes_;
  ByteWriter updates_;
  ByteWriter events_;
  std::uint32_t delete_count_ = 0;
  std::uint32_t update_count_ = 0;
  std::uint32_t event_count_ = 0;
};

} // namespace engine
