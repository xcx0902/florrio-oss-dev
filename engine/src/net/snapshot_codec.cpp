#include "engine/core/perf.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/angle.hpp"
#include <cmath>
#include "engine/net/generated_protocol.hpp"

namespace engine {
namespace {
bool field_is(std::uint32_t field, protocol::FieldType type) {
  return field > 0U && field <= protocol::kFieldDefinitions.size()
    && protocol::kFieldDefinitions[field - 1U].field == field
    && protocol::kFieldDefinitions[field - 1U].type == type;
}
bool float_field(std::uint32_t field) {
  return field_is(field, protocol::FieldType::kFloat)
    || field_is(field, protocol::FieldType::kInterpolatedFloat)
    || field_is(field, protocol::FieldType::kSpecialFloat);
}
}

void write_snapshot_header(ByteWriter& writer, const SnapshotHeader& header) {
  writer.write_u8(1);
  writer.write_varint32(header.sequence);
  writer.write_varint32(header.reliable_ack);
}

std::optional<SnapshotHeader> read_snapshot_header(ByteReader& reader) {
  const auto type = reader.read_u8();
  if (!type || type.value() != 1U) return std::nullopt;
  const auto sequence = reader.read_varint32();
  const auto ack = reader.read_varint32();
  if (!sequence || !ack) return std::nullopt;
  return SnapshotHeader{sequence.value(), ack.value()};
}

void SnapshotEncoder::begin(std::uint32_t sequence, std::uint32_t reliable_ack) {
  sequence_ = sequence;
  reliable_ack_ = reliable_ack;
  deletes_.bytes().clear();
  updates_.bytes().clear();
  events_.bytes().clear();
  delete_count_ = 0;
  update_count_ = 0;
  event_count_ = 0;
}

void SnapshotEncoder::write_delete(EntityHandle handle) {
  deletes_.write_u32_le(handle.to_wire());
  ++delete_count_;
}

void SnapshotEncoder::write_bare_entity(EntityHandle handle) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(52U); // flags=2 (skip declarations) XOR 54
  updates_.write_u8(0); // sparse field delta terminator
  PERF_ADD(fields, (0U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_entity(EntityHandle handle, std::uint32_t component_mask) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U); // flags=1 (component mask) XOR 54
  updates_.write_u32_le(component_mask);
  updates_.write_u8(0); // sparse field delta terminator
  PERF_ADD(fields, (0U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_byte_field(EntityHandle handle, std::uint32_t component_mask,
                                                   std::uint32_t field, std::uint8_t value) {
  if (!field_is(field, protocol::FieldType::kByte)) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U); // flags=1 XOR 54
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_u8(value);
  updates_.write_u8(0); // terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_domain_fields(EntityHandle handle, std::uint32_t component_mask,
                                                      std::uint8_t species_id, std::uint8_t kind,
                                                      std::uint8_t variant, float x, float y,
                                                      float angle_radians, float health,
                                                      float max_health, float radius,
                                                      std::uint8_t lifecycle_flags,
                                                      bool include_camera_x, bool include_camera_y,
                                                      bool include_angle,
                                                      std::optional<std::uint8_t> activity_flags,
                                                      bool include_visual_x, bool include_visual_y,
                                                      bool mark_arrival) {
  const auto raw = pack_snapshot_angle(angle_radians);
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(static_cast<std::uint8_t>((mark_arrival ? 129U : 1U) ^ 54U));
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(2U);
  updates_.write_u8(species_id);
  if (include_camera_x) {
    updates_.write_varint32(3U); // 2 -> 5
    updates_.write_f32_le(x);
  }
  updates_.write_varint32(include_camera_x ? 2U : 5U); // -> 7
  updates_.write_f32_le(radius);
  if (include_angle) {
    updates_.write_varint32(1U); // 7 -> 8
    updates_.write_u16_le(raw);
  }
  if (include_camera_y) {
    updates_.write_varint32(include_angle ? 16U : 17U); // -> 24
    updates_.write_f32_le(y);
  }
  updates_.write_varint32(include_camera_y ? 2U : (include_angle ? 18U : 19U)); // -> 26
  updates_.write_u8(kind);
  // Visual dirty revisions include intermediate movement before clamping;
  // camera dirty axes compare only the final position of the controlled body.
  if (include_visual_y) {
    updates_.write_varint32(2U); // 26 -> 28
    updates_.write_f32_le(y);
  }
  updates_.write_varint32(include_visual_y ? 3U : 5U); // -> 31
  updates_.write_u8(variant);
  if (activity_flags) {
    updates_.write_varint32(5U); // 31 -> 36
    updates_.write_u8(*activity_flags);
  }
  updates_.write_varint32(activity_flags ? 2U : 7U); // -> 38
  updates_.write_u8(lifecycle_flags);
  if (include_visual_x) {
    updates_.write_varint32(11U); // 38 -> 49
    updates_.write_f32_le(x);
  }
  updates_.write_varint32(include_visual_x ? 4U : 15U); // -> 53
  updates_.write_f32_le(health);
  updates_.write_varint32(2U); // 53 -> 55
  updates_.write_f32_le(max_health);
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (7U+include_camera_x+include_camera_y+include_angle+include_visual_x+include_visual_y+activity_flags.has_value()));
  ++update_count_;
}

void SnapshotEncoder::write_mask_float_field(EntityHandle handle, std::uint32_t component_mask,
                                                    std::uint32_t field, float value) {
  const FloatField single{field, value};
  write_mask_float_fields(handle, component_mask, {&single, 1});
}

void SnapshotEncoder::write_mask_float_fields(EntityHandle handle, std::uint32_t component_mask,
                                                     std::span<const FloatField> fields) {
  std::uint32_t last = 0U;
  for (const auto& field : fields) {
    if (!float_field(field.field) || field.field <= last) return;
    last = field.field;
  }
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U); // flags=1 XOR 54
  updates_.write_u32_le(component_mask);
  std::uint32_t previous = 0;
  for (const auto& field : fields) {
    updates_.write_varint32(field.field - previous);
    updates_.write_f32_le(field.value);
    previous = field.field;
  }
  updates_.write_u8(0); // terminator
  PERF_ADD(fields, (fields.size()));
  ++update_count_;
}

void SnapshotEncoder::write_mask_varint_field(EntityHandle handle, std::uint32_t component_mask,
                                                     std::uint32_t field, std::uint32_t value) {
  if (!field_is(field, protocol::FieldType::kVarint)) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_varint32(value);
  updates_.write_u8(0);
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_reference_field(EntityHandle handle, std::uint32_t component_mask,
                                                       std::uint32_t field, std::uint32_t target) {
  if (!field_is(field, protocol::FieldType::kReference)) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_u32_le(target);
  updates_.write_u8(0);
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_string_field(EntityHandle handle, std::uint32_t component_mask,
                                                     std::uint32_t field, std::string_view value) {
  if (!field_is(field, protocol::FieldType::kString)) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  for (const char byte : value) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0);
  updates_.write_u8(0);
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_string_array_field(EntityHandle handle, std::uint32_t component_mask,
                                                           std::uint32_t field, std::uint32_t index,
                                                           std::string_view value) {
  if (!field_is(field, protocol::FieldType::kStringArray)) return;
  if (index >= 10U) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_varint32(index + 1U);
  for (const char byte : value) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0); // string terminator
  updates_.write_u8(0); // array terminator
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_byte_array_field(EntityHandle handle, std::uint32_t component_mask,
                                                         std::uint32_t field, std::uint32_t index, std::uint8_t value) {
  if (!field_is(field, protocol::FieldType::kByteArray)) return;
  if (index >= (field == 60U ? 16U : 10U)) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_varint32(index + 1U);
  updates_.write_u8(value);
  updates_.write_u8(0); // array terminator
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_varint_array_field(EntityHandle handle, std::uint32_t component_mask,
                                                           std::uint32_t field, std::uint32_t index, std::uint32_t value) {
  if (!field_is(field, protocol::FieldType::kVarintArray)) return;
  if (index >= 10U) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_varint32(index + 1U);
  updates_.write_varint32(value);
  updates_.write_u8(0); // array terminator
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_short_array_field(EntityHandle handle, std::uint32_t component_mask,
                                                          std::uint32_t field, std::uint32_t index, std::uint16_t value) {
  if (!field_is(field, protocol::FieldType::kShortArray)) return;
  if (index >= 8U) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(field);
  updates_.write_varint32(index + 1U);
  updates_.write_varint32(value);
  updates_.write_u8(0); // array terminator
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_loadout_fields(EntityHandle handle, std::uint32_t component_mask,
    const std::array<std::uint8_t, 16>& inventory,
    const std::array<std::uint16_t, 8>& recharge,
    bool inventory_changed, bool recharge_changed) {
  if (!inventory_changed && !recharge_changed) return;
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  if (inventory_changed) {
    updates_.write_varint32(60U);
    for (const auto type : inventory) {
      updates_.write_varint32(1U);
      updates_.write_u8(type);
    }
    updates_.write_u8(0);
  }
  if (recharge_changed) {
    updates_.write_varint32(inventory_changed ? 1U : 61U);
    for (const auto progress : recharge) {
      updates_.write_varint32(1U);
      updates_.write_varint32(progress);
    }
    updates_.write_u8(0);
  }
  updates_.write_u8(0);
  PERF_ADD(fields, (static_cast<unsigned>(inventory_changed)+static_cast<unsigned>(recharge_changed)));
  ++update_count_;
}

void SnapshotEncoder::write_sparse_entity(EntityHandle handle, std::span<const std::uint32_t> ordinals) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(54U); // flags=0 XOR 54
  std::uint32_t previous = 0;
  for (const std::uint32_t ordinal : ordinals) {
    updates_.write_varint32((ordinal - previous) ^ 1U);
    previous = ordinal;
  }
  updates_.write_varint32(1U); // zero delta after XOR
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (0U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_bit_field(EntityHandle handle, std::uint32_t component_mask,
                                                  std::uint32_t field, bool value) {
  const BitField single{field, value};
  write_mask_bit_fields(handle, component_mask, {&single, 1});
}

void SnapshotEncoder::write_mask_bit_fields(EntityHandle handle, std::uint32_t component_mask,
                                                   std::span<const BitField> fields) {
  std::uint32_t last = 0U;
  for (const auto& field : fields) {
    if (!field_is(field.field, protocol::FieldType::kBit) || field.field <= last) return;
    last = field.field;
  }
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  std::uint32_t previous = 0;
  for (const auto& field : fields) {
    updates_.write_varint32(field.field - previous);
    updates_.write_u8(field.value ? 1U : 0U);
    previous = field.field;
  }
  updates_.write_u8(0);
  PERF_ADD(fields, (fields.size()));
  ++update_count_;
}

void SnapshotEncoder::write_mask_angle_field8(EntityHandle handle, std::uint32_t component_mask,
                                                     std::uint16_t raw) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(8);
  updates_.write_u16_le(raw);
  updates_.write_u8(0);
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_handle_array_field3(EntityHandle handle, std::uint32_t component_mask,
                                                            std::uint32_t index, std::uint32_t target) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(3);
  updates_.write_varint32(index + 1U);
  updates_.write_u32_le(target);
  updates_.write_u8(0); // array terminator
  updates_.write_u8(0); // field terminator
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_mask_float_angle8(EntityHandle handle, std::uint32_t component_mask,
                                                     float field5, std::uint16_t angle_raw) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(55U);
  updates_.write_u32_le(component_mask);
  updates_.write_varint32(5);
  updates_.write_f32_le(field5);
  updates_.write_varint32(3); // 8 - 5
  updates_.write_u16_le(angle_raw);
  updates_.write_u8(0);
  PERF_ADD(fields, (2U));
  ++update_count_;
}

void SnapshotEncoder::write_chat_event(std::string_view text) {
  events_.write_u8(9U);
  for (const char byte : text) events_.write_u8(static_cast<std::uint8_t>(byte));
  events_.write_u8(0);
  ++event_count_;
}

void SnapshotEncoder::write_entity_time_event(EntityHandle handle) {
  events_.write_u8(11U);
  events_.write_u32_le(handle.to_wire());
  ++event_count_;
}

void SnapshotEncoder::write_visual_event(EntityHandle handle, std::uint8_t index) {
  events_.write_u8(14U);
  events_.write_u32_le(handle.to_wire());
  events_.write_u8(index);
  ++event_count_;
}

void SnapshotEncoder::write_dense_byte_group(EntityHandle handle, std::span<const std::uint8_t> values) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U); // flags=8 XOR 54
  for (const std::uint8_t value : values) updates_.write_u8(value);
  PERF_ADD(fields, (values.size()));
  ++update_count_;
}

void SnapshotEncoder::write_dense_byte_groups(
    EntityHandle handle, std::span<const std::span<const std::uint8_t>> groups) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  for (const auto group : groups) {
    PERF_ADD(fields, group.size());
    for (const std::uint8_t value : group) updates_.write_u8(value);
  }
  ++update_count_;
}

void SnapshotEncoder::write_dense_float_group(EntityHandle handle, std::span<const float> values) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U); // flags=8 XOR 54
  for (const float value : values) updates_.write_f32_le(value);
  PERF_ADD(fields, (values.size()));
  ++update_count_;
}

void SnapshotEncoder::write_dense_health_angle_groups(
    EntityHandle handle, float health, float max_health, std::uint16_t angle_raw,
    float angle, float radius) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U); // flags=8 (dense) XOR 54
  updates_.write_f32_le(health);
  updates_.write_f32_le(max_health);
  updates_.write_u16_le(angle_raw);
  updates_.write_f32_le(angle);
  updates_.write_f32_le(radius);
  PERF_ADD(fields, (5U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_default_groups(const Entity& entity) {
  const auto raw = pack_snapshot_angle(entity.angle.value);
  updates_.write_u32_le(entity.handle.to_wire());
  updates_.write_u8(62U); // flags=8 (dense) XOR 54
  // 52 / 56
  updates_.write_u8(entity.kind == EntityKind::kDrop
    ? static_cast<std::uint8_t>(entity.type_id) : static_cast<std::uint8_t>(entity.entity_flags));
  updates_.write_u8(entity.kind == EntityKind::kDrop
    ? (entity.pickup_collected ? 1U : 0U) : static_cast<std::uint8_t>(entity.world_flags));
  updates_.write_u8(entity.ai.activity_flags); // 36: original AI+8, never slot
  // 72: all eleven fields, including the ten-byte field-16 array.
  updates_.write_u8(static_cast<std::uint8_t>(entity.world_flags)); // 1
  updates_.write_f32_le(entity.position.x.value); // 5
  updates_.write_u8(0); // 6: empty string
  for (int index = 0; index < 10; ++index) updates_.write_u8(0); // 16
  updates_.write_u8(0); // 20
  updates_.write_f32_le(0.0F); // 21
  updates_.write_f32_le(entity.position.y.value); // 24
  updates_.write_f32_le(0.0F); // 32
  updates_.write_u8(0); // 34
  updates_.write_u8(0); // 47
  updates_.write_u32_le(0); // 56
  // 116 / 120. Original client 609: field 28 is local y, field 49 local x.
  updates_.write_f32_le(entity.health.value);
  updates_.write_f32_le(entity.max_health.value);
  updates_.write_u16_le(raw);
  updates_.write_f32_le(entity.position.y.value);
  updates_.write_f32_le(entity.position.x.value);
  // 140: original client 467 +8 is the interpolated collider radius (field 7).
  updates_.write_f32_le(entity.collision_radius.value);
  // 152 base (flags bit 64 is clear).
  updates_.write_u8(entity.kind == EntityKind::kPlayer
    ? entity.player_look : static_cast<std::uint8_t>(entity.type_id));
  updates_.write_u8(static_cast<std::uint8_t>(entity.kind));
  updates_.write_u8(entity.kind == EntityKind::kPlayer
    ? entity.player_expression : entity.loadout_instance);
  PERF_ADD(fields, (23U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_string_group(EntityHandle handle, std::string_view value) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  for (const char byte : value) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0);
  PERF_ADD(fields, (1U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_angle_float_group(EntityHandle handle, std::uint16_t angle_raw,
                                                           float first, float second) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  updates_.write_u16_le(angle_raw);
  updates_.write_f32_le(first);
  updates_.write_f32_le(second);
  PERF_ADD(fields, (3U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_group152_base(EntityHandle handle, std::uint8_t field2,
                                                       std::uint8_t field26, std::uint8_t field31,
                                                       std::uint32_t field58) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  updates_.write_u8(field2);
  updates_.write_u8(field26);
  updates_.write_u8(field31);
  updates_.write_varint32(field58);
  PERF_ADD(fields, (4U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_bit_group(EntityHandle handle, std::span<const bool> values) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  std::uint8_t byte = 0;
  unsigned bit = 0;
  for (const bool value : values) {
    if (value) byte |= static_cast<std::uint8_t>(1U << bit);
    ++bit;
    if (bit == 8) {
      updates_.write_u8(byte);
      byte = 0;
      bit = 0;
    }
  }
  if (bit != 0) updates_.write_u8(byte);
  PERF_ADD(fields, (values.size()));
  ++update_count_;
}

void SnapshotEncoder::write_dense_float_bit_group(EntityHandle handle, float value, bool bit_value) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  updates_.write_f32_le(value);
  updates_.write_u8(bit_value ? 1U : 0U);
  PERF_ADD(fields, (2U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_reference_group(EntityHandle handle, std::uint32_t first,
                                                         std::uint32_t second) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  updates_.write_u32_le(first);
  updates_.write_u32_le(second);
  PERF_ADD(fields, (2U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_group_minus27(
    EntityHandle handle, std::string_view field4, std::uint32_t field15, double field18,
    std::string_view field25, float field27, bool field33, double field35, std::uint32_t field41,
    std::uint32_t field44, std::uint32_t field51) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  for (const char byte : field4) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0);
  updates_.write_varint32(field15);
  updates_.write_f64_le(field18);
  for (const char byte : field25) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0);
  updates_.write_f32_le(field27);
  updates_.write_u8(field33 ? 1U : 0U);
  updates_.write_f64_le(field35);
  updates_.write_varint32(field41);
  updates_.write_varint32(field44);
  updates_.write_varint32(field51);
  PERF_ADD(fields, (10U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_group_minus16(
    EntityHandle handle, std::span<const std::uint32_t> field3,
    std::span<const std::string_view> field10, std::uint8_t field11, std::uint8_t field12,
    float field19, std::uint32_t field30, std::span<const std::uint32_t> field39,
    float field42, float field45, std::uint8_t field46, std::uint32_t field52) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  for (const std::uint32_t value : field3) updates_.write_u32_le(value);
  for (const std::string_view value : field10) {
    for (const char byte : value) updates_.write_u8(static_cast<std::uint8_t>(byte));
    updates_.write_u8(0);
  }
  updates_.write_u8(field11);
  updates_.write_u8(field12);
  updates_.write_f32_le(field19);
  updates_.write_varint32(field30);
  for (const std::uint32_t value : field39) updates_.write_varint32(value);
  updates_.write_f32_le(field42);
  updates_.write_f32_le(field45);
  updates_.write_u8(field46);
  updates_.write_varint32(field52);
  PERF_ADD(fields, (11U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_group72(
    EntityHandle handle, std::uint8_t field1, float field5, std::string_view field6,
    std::span<const std::uint8_t> field16, std::uint8_t field20, float field21,
    float field24, float field32, std::uint8_t field34, std::uint8_t field47,
    std::uint32_t field56) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(62U);
  updates_.write_u8(field1);
  updates_.write_f32_le(field5);
  for (const char byte : field6) updates_.write_u8(static_cast<std::uint8_t>(byte));
  updates_.write_u8(0);
  for (const std::uint8_t value : field16) updates_.write_u8(value);
  updates_.write_u8(field20);
  updates_.write_f32_le(field21);
  updates_.write_f32_le(field24);
  updates_.write_f32_le(field32);
  updates_.write_u8(field34);
  updates_.write_u8(field47);
  updates_.write_u32_le(field56);
  PERF_ADD(fields, (11U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_group152_extended(
    EntityHandle handle, std::uint8_t field2, std::uint8_t field26, std::uint8_t field31,
    std::uint32_t field58, float field59, std::span<const std::uint8_t> field60,
    std::span<const std::uint16_t> field61, std::uint8_t field62, std::uint8_t field63) {
  updates_.write_u32_le(handle.to_wire());
  updates_.write_u8(126U); // flags=8|64 (72) XOR 54
  updates_.write_u8(field2);
  updates_.write_u8(field26);
  updates_.write_u8(field31);
  updates_.write_varint32(field58);
  updates_.write_f32_le(field59);
  for (const std::uint8_t value : field60) updates_.write_u8(value);
  for (const std::uint16_t value : field61) updates_.write_varint32(value);
  updates_.write_u8(field62);
  updates_.write_u8(field63);
  PERF_ADD(fields, (9U));
  ++update_count_;
}

void SnapshotEncoder::write_dense_byte_group52(EntityHandle handle, std::uint8_t field22,
                                                      std::uint8_t field54) {
  const std::array<std::uint8_t, 2> values{{field22, field54}};
  write_dense_byte_group(handle, values);
}

void SnapshotEncoder::write_event(std::uint8_t opcode, std::span<const std::uint8_t> payload) {
  events_.write_u8(opcode);
  events_.write_bytes(payload);
  ++event_count_;
}

std::vector<std::uint8_t> SnapshotEncoder::finish() const {
  ByteWriter writer;
  writer.bytes().reserve(24+deletes_.bytes().size()+updates_.bytes().size()+events_.bytes().size());
  write_snapshot_header(writer, {sequence_, reliable_ack_});
  writer.write_varint32(delete_count_);
  writer.write_varint32(update_count_);
  writer.write_varint32(event_count_);
  writer.write_bytes(deletes_.bytes());
  writer.write_bytes(updates_.bytes());
  writer.write_bytes(events_.bytes());
  return std::move(writer.bytes());
}

std::vector<std::uint8_t> empty_snapshot(std::uint32_t sequence, std::uint32_t reliable_ack) {
  SnapshotEncoder writer;
  writer.begin(sequence, reliable_ack);
  return writer.finish();
}

} // namespace engine

namespace engine {
void SnapshotEncoder::write_mask_double_field(EntityHandle handle, std::uint32_t mask, std::uint32_t field, double value) {
  if (!field_is(field, protocol::FieldType::kDouble)) return;
  updates_.write_u32_le(handle.to_wire()); updates_.write_u8(55U); updates_.write_u32_le(mask);
  updates_.write_varint32(field); updates_.write_f64_le(value); updates_.write_u8(0U); PERF_ADD(fields, (1U));
  ++update_count_;
}
}
