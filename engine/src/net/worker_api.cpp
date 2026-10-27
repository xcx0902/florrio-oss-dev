#include "engine/net/worker_api.hpp"
#include "engine/net/angle.hpp"
#include "engine/model/hit_message.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/petals.hpp"
#include "engine/net/input.hpp"
#include "engine/net/snapshot.hpp"
#include "engine/net/snapshot_header.hpp"
#include "engine/net/original_snapshot.hpp"
#include "engine/net/dense_fields.hpp"
#include "engine/sim/tick.hpp"
#include "engine/sim/progression.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>

namespace engine {

namespace {

/** Original167: circle bounds include attached children. Keep the original
 * f32 min+diameter construction, rather than replacing it with center+radius.
 * Publication uses its own index and does not mutate the contact quadtree or
 * the simulation's geometry-cache epochs. */
Aabb peer_body_bounds(const World& world, const Entity& entity, std::uint32_t depth = 0U) {
  const f32 radius = entity.collision_radius;
  const f32 left = entity.position.x - radius;
  const f32 top = entity.position.y - radius;
  const f32 diameter = radius + radius;
  Aabb result{left, top, left + diameter, top + diameter};
  if (depth >= kEntitySlotCount) return result;
  for (const EntityHandle handle : entity.children) {
    const Entity* child = world.entities().get(handle);
    if (child == nullptr || child == &entity) continue;
    const Aabb bounds = peer_body_bounds(world, *child, depth + 1U);
    const f32 min_x = std::min(result.min_x, bounds.min_x);
    const f32 min_y = std::min(result.min_y, bounds.min_y);
    // Original167 stores min/size, not min/max. Preserve the subtraction
    // and subsequent query-side addition at each attached-body union.
    const f32 width = std::max(result.max_x, bounds.max_x) - min_x;
    const f32 height = std::max(result.max_y, bounds.max_y) - min_y;
    result = {min_x, min_y, min_x + width, min_y + height};
  }
  return result;
}

bool peer_handle_less(EntityHandle first, EntityHandle second) {
  return first.index() == second.index() ? first.generation() < second.generation()
                                        : first.index() < second.index();
}

/** The original player-spawn path consumes one entity slot and releases it
 * before creating the avatar (the handle trace shows the player at slot 870
 * after the 866-entity population ends at slot 868). Releasing with the FIFO
 * free list leaves that slot at the tail, so the avatar and its petals take the
 * original handle sequence. */
void reserve_spawn_placeholder(World& world) {
  const EntityHandle placeholder = world.entities().allocate().value_or(EntityHandle{});
  if (placeholder.valid()) (void)world.entities().release(placeholder);
}

/** Emit every sparse field id (1..63) using the recovered wire types. Dense
 * groups remain available through their dedicated writers; this covers the
 * complete 1015 field table for live domain records. */
void write_full_fields(OriginalSnapshotWriter& writer, const Entity& entity,
                       std::uint32_t mask) {
  const EntityHandle handle = entity.handle;
  writer.write_mask_byte_field(handle, mask, 1U, entity.world_flags);
  writer.write_mask_byte_field(handle, mask, 9U, entity.entity_flags);
  writer.write_mask_byte_field(handle, mask, 11U, entity.loadout_slot);
  writer.write_mask_byte_field(handle, mask, 12U, entity.loadout_instance);
  // Original entity+192 effect component +8; population band is unrelated.
  writer.write_mask_byte_field(handle, mask, 14U, entity.effect_flags);
  writer.write_mask_byte_field(handle, mask, 17U, entity.component_flags92);
  writer.write_mask_byte_field(handle, mask, 20U, 0U);
  writer.write_mask_byte_field(handle, mask, 22U,
    entity.kind == EntityKind::kDrop ? static_cast<std::uint8_t>(entity.type_id) : 0U);
  writer.write_mask_byte_field(handle, mask, 34U, 0U);
  writer.write_mask_byte_field(handle, mask, 36U, entity.ai.activity_flags);
  writer.write_mask_byte_field(handle, mask, 38U, entity.death_processed ? 1U : 0U);
  writer.write_mask_byte_field(handle, mask, 43U, 0U);
  writer.write_mask_byte_field(handle, mask, 46U, 0U);
  writer.write_mask_byte_field(handle, mask, 47U, 0U);
  writer.write_mask_byte_field(handle, mask, 50U, 0U);
  writer.write_mask_byte_field(handle, mask, 54U, entity.pickup_collected ? 1U : 0U);
  writer.write_mask_byte_field(handle, mask, 62U, 0U);
  writer.write_mask_byte_field(handle, mask, 63U, 0U);
  writer.write_mask_float_field(handle, mask, 7U, entity.collision_radius.value);
  writer.write_mask_float_field(handle, mask, 13U, 0.0F);
  writer.write_mask_float_field(handle, mask, 19U, 0.0F);
  writer.write_mask_float_field(handle, mask, 21U, 0.0F);
  writer.write_mask_float_field(handle, mask, 27U, 0.0F);
  writer.write_mask_float_field(handle, mask, 32U, 0.0F);
  writer.write_mask_float_field(handle, mask, 42U, 0.0F);
  writer.write_mask_float_field(handle, mask, 45U, 0.0F);
  if (entity.kind != EntityKind::kPlayer)
    writer.write_mask_float_field(handle, mask, 59U, 0.0F);
  writer.write_mask_double_field18(handle, mask, 0.0);
  writer.write_mask_double_field35(handle, mask, 0.0);
  for (const std::uint32_t field : {15U, 30U, 41U, 44U, 51U, 52U, 58U})
    writer.write_mask_varint_field(handle, mask, field, 0U);
  for (const std::uint32_t field : {29U, 33U, 37U, 40U})
    writer.write_mask_bit_field(handle, mask, field, false);
  writer.write_mask_string_field(handle, mask, 4U, "");
  writer.write_mask_string_field(handle, mask, 6U, "");
  writer.write_mask_string_field(handle, mask, 48U, "");
  writer.write_mask_reference_field(handle, mask, 23U, entity.owner);
  writer.write_mask_reference_field(handle, mask, 56U, 0U);
  writer.write_mask_reference_field(handle, mask, 57U, 0U);
  for (std::uint32_t index = 0; index < 10U; ++index) {
    writer.write_mask_handle_array_field3(handle, mask, index, 0U);
    writer.write_mask_string_array_field(handle, mask, 10U, index, "");
    writer.write_mask_byte_array_field(handle, mask, 16U, index, 0U);
    writer.write_mask_string_array_field(handle, mask, 25U, index, "");
    writer.write_mask_varint_array_field(handle, mask, 39U, index, 0U);
  }
  // Fields 60/61 belong to the player loadout and are emitted from actual
  // carried types/recharge below, never zero-filled for unrelated entities.
}

} // namespace

void WorkerApi::init(bool populate) {
  world_.initialize();
  world_.set_auto_populate(populate);
  if (populate) {
    // spServerInit draws one 32-bit value through original 102 (a two-draw
    // acceptance path for the shipped seed) before original 400 fills the
    // population bands. Keep the same RNG position so the first species and
    // every subsequent spawn match the reference world.
    (void)world_.random().next();
    (void)world_.random().next();
    (void)populate_world(world_, SpawnTable::from_catalog());
  }
  clock_ = FixedStepClock{};
  output_.clear();
  last_sequence_ = 0;
  original_sequence_ = 0;
  original_client_known_.clear();
  original_client_records_.clear();
  original_client_enabled_ = false;
  original_client_viewer_started_ = false;
  original_client_viewer_position_ = Vec2{};
  original_client_viewer_scale_ = f32(1.0F);
  original_client_sequence_ = 0;
  original_client_queued_tick_ = 0;
  original_client_event_tick_ = std::numeric_limits<std::uint64_t>::max();
  original_client_output_.clear();
  original_client_pending_events_.clear();
  domain_score_bits_.clear();
  domain_camera_bits_.clear();
  domain_position_revisions_.clear();
  domain_angle_values_.clear();
  domain_loadout_values_.clear();
  domain_viewer_started_ = !populate;
  domain_visibility_enabled_ = populate;
  domain_viewer_position_ = Vec2{};
  domain_viewer_scale_ = f32(1.0F);
  domain_known_.clear();
  full_field_framing_ = false;
  pending_deletes_.clear();
  pending_events_.clear();
  snapshot_byte_values_.clear();
  snapshot_values_.clear();
}

bool WorkerApi::send(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key) {
  if (!world_.initialized() || packet.empty() || packet.size() > kMaxInputPacketBytes) return false;
  std::vector<InputMessage> messages;
  if (decode_input_packet(packet, key, messages) != Status::kOk) return false;
  // Input commands can destroy equipped entities before think() captures its
  // own before-list. Keep those removals in the same snapshot deletion queue.
  std::vector<EntityHandle> before;
  before.reserve(world_.entities().active_count());
  for (const auto& entity : world_.entities().entities())
    if (entity.active) before.push_back(entity.handle);
  for (const auto& message : messages) {
    // The original applies the sequence gate per message, not per buffer.
    if (!accept_input_sequence(last_sequence_, message.sequence)) continue;
    const InputCommand& command = message.command;
    const bool has_player = world_.player().valid()
      && world_.entities().get(world_.player()) != nullptr;
    if (command.opcode == 5U) {
      // Original opcode 5 is a chat/string command. Emit event opcode 9 with a
      // NUL-terminated payload so the client can render the chat line.
      std::vector<std::uint8_t> payload;
      payload.reserve(command.text.size() + 1U);
      for (const char byte : command.text) payload.push_back(static_cast<std::uint8_t>(byte));
      payload.push_back(0U);
      emit_event(9U, payload);
      continue;
    }
    if (command.opcode == 4U && !has_player) {
      // Original opcode 4 requests a restart. In a live session the restart
      // path creates the default player (the observed golden trace spawns at
      // the restart packet, before any opcode 6 arrives).
      const bool fresh = world_.profile().level() == 0
        && world_.profile().inventory_count() == 0;
      const PlayerProfile profile = fresh ? make_default_profile() : world_.profile();
      reserve_spawn_placeholder(world_);
      (void)spawn_player_default(world_, command.text, profile, fresh);
      (void)spawn_loadout_petals(world_);
      continue;
    }
    if (command.opcode == 6U && !has_player) {
      reserve_spawn_placeholder(world_);
      if (player_spawn_configured_) {
        (void)spawn_player(world_, command.text, player_position_, player_config_);
      } else {
        const bool fresh = world_.profile().level() == 0
          && world_.profile().inventory_count() == 0;
        const PlayerProfile profile = fresh ? make_default_profile() : world_.profile();
        (void)spawn_player_default(world_, command.text, profile, fresh);
      }
      (void)spawn_loadout_petals(world_);
      continue;
    }
    if (command.opcode == 3U && world_.player().valid()) {
      if (command.argument == 0U) {
        if (Entity* player = world_.entities().get(world_.player()))
          player->health = f32(0.0F);
      }
      continue;
    }
    if (command.opcode == 8U && world_.player().valid()) {
      const std::uint8_t slot = static_cast<std::uint8_t>(command.slot_a);
      if (world_.loadout().discard(world_.profile(), slot,
                                   static_cast<std::uint16_t>(command.value_a)))
        remove_slot_petals(world_, slot);
      continue;
    }
    if (command.opcode == 10U && world_.player().valid()) {
      const std::uint8_t first = static_cast<std::uint8_t>(command.slot_a);
      const std::uint8_t second = static_cast<std::uint8_t>(command.slot_b);
      (void)world_.loadout().swap(world_, world_.profile(), first,
                                  static_cast<std::uint16_t>(command.value_a), second,
                                  static_cast<std::uint16_t>(command.value_b));
      continue;
    }
    if (command.opcode != 12U) continue;
    // Original 655 stores both angle and strength on the player record; the
    // next applyPlayerControls tick consumes the latest values.
    world_.apply_input(command.buttons, f32(command.angle), f32(command.strength));
  }
  for (const EntityHandle handle : before)
    if (world_.entities().get(handle) == nullptr) pending_deletes_.push_back(handle);
  return true;
}

void WorkerApi::think() {
  if (!world_.initialized()) return;
  std::vector<EntityHandle> before;
  before.reserve(world_.entities().active_count());
  for (const auto& entity : world_.entities().entities())
    if (entity.active) before.push_back(entity.handle);
  tick(world_, static_cast<double>(kTickMilliseconds));
  // Original 654 appends six random bytes (six original-102 calls) while
  // building the per-tick snapshot seed. They do not affect simulation state,
  // but they advance the shared RNG and therefore every later spawn roll.
  for (int index = 0; index < 6; ++index) (void)world_.random().next();
  for (const EntityHandle handle : before)
    if (world_.entities().get(handle) == nullptr) pending_deletes_.push_back(handle);
}

std::deque<OutputPacket> WorkerApi::flush() { return output_.drain(); }

std::vector<std::uint8_t> WorkerApi::snapshot_bytes(std::uint32_t sequence) {
  SnapshotWriter writer(sequence);
  for (const EntityHandle handle : pending_deletes_) writer.write_delete(handle);
  pending_deletes_.clear();
  for (const auto& event : pending_events_) writer.write_event(event.first, event.second);
  pending_events_.clear();
  writer.write_world(world_);
  return writer.finish();
}

bool WorkerApi::write_dense_values(OriginalSnapshotWriter& writer, const Entity& entity) {
    const auto values_it = snapshot_values_.find(entity.handle.to_wire());
    if (entity.snapshot_dense_group != 0 && values_it != snapshot_values_.end()) {
      const SnapshotValues& values = values_it->second;
      switch (entity.snapshot_dense_group) {
        case 116: {
          const std::array<float, 2> floats{{values.floats[53], values.floats[55]}};
          writer.write_dense_float_group(entity.handle, floats);
          return true;
        }
        case 120:
          writer.write_dense_angle_float_group(entity.handle,
            static_cast<std::uint16_t>(values.varints[8]), values.floats[28], values.floats[49]);
          return true;
        case 124: {
          const std::array<bool, 2> bits{{values.bits[29], values.bits[40]}};
          writer.write_dense_bit_group(entity.handle, bits);
          return true;
        }
        case 112:
          writer.write_dense_string_group(entity.handle, values.strings[48]);
          return true;
        case -8:
          writer.write_dense_float_bit_group(entity.handle, values.floats[13], values.bits[37]);
          return true;
        case -15:
          writer.write_dense_reference_group(entity.handle, values.references[23],
                                             values.references[57]);
          return true;
        case -27:
          writer.write_dense_group_minus27(entity.handle, values.strings[4], values.varints[15],
                                           values.doubles[18], values.strings[25],
                                           values.floats[27], values.bits[33],
                                           values.doubles[35], values.varints[41],
                                           values.varints[44], values.varints[51]);
          return true;
        case 72: {
          std::array<std::uint8_t, 10> bytes16{};
          for (std::size_t index = 0; index < bytes16.size(); ++index)
            bytes16[index] = values.byte_arrays10[16][index];
          const float position_x = values.auto_position ? entity.position.x.value : values.floats[5];
          const float position_y = values.auto_position ? entity.position.y.value : values.floats[24];
          writer.write_dense_group72(entity.handle, values.bytes[1], position_x,
                                     values.strings[6], bytes16, values.bytes[20],
                                     values.floats[21], position_y, values.floats[32],
                                     values.bytes[34], values.bytes[47], values.references[56]);
          return true;
        }
        case -16: {
          std::array<std::string_view, 10> strings10{};
          for (std::size_t index = 0; index < strings10.size(); ++index)
            strings10[index] = values.string_arrays[10][index];
          writer.write_dense_group_minus16(entity.handle, values.handle_arrays[3], strings10,
                                           values.bytes[11], values.bytes[12], values.floats[19],
                                           values.varints[30], values.varint_arrays[39],
                                           values.floats[42], values.floats[45], values.bytes[46],
                                           values.varints[52]);
          return true;
        }
        case 152:
          writer.write_dense_group152_extended(entity.handle, values.bytes[2], values.bytes[26],
            values.bytes[31], values.varints[58], values.floats[59], values.byte_arrays[60],
            values.short_arrays[61], values.bytes[62], values.bytes[63]);
          return true;
        default: break;
      }
    }
    constexpr std::array<int, 8> kByteGroupOffsets{{52, 56, 68, 76, 84, 100, 136, 144}};
    const auto stored = snapshot_byte_values_.find(entity.handle.to_wire());
    std::array<std::vector<std::uint8_t>, 8> byte_groups;
    bool any_byte_groups = false;
    if (stored != snapshot_byte_values_.end()) {
      for (std::size_t index = 1; index < kByteGroupOffsets.size(); ++index) {
        if ((entity.snapshot_present_groups & (1U << index)) == 0U) continue;
        const auto* group = dense_group_by_offset(kByteGroupOffsets[index]);
        if (group == nullptr) continue;
        for (const std::uint32_t field : group->fields)
          byte_groups[index].push_back(stored->second[field]);
        any_byte_groups = true;
      }
    }
    if (any_byte_groups) {
      std::array<std::span<const std::uint8_t>, 8> spans{};
      std::size_t count = 0;
      for (const auto& values : byte_groups)
        if (!values.empty()) spans[count++] = values;
      writer.write_dense_byte_groups(entity.handle,
        std::span<const std::span<const std::uint8_t>>(spans.data(), count));
      return true;
    } else if (entity.snapshot_dense52 || (entity.snapshot_present_groups & 1U) != 0U) {

      writer.write_dense_byte_group52(entity.handle, entity.snapshot_dense52_field22,
                                      entity.snapshot_dense52_field54);
      return true;
    } else if (entity.snapshot_component_mask != 0U || entity.component_presence != 0U) {
      const auto raw = pack_snapshot_angle(entity.angle.value);
      writer.write_mask_float_angle8(entity.handle,
                                     entity.snapshot_component_mask | entity.component_presence,
                                     entity.snapshot_field5.value, raw);
      return true;
    }
    return false;}

void WorkerApi::write_default_dense_values(OriginalSnapshotWriter& writer, const Entity& entity) {
  if (entity.snapshot_dense_group != 0) return;
  if (snapshot_values_.find(entity.handle.to_wire()) != snapshot_values_.end()) return;
  if (snapshot_byte_values_.find(entity.handle.to_wire()) != snapshot_byte_values_.end()) return;
  writer.write_dense_default_groups(entity);
}

std::vector<std::uint8_t> WorkerApi::original_snapshot_bytes(std::uint32_t sequence, std::uint32_t reliable_ack) {
  OriginalSnapshotWriter writer;
  writer.begin(sequence, reliable_ack);
  for (const EntityHandle handle : pending_deletes_) writer.write_delete(handle);
  pending_deletes_.clear();
  for (const auto& event : pending_events_) writer.write_event(event.first, event.second);
  pending_events_.clear();
  for (const auto& entity : world_.entities().entities()) {
    if (!entity.active) continue;
    if (write_dense_values(writer, entity)) continue;
    writer.write_bare_entity(entity.handle);
  }
  return writer.finish();
}

std::vector<std::uint8_t> WorkerApi::original_snapshot_next(std::uint32_t reliable_ack) {
  return original_snapshot_bytes(original_sequence_++, reliable_ack);
}

std::vector<std::uint8_t> WorkerApi::original_client_snapshot_bytes(std::uint32_t sequence,
                                                                     std::uint32_t reliable_ack) {
  original_client_enabled_ = true;
  OriginalClientSnapshotWriter writer;
  writer.begin(sequence, reliable_ack == std::numeric_limits<std::uint32_t>::max()
    ? last_sequence_ : reliable_ack);
  using Field = OriginalClientSnapshotWriter::Field;
  const auto byte = [](std::uint32_t id, std::uint8_t value) {
    return Field{id, {value}};
  };
  const auto scalar = [](std::uint32_t id, float value) {
    ByteWriter out; out.write_f32_le(value); return Field{id, out.bytes()};
  };
  const auto integer = [](std::uint32_t id, std::uint32_t value) {
    ByteWriter out; out.write_u32_le(value); return Field{id, out.bytes()};
  };
  const auto varint = [](std::uint32_t id, std::uint32_t value) {
    ByteWriter out; out.write_varint32(value); return Field{id, out.bytes()};
  };
  const auto string = [](std::uint32_t id, const std::string& value) {
    ByteWriter out; for (char c : value) out.write_u8(static_cast<std::uint8_t>(c));
    out.write_u8(0U); return Field{id, out.bytes()};
  };
  const auto array = [](std::uint32_t id, const auto& values, bool shorts = false) {
    ByteWriter out;
    for (const auto value : values) {
      out.write_varint32(0U); // (consecutive index delta 1) XOR 1
      if (shorts) out.write_varint32(value); else out.write_u8(static_cast<std::uint8_t>(value));
    }
    out.write_varint32(1U); return Field{id, out.bytes()};
  };
  std::unordered_set<std::uint32_t> current;
  const auto record = [&](EntityHandle handle, std::uint32_t mask,
                          std::vector<Field> fields, bool marked = false,
                          const Entity* entity = nullptr) {
    const auto wire = handle.to_wire();
    current.insert(wire);
    const auto found = original_client_records_.find(wire);
    const bool fresh = found == original_client_records_.end();
    auto& previous = original_client_records_[wire];
    std::vector<Field> changed;
    for (auto& field : fields) {
      const bool revision_changed = entity != nullptr
        && ((field.id == 49U && previous.position_revisions[0] != entity->position_x_revision)
         || (field.id == 28U && previous.position_revisions[1] != entity->position_y_revision));
      if (fresh || previous.fields[field.id] != field.bytes || revision_changed)
        changed.push_back(field);
      previous.fields[field.id] = std::move(field.bytes);
    }
    // Original simulation-tick marks a newly introduced pickup only while
    // its creation epoch is at most one tick old. Entering an old pickup's
    // viewport must not replay its birth animation.
    const bool arriving = fresh && entity != nullptr && entity->kind == EntityKind::kDrop
      && world_.tick() <= entity->spawn_tick + 1U;
    if (fresh || !changed.empty()) writer.write_record(handle, mask, changed, fresh, marked || arriving);
    previous.mask = mask;
    if (entity != nullptr)
      previous.position_revisions = {entity->position_x_revision, entity->position_y_revision};
    original_client_known_.insert(wire);
  };
  // Original ctor477 is the world-ready gate. It must never be inferred from
  // a gameplay entity or from the domain field26 extension.
  record(original_client_world_handle(), 1U << 15U,
    {byte(11U, 1U), byte(12U, 0U), scalar(19U, world_.width().value),
     scalar(42U, world_.height().value), scalar(45U, 50.0F), byte(46U, 0U)}, true);

  const Entity* controlled = world_.entities().get(world_.player());
  if (controlled != nullptr && controlled->active) {
    original_client_viewer_started_ = true;
    if (controlled->health.value > 0.0F) {
      original_client_viewer_position_ = controlled->position;
      bool wide = false;
      for (std::size_t i = 0; i < world_.profile().active_slots(); ++i)
        wide = wide || world_.loadout().slots()[i].type_id == 25U;
      original_client_viewer_scale_ = f32(wide ? 0.63F : 0.9F);
    }
  }
  // Original retainPlayerLoot writes the kept stack at frame+25 and its count
  // at frame+24; the client renders this list after "You will respawn ... with:".
  std::array<std::uint8_t, 10> kept{};
  for (std::size_t i = 0; i < kept.size(); ++i)
    kept[i] = static_cast<std::uint8_t>(world_.last_death_kept()[i]);
  record(original_client_controller_handle(), 1U << 5U,
    {byte(1U, 0U), scalar(5U, original_client_viewer_position_.x.value),
     string(6U, world_.last_killer_name()), array(16U, kept), byte(20U, 0U),
     scalar(21U, world_.last_death_score().value), scalar(24U, original_client_viewer_position_.y.value),
     scalar(32U, original_client_viewer_scale_.value), byte(34U, world_.last_death_kept_count()),
     byte(47U, world_.last_death_level()),
     integer(56U, controlled != nullptr ? controlled->handle.to_wire() : 0U)}, true);

  if (original_client_viewer_started_) {
    const f32 width = f32(1920.0F) / original_client_viewer_scale_ + f32(200.0F);
    const f32 height = f32(1080.0F) / original_client_viewer_scale_ + f32(200.0F);
    const f32 left = width * f32(-0.5F) + original_client_viewer_position_.x;
    const f32 top = height * f32(-0.5F) + original_client_viewer_position_.y;
    const Aabb view{left, top, left + width, top + height};
    for (const auto& entity : world_.entities().entities()) {
      if (!entity.active || (&entity != controlled && !peer_body_bounds(world_, entity).intersects(view))) continue;
      // Masks independently recovered through original function393. Components
      // 20/21/25/26/28 are health, visual, lifecycle, radius and effects.
      std::uint32_t mask = (1U << 14U) | (1U << 19U) | (1U << 20U)
        | (1U << 24U) | (1U << 25U) | (1U << 27U);
      std::vector<Field> fields{scalar(7U, entity.collision_radius.value),
        scalar(28U, entity.position.y.value), scalar(49U, entity.position.x.value),
        scalar(53U, entity.health.value), scalar(55U, entity.max_health.value),
        byte(14U, entity.effect_flags), byte(38U, entity.death_processed ? 1U : 0U)};
      ByteWriter angle; angle.write_u16_le(pack_snapshot_angle(entity.angle.value));
      fields.push_back({8U, angle.bytes()});
      const EntityHandle owner{entity.owner};
      // Original entity+224 is the spatial parent (field23), whereas +236 is
      // attribution/ownership (field57). Sim positions are already absolute.
      // Captured original petals have parent=0 and owner=controlled body.
      fields.push_back(integer(23U, 0U));
      fields.push_back(integer(57U, entity.owner != UINT32_MAX && owner.valid() ? owner.to_wire() : 0U));
      if (entity.kind == EntityKind::kPlayer) {
        mask |= (1U << 18U) | (1U << 29U);
        fields.push_back(byte(2U, entity.player_look));
        fields.push_back(byte(26U, 0U)); // archived model; domain kind26 is independent
        fields.push_back(byte(31U, entity.player_expression));
        for (auto& field : fields)
          if (field.id == 57U) field = integer(57U, original_client_controller_handle().to_wire());
        fields.push_back(string(48U, world_.player_name()));
        const float threshold = experience_threshold(world_.profile().level()).value;
        const auto xp = threshold > 0.0F ? static_cast<std::uint32_t>(std::clamp(
          world_.profile().experience().value * 65535.0F / threshold, 0.0F, 65535.0F)) : 0U;
        fields.push_back(varint(58U, xp));
        fields.push_back(scalar(59U, world_.loadout().score().value));
        std::array<std::uint8_t, 16> inventory{};
        for (std::size_t i = 0; i < inventory.size(); ++i)
          inventory[i] = static_cast<std::uint8_t>(world_.loadout().slots()[i].type_id);
        fields.push_back(array(60U, inventory));
        fields.push_back(array(61U, world_.loadout().recharge_progress(), true));
        fields.push_back(byte(62U, world_.profile().level()));
        const std::uint8_t zone = world_.zone_progress();
        if (zone != 0U || original_client_zone_progress_ != 0U)
          fields.push_back(byte(63U, zone));
        original_client_zone_progress_ = zone;
      } else if (entity.kind == EntityKind::kPetal) {
        mask = 0x03184040U; // original393 equipped-petal probe
        fields.erase(std::remove_if(fields.begin(), fields.end(), [](const Field& field) {
          return field.id == 14U;
        }), fields.end());
        fields.push_back(byte(50U, static_cast<std::uint8_t>(entity.type_id)));
      } else if (entity.kind == EntityKind::kDrop) {
        mask = 0x03100001U; // original43 loot -> original393 probe
        fields.erase(std::remove_if(fields.begin(), fields.end(), [](const Field& field) {
          return field.id == 14U || field.id == 23U || field.id == 57U
            || field.id == 53U || field.id == 55U;
        }), fields.end());
        fields.push_back(byte(22U, static_cast<std::uint8_t>(entity.type_id)));
        fields.push_back(byte(54U, entity.pickup_collected ? 1U : 0U));
      } else if (entity.kind == EntityKind::kMob) {
        mask |= 1U << 13U;
        fields.push_back(byte(43U, static_cast<std::uint8_t>(entity.type_id)));
        switch (entity.type_id) {
          case 1: case 2: mask = 0x0B1C6004U; break;
          case 3: mask = 0x0B5C6000U; break;
          case 4: case 5: case 20: case 21: mask = 0x0B1C7002U; break;
          case 6: mask = 0x1B1C6002U; break;
          case 7: case 8: case 9: case 10: mask = 0x0B1C6202U; break;
          case 11: mask |= 1U << 11U; break;
          case 12: case 13: mask = 0x0B1D6002U; break;
          case 14: mask = 0x0B9C6002U; break;
          case 15: case 16: case 17: case 18: mask = 0x0B3C6002U; break;
          case 19: mask |= 1U << 8U; break;
          case 22: mask = 0x0B1C600AU; break;
          default: break;
        }
        if (entity.ai.enabled) {
          mask |= 1U << 1U;
          fields.push_back(byte(36U, entity.ai.activity_flags));
        }
        mask |= 1U << 18U;
        fields.push_back(string(48U, ""));
        if (entity.type_id >= 7U && entity.type_id <= 10U)
          fields.push_back(byte(17U, entity.ai.variant));
      } else if (entity.kind == EntityKind::kProjectile) {
        // The original projectile record carries its petal paint type so the
        // client can render Hornet stingers as Missile art, not the Hornet.
        mask |= 1U << 17U;
        fields.push_back(byte(50U, static_cast<std::uint8_t>(entity.type_id)));
      }
      record(entity.handle, mask, std::move(fields), false, &entity);
    }
  }
  for (auto it = original_client_records_.begin(); it != original_client_records_.end();) {
    if (current.contains(it->first)) { ++it; continue; }
    writer.write_delete(EntityHandle::from_wire(it->first));
    original_client_known_.erase(it->first);
    it = original_client_records_.erase(it);
  }
  for (const auto& event : original_client_pending_events_)
    writer.write_event(event.first, event.second);
  original_client_pending_events_.clear();
  if (original_client_event_tick_ != world_.tick()) {
    for (const HitEvent& hit : world_.hit_events()) {
      if (!current.contains(hit.target.to_wire())) continue;
      ByteWriter payload; payload.write_u32_le(hit.target.to_wire());
      writer.write_event(11U, payload.bytes());
    }
    for (const auto& transfer : world_.loadout().pickup_transfers()) {
      if (!current.contains(transfer.drop.to_wire())) continue;
      ByteWriter payload; payload.write_u32_le(transfer.drop.to_wire());
      payload.write_u8(transfer.slot);
      writer.write_event(14U, payload.bytes());
    }
    original_client_event_tick_ = world_.tick();
  }
  return writer.finish();
}

std::deque<OutputPacket> WorkerApi::flush_original_client() {
  original_client_enabled_ = true;
  if (world_.tick() > original_client_queued_tick_) {
    original_client_output_.push_back(OutputPacket{
      original_client_snapshot_bytes(++original_client_sequence_)});
    original_client_queued_tick_ = world_.tick();
  }
  auto packets = std::move(original_client_output_);
  original_client_output_.clear();
  return packets;
}

std::vector<std::uint8_t> WorkerApi::domain_snapshot_bytes(std::uint32_t sequence,
                                                           std::uint32_t reliable_ack) {
  OriginalSnapshotWriter writer;
  writer.begin(sequence, reliable_ack);
  // Original 654 beginSnapshot only queries spatial entities after the local
  // viewer component (+120) has a controlled body (+100). At boot the world
  // still simulates its population, but sends only control/world metadata.
  // The domain transport has no standalone metadata entities to introduce.
  if (!domain_viewer_started_) {
    const Entity* player = world_.entities().get(world_.player());
    domain_viewer_started_ = player != nullptr && player->active;
    if (!domain_viewer_started_) {
      pending_deletes_.clear();
      pending_events_.clear();
      world_.clear_hit_events();
      world_.loadout().clear_pickup_transfers();
      return writer.finish();
    }
  }
  std::unordered_set<std::uint32_t> visible;
  const Entity* controlled = world_.entities().get(world_.player());
  if (domain_visibility_enabled_) {
    if (controlled != nullptr && controlled->health.value > 0.0F) {
      domain_viewer_position_ = controlled->position;
      // Original145: an equipped type25 widens the player's view. The
      // ordinary live scale is 0.9; death keeps the last peer view instead
      // of querying the world origin or switching back to a menu camera.
      bool wide_view = false;
      const auto& slots = world_.loadout().slots();
      for (std::size_t index = 0; index < world_.profile().active_slots(); ++index)
        wide_view = wide_view || slots[index].type_id == 25U;
      domain_viewer_scale_ = f32(wide_view ? 0.63F : 0.9F);
    }
    // beginSnapshot, WAT155342–156212: both divisions, additions and
    // origin offsets store f32. Query192 uses inclusive rectangle overlap.
    const f32 width = f32(1920.0F) / domain_viewer_scale_ + f32(200.0F);
    const f32 height = f32(1080.0F) / domain_viewer_scale_ + f32(200.0F);
    const f32 left = width * f32(-0.5F) + domain_viewer_position_.x;
    const f32 top = height * f32(-0.5F) + domain_viewer_position_.y;
    const Aabb view{left, top, left + width, top + height};
    const f32 half_width = world_.width() * f32(0.5F);
    const f32 half_height = world_.height() * f32(0.5F);
    QuadTree tree({f32(0.0F) - half_width, f32(0.0F) - half_height, half_width, half_height}, 4U, 6U);
    for (const auto& entity : world_.entities().entities())
      if (entity.active) tree.insert(entity.handle.index(), peer_body_bounds(world_, entity));
    std::vector<std::size_t> candidates;
    tree.query(view, candidates);
    for (const auto index : candidates) {
      const auto& entity = world_.entities().entities()[index];
      if (entity.active && peer_body_bounds(world_, entity).intersects(view))
        visible.insert(entity.handle.raw);
    }
    // Original5897–5936 introduces the controlled body independently of the
    // rectangle (important when the eye and a newly spawned body differ).
    if (controlled != nullptr) visible.insert(controlled->handle.raw);
  } else {
    for (const auto& entity : world_.entities().entities())
      if (entity.active) visible.insert(entity.handle.raw);
  }
  std::vector<EntityHandle> removed;
  for (const EntityHandle handle : pending_deletes_)
    if (!domain_visibility_enabled_ || domain_known_.contains(handle.raw)) removed.push_back(handle);
  if (domain_visibility_enabled_)
    for (const auto raw : domain_known_)
      if (!visible.contains(raw)) removed.push_back(EntityHandle{raw});
  std::sort(removed.begin(), removed.end(), peer_handle_less);
  removed.erase(std::unique(removed.begin(), removed.end()), removed.end());
  for (const EntityHandle handle : removed) {
    writer.write_delete(handle);
    domain_camera_bits_.erase(handle.to_wire());
    domain_position_revisions_.erase(handle.to_wire());
    domain_angle_values_.erase(handle.to_wire());
    domain_score_bits_.erase(handle.to_wire());
    domain_loadout_values_.erase(handle.to_wire());
  }
  pending_deletes_.clear();
  for (const auto& event : pending_events_) writer.write_event(event.first, event.second);
  pending_events_.clear();
  for (const HitEvent& hit : world_.hit_events()) {
    if (domain_visibility_enabled_ && !visible.contains(hit.target.raw)
        && !domain_known_.contains(hit.target.raw)) continue;
    // The archived attribution object is 4124 bytes; the domain fills the
    // epoch/refcount/endpoint fields and uses it as the event key.
    HitMessage message;
    message.set_epoch(hit.epoch);
    message.set_refcount(hit.refcount);
    message.set_target(hit.target.raw);
    message.set_attacker(hit.attacker.raw);
    const EntityHandle target{message.target()};
    writer.write_entity_time_event(target);
  }
  world_.clear_hit_events();
  for (const auto& transfer : world_.loadout().pickup_transfers())
    if (!domain_visibility_enabled_ || visible.contains(transfer.drop.raw)
        || domain_known_.contains(transfer.drop.raw))
      writer.write_visual_event(transfer.drop, transfer.slot);
  world_.loadout().clear_pickup_transfers();
  // Component ordinals are not the sparse field ids: transform is 6 (72),
  // identity is 30 (152), health is 20 (116), visual transform is 21 (120),
  // collider radius is 26 (140).
  constexpr std::uint32_t kDomainMask =
    (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  for (const auto& entity : world_.entities().entities()) {
    if (!entity.active || !visible.contains(entity.handle.raw)) continue;
    const std::uint32_t mask = default_dense_groups_
      ? OriginalSnapshotWriter::kDefaultDenseComponentMask : kDomainMask;
    const std::array<std::uint32_t, 2> camera_bits{{entity.position.x.bits(), entity.position.y.bits()}};
    const auto previous_camera = domain_camera_bits_.find(entity.handle.to_wire());
    const bool camera_x_changed = previous_camera == domain_camera_bits_.end()
      || previous_camera->second[0] != camera_bits[0];
    const bool camera_y_changed = previous_camera == domain_camera_bits_.end()
      || previous_camera->second[1] != camera_bits[1];
    const std::array<std::uint64_t, 2> position_revisions{{entity.position_x_revision, entity.position_y_revision}};
    const auto previous_position = domain_position_revisions_.find(entity.handle.to_wire());
    const bool visual_x_changed = camera_x_changed || previous_position == domain_position_revisions_.end()
      || previous_position->second[0] != position_revisions[0];
    const bool visual_y_changed = camera_y_changed || previous_position == domain_position_revisions_.end()
      || previous_position->second[1] != position_revisions[1];
    const auto angle_value = pack_snapshot_angle(entity.angle.value);
    const auto previous_angle = domain_angle_values_.find(entity.handle.to_wire());
    const bool angle_changed = previous_angle == domain_angle_values_.end()
      || previous_angle->second != angle_value;
    // A newly spawned pickup is introduced with the archive's arrival bit so
    // the client replays its birth animation. Pickups that were already in
    // view keep full scale, matching the original first-snapshot behaviour.
    const bool arriving = entity.kind == EntityKind::kDrop
      && !domain_known_.contains(entity.handle.raw)
      && world_.tick() <= entity.spawn_tick + 1U;
    writer.write_mask_domain_fields(entity.handle, mask,
      entity.kind == EntityKind::kPlayer ? entity.player_look : static_cast<std::uint8_t>(entity.type_id),
      static_cast<std::uint8_t>(entity.kind),
      entity.kind == EntityKind::kPlayer ? entity.player_expression : entity.loadout_instance,
      entity.position.x.value, entity.position.y.value,
      entity.angle.value, entity.health.value, entity.max_health.value, entity.collision_radius.value,
      entity.death_processed ? 1U : 0U, camera_x_changed, camera_y_changed, angle_changed,
      entity.ai.enabled ? std::optional<std::uint8_t>(entity.ai.activity_flags) : std::nullopt,
      visual_x_changed, visual_y_changed, arriving);
    domain_camera_bits_[entity.handle.to_wire()] = camera_bits;
    domain_position_revisions_[entity.handle.to_wire()] = position_revisions;
    domain_angle_values_[entity.handle.to_wire()] = angle_value;
    if (full_field_framing_) {
      write_full_fields(writer, entity, mask);
      if (entity.kind == EntityKind::kPlayer && world_.zone_progress() != 0U)
        writer.write_mask_byte_field(entity.handle, mask, 63U, world_.zone_progress());
    }
    if (entity.kind == EntityKind::kDrop && !full_field_framing_) {
      writer.write_mask_byte_field(entity.handle, mask, 22U, static_cast<std::uint8_t>(entity.type_id));
      writer.write_mask_byte_field(entity.handle, mask, 54U, entity.pickup_collected ? 1U : 0U);
    }
    if (entity.kind == EntityKind::kPetal && !full_field_framing_) {
      // Domain fields 11/12 identify the actual equipped slot/instance.
      // These are not the original world component's capacity bytes.
      writer.write_mask_byte_field(entity.handle, mask, 11U, entity.loadout_slot);
      writer.write_mask_byte_field(entity.handle, mask, 12U, entity.loadout_instance);
    }
    if (entity.kind == EntityKind::kPlayer) {
      // Original player component fields: 58 is a normalized u16 XP fraction,
      // 59 is the scoreboard score, and 62 is the displayed level. Keep these
      // authoritative; the client must never substitute a recorded HUD sample.
      const float threshold = experience_threshold(world_.profile().level()).value;
      const float progress = threshold > 0.0F
        ? std::clamp(world_.profile().experience().value * 65535.0F / threshold, 0.0F, 65535.0F) : 0.0F;
      writer.write_mask_varint_field(entity.handle, mask, 58U,
        static_cast<std::uint32_t>(progress));
      const auto score_bits = world_.loadout().score().bits();
      const auto previous_score = domain_score_bits_.find(entity.handle.to_wire());
      if (previous_score == domain_score_bits_.end() || previous_score->second != score_bits) {
        writer.write_mask_float_field(entity.handle, mask, 59U, world_.loadout().score().value);
        domain_score_bits_[entity.handle.to_wire()] = score_bits;
      }
      writer.write_mask_byte_field(entity.handle, mask, 62U,
        world_.profile().level());
      if (!full_field_framing_) {
        const std::uint8_t zone = world_.zone_progress();
        if (zone != 0U || domain_zone_progress_ != 0U)
          writer.write_mask_byte_field(entity.handle, mask, 63U, zone);
        domain_zone_progress_ = zone;
      }
      DomainLoadoutValues loadout;
      for (std::size_t slot = 0; slot < loadout.inventory.size(); ++slot)
        loadout.inventory[slot] = static_cast<std::uint8_t>(world_.loadout().slots()[slot].type_id);
      loadout.recharge = world_.loadout().recharge_progress();
      const auto previous = domain_loadout_values_.find(entity.handle.to_wire());
      writer.write_mask_loadout_fields(entity.handle, mask, loadout.inventory, loadout.recharge,
        previous == domain_loadout_values_.end() || previous->second.inventory != loadout.inventory,
        previous == domain_loadout_values_.end() || previous->second.recharge != loadout.recharge);
      domain_loadout_values_[entity.handle.to_wire()] = loadout;
    }
    // Dense live value tables (set_snapshot_* / set_snapshot_groups) are
    // appended after the compact domain record; absent tables fall back to the
    // derived default groups when enabled.
    // Dense group 72 necessarily contains both camera axes. Omit this
    // redundant default record unless both axes changed, otherwise it would
    // reintroduce unchanged camera/visual targets and reset their clocks.
    if (!write_dense_values(writer, entity) && default_dense_groups_
        && camera_x_changed && camera_y_changed && angle_changed)
      write_default_dense_values(writer, entity);
    if (entity.kind == EntityKind::kPlayer && entity.death_processed) {
      // The archived client reads death statistics from control component 478,
      // a standalone record that the domain transport does not carry. Emit the
      // same fields on the controlled body so the death screen and the respawn
      // menu retain the original killer/lost-item/score data. These records
      // intentionally follow the dense defaults, whose group 72 writes zeros.
      writer.write_mask_string_field(entity.handle, mask, 6U, entity.killer_name);
      // These are the kept petals (at most three), not the discarded stack:
      // the respawn line lists what the player will start with.
      const auto& kept_items = world_.last_death_kept();
      for (std::uint32_t index = 0; index < 10U; ++index)
        writer.write_mask_byte_array_field(entity.handle, mask, 16U, index,
          static_cast<std::uint8_t>(kept_items[index]));
      writer.write_mask_float_field(entity.handle, mask, 21U,
        world_.last_death_score().value);
      writer.write_mask_byte_field(entity.handle, mask, 34U,
        static_cast<std::uint8_t>(world_.last_death_kept_count()));
      writer.write_mask_byte_field(entity.handle, mask, 47U,
        static_cast<std::uint8_t>(world_.last_death_level()));
      writer.write_mask_reference_field(entity.handle, mask, 56U,
        entity.handle.to_wire());
    }
  }
  domain_known_ = std::move(visible);
  return writer.finish();
}

void WorkerApi::enqueue_snapshot(std::uint32_t sequence) {
  (void)output_.enqueue(OutputPacket{snapshot_bytes(sequence)});
}

void WorkerApi::enqueue_domain_snapshot(std::uint32_t sequence) {
  if (original_client_enabled_ && world_.tick() > original_client_queued_tick_) {
    original_client_output_.push_back(OutputPacket{
      original_client_snapshot_bytes(++original_client_sequence_)});
    original_client_queued_tick_ = world_.tick();
  }
  (void)output_.enqueue(OutputPacket{domain_snapshot_bytes(sequence)});
}

EntityHandle WorkerApi::spawn(EntityKind kind, std::uint16_t type_id, Vec2 position) {
  return spawn_entity_from_defaults(world_, kind, type_id, position);
}

bool WorkerApi::set_snapshot_byte(EntityHandle handle, std::uint32_t field, std::uint8_t value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_byte_values_[handle.to_wire()][field] = value;
  snapshot_values_[handle.to_wire()].bytes[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_groups(EntityHandle handle, std::uint32_t groups) {
  Entity* entity = world_.entities().get(handle);
  if (entity == nullptr) return false;
  entity->snapshot_present_groups = groups;
  return true;
}

bool WorkerApi::set_snapshot_float(EntityHandle handle, std::uint32_t field, float value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].floats[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_varint(EntityHandle handle, std::uint32_t field, std::uint32_t value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].varints[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_bit(EntityHandle handle, std::uint32_t field, bool value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].bits[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_string(EntityHandle handle, std::uint32_t field, std::string value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].strings[field] = std::move(value);
  return true;
}

bool WorkerApi::set_snapshot_double(EntityHandle handle, std::uint32_t field, double value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].doubles[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_reference(EntityHandle handle, std::uint32_t field, std::uint32_t value) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  snapshot_values_[handle.to_wire()].references[field] = value;
  return true;
}

bool WorkerApi::set_snapshot_byte_array(EntityHandle handle, std::uint32_t field,
                                        std::span<const std::uint8_t, 16> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].byte_arrays[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_byte_array10(EntityHandle handle, std::uint32_t field,
                                          std::span<const std::uint8_t, 10> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].byte_arrays10[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_short_array(EntityHandle handle, std::uint32_t field,
                                         std::span<const std::uint16_t, 8> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].short_arrays[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_string_array(EntityHandle handle, std::uint32_t field,
                                          std::span<const std::string, 10> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].string_arrays[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_handle_array(EntityHandle handle, std::uint32_t field,
                                          std::span<const std::uint32_t, 10> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].handle_arrays[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_varint_array(EntityHandle handle, std::uint32_t field,
                                          std::span<const std::uint32_t, 10> values) {
  if (world_.entities().get(handle) == nullptr || field >= 64U) return false;
  for (std::size_t index = 0; index < values.size(); ++index)
    snapshot_values_[handle.to_wire()].varint_arrays[field][index] = values[index];
  return true;
}

bool WorkerApi::set_snapshot_group(EntityHandle handle, int group) {
  Entity* entity = world_.entities().get(handle);
  if (entity == nullptr) return false;
  entity->snapshot_dense_group = group;
  return true;
}

void WorkerApi::configure_player_spawn(const PlayerConfig& config, Vec2 position) {
  player_spawn_configured_ = true;
  player_config_ = config;
  player_position_ = position;
}

bool WorkerApi::set_component_presence(EntityHandle handle, std::uint32_t index, bool present) {
  Entity* entity = world_.entities().get(handle);
  if (entity == nullptr || index < 1U || index > 30U) return false;
  const std::uint32_t bit = 1U << (index - 1U);
  if (present) {
    entity->component_presence |= bit;
    entity->component_presence_bits.set(index - 1U);
  } else {
    entity->component_presence &= ~bit;
    entity->component_presence_bits.reset(index - 1U);
  }
  return true;
}

bool WorkerApi::set_snapshot_auto_position(EntityHandle handle, bool enabled) {
  if (world_.entities().get(handle) == nullptr) return false;
  snapshot_values_[handle.to_wire()].auto_position = enabled;
  return true;
}

std::uint32_t WorkerApi::dump_state(std::uint8_t* output, std::uint32_t capacity) const {
  std::uint32_t written = 0;
  std::uint32_t count = 0;
  for (const auto& entity : world_.entities().entities()) {
    if (!entity.active) continue;
    if (output != nullptr && written < capacity) {
      std::uint8_t* record = output + static_cast<std::size_t>(written) * 48U;
      const std::uint32_t handle = entity.handle.raw;
      const std::uint16_t type = entity.type_id;
      const std::uint8_t kind = static_cast<std::uint8_t>(entity.kind);
      const std::uint8_t reserved = 0;
      const float values[6] = {
        entity.position.x.value, entity.position.y.value, entity.angle.value,
        // Original physics +8 is the collision radius (petals draw at 14 but
        // collide at 10), so the diagnostic record must publish the collision
        // radius, not the render radius.
        entity.collision_radius.value, entity.health.value, entity.max_health.value,
      };
      std::memcpy(record, &handle, 4);
      std::memcpy(record + 4, &type, 2);
      std::memcpy(record + 6, &kind, 1);
      std::memcpy(record + 7, &reserved, 1);
      for (std::size_t index = 0; index < 6; ++index)
        std::memcpy(record + 8 + index * 4, &values[index], 4);
      // Diagnostic tail (R01): velocity and acceleration let the trace tool
      // separate AI steering differences from integration differences.
      const float motion[4] = {
        static_cast<float>(entity.velocity.x), static_cast<float>(entity.velocity.y),
        static_cast<float>(entity.acceleration.x), static_cast<float>(entity.acceleration.y),
      };
      for (std::size_t index = 0; index < 4; ++index)
        std::memcpy(record + 32 + index * 4, &motion[index], 4);
      ++written;
    }
    ++count;
  }
  return count;
}

bool WorkerApi::occupied(Vec2 position) const {
  return SpatialQuery::from_world(world_).occupied({position.x, position.y});
}

void WorkerApi::emit_event(std::uint8_t opcode, std::span<const std::uint8_t> payload) {
  pending_events_.emplace_back(opcode, std::vector<std::uint8_t>(payload.begin(), payload.end()));
  if (original_client_enabled_)
    original_client_pending_events_.emplace_back(opcode, std::vector<std::uint8_t>(payload.begin(), payload.end()));
}

bool WorkerApi::despawn(EntityHandle handle) {
  if (!world_.destroy(handle)) return false;
  snapshot_byte_values_.erase(handle.to_wire());
  snapshot_values_.erase(handle.to_wire());
  pending_deletes_.push_back(handle);
  return true;
}

} // namespace engine
