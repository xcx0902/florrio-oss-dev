#pragma once
#include "engine/core/fixed_step.hpp"
#include "engine/model/world.hpp"
#include "engine/net/snapshot.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/net/protocol.hpp"
#include <array>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <deque>
#include <limits>
#include <span>

namespace engine {

class OriginalSnapshotWriter;

/** Domain-facing server API behind the four wasm exports. Keeping the mutable
 * world/clock/queue here lets native tests exercise the same path as the ABI
 * without duplicating the worker contract. */
class WorkerApi {
 public:
  void init(bool populate = false);
  [[nodiscard]] bool send(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key);
  void think();
  [[nodiscard]] std::deque<OutputPacket> flush();
  [[nodiscard]] std::vector<std::uint8_t> snapshot_bytes(std::uint32_t sequence);
  [[nodiscard]] std::vector<std::uint8_t> original_snapshot_bytes(std::uint32_t sequence,
                                                                 std::uint32_t reliable_ack = 0);
  [[nodiscard]] std::vector<std::uint8_t> original_snapshot_next(std::uint32_t reliable_ack = 0);
  /** Archived client stream, including independent world/controller records.
   * An omitted ack uses the actual last accepted input sequence. This stream
   * has its own known set and never consumes the domain stream's caches. */
  [[nodiscard]] std::vector<std::uint8_t> original_client_snapshot_bytes(
      std::uint32_t sequence,
      std::uint32_t reliable_ack = std::numeric_limits<std::uint32_t>::max());
  /** Select the archived peer on first call, then drain its per-think queue.
   * The ABI's original flush should call this instead of hashing the world.
   * No packet is published before the first simulation tick. */
  [[nodiscard]] std::deque<OutputPacket> flush_original_client();
  [[nodiscard]] EntityHandle original_client_world_handle() const {
    return world_.entities().entities()[0].handle;
  }
  [[nodiscard]] EntityHandle original_client_controller_handle() const {
    return world_.entities().entities()[1].handle;
  }
  /** Live domain snapshot: fields 2/5/8/24/26/31/53/55, coalesced hit events and
   * pending deletes. This is the path used by `sp_server_think`. */
  [[nodiscard]] std::vector<std::uint8_t> domain_snapshot_bytes(std::uint32_t sequence,
                                                               std::uint32_t reliable_ack = 0);
  void enqueue_snapshot(std::uint32_t sequence);
  void enqueue_domain_snapshot(std::uint32_t sequence);
  /** Opt-in full 1015 field framing: emit every sparse field type and dense
   * group writer for each live entity. The compact domain subset remains the
   * default so normal snapshots stay small. */
  void set_full_field_framing(bool value) { full_field_framing_ = value; }
  [[nodiscard]] bool full_field_framing() const { return full_field_framing_; }
  /** Live domain records also emit the derived dense groups 72/116/120/124
   * when no explicit setter table exists. Enabled by default; tests that need
   * the bare compact record can disable it. */
  void set_default_dense_groups(bool value) { default_dense_groups_ = value; }
  [[nodiscard]] bool default_dense_groups() const { return default_dense_groups_; }

  [[nodiscard]] World& world() { return world_; }
  [[nodiscard]] const World& world() const { return world_; }
  [[nodiscard]] std::uint32_t last_sequence() const { return last_sequence_; }
  [[nodiscard]] EntityHandle spawn(EntityKind kind, std::uint16_t type_id, Vec2 position);
  [[nodiscard]] bool occupied(Vec2 position) const;
  /** Packed per-entity state dump (32-byte records). Returns the active entity
   * count and writes at most `capacity` records. */
  [[nodiscard]] std::uint32_t dump_state(std::uint8_t* output, std::uint32_t capacity) const;
  [[nodiscard]] bool despawn(EntityHandle handle);
  /** Snapshot byte value for a byte-only dense group field. */
  bool set_snapshot_byte(EntityHandle handle, std::uint32_t field, std::uint8_t value);
  bool set_snapshot_groups(EntityHandle handle, std::uint32_t groups);
  bool set_snapshot_float(EntityHandle handle, std::uint32_t field, float value);
  bool set_snapshot_varint(EntityHandle handle, std::uint32_t field, std::uint32_t value);
  bool set_snapshot_bit(EntityHandle handle, std::uint32_t field, bool value);
  bool set_snapshot_string(EntityHandle handle, std::uint32_t field, std::string value);
  bool set_snapshot_double(EntityHandle handle, std::uint32_t field, double value);
  bool set_snapshot_reference(EntityHandle handle, std::uint32_t field, std::uint32_t value);
  bool set_snapshot_byte_array(EntityHandle handle, std::uint32_t field, std::span<const std::uint8_t, 16> values);
  bool set_snapshot_byte_array10(EntityHandle handle, std::uint32_t field, std::span<const std::uint8_t, 10> values);
  bool set_snapshot_short_array(EntityHandle handle, std::uint32_t field, std::span<const std::uint16_t, 8> values);
  bool set_snapshot_string_array(EntityHandle handle, std::uint32_t field, std::span<const std::string, 10> values);
  bool set_snapshot_handle_array(EntityHandle handle, std::uint32_t field, std::span<const std::uint32_t, 10> values);
  bool set_snapshot_varint_array(EntityHandle handle, std::uint32_t field, std::span<const std::uint32_t, 10> values);
  bool set_snapshot_group(EntityHandle handle, int group);
  bool set_snapshot_auto_position(EntityHandle handle, bool enabled);
  bool set_component_presence(EntityHandle handle, std::uint32_t index, bool present);
  void configure_player_spawn(const PlayerConfig& config, Vec2 position);
  void emit_event(std::uint8_t opcode, std::span<const std::uint8_t> payload);

 private:
  /** Write one entity's configured dense group / byte groups / mask fallback.
   * Returns false when the entity has no configured dense representation. */
  bool write_dense_values(OriginalSnapshotWriter& writer, const Entity& entity);
  /** Derived dense groups for a live entity without explicit setter values. */
  void write_default_dense_values(OriginalSnapshotWriter& writer, const Entity& entity);
  World world_;
  FixedStepClock clock_;
  OutputQueue output_;
  std::uint32_t last_sequence_ = 0;
  std::uint32_t original_sequence_ = 0;
  /** Wire handles already introduced to the archived client. Later ticks send
   * field-only updates for these entities; new handles carry the component
   * mask once. */
  std::unordered_set<std::uint32_t> original_client_known_;
  struct OriginalClientRecord {
    std::uint32_t mask = 0;
    std::array<std::vector<std::uint8_t>, 64> fields;
    std::array<std::uint64_t, 2> position_revisions{};
  };
  std::unordered_map<std::uint32_t, OriginalClientRecord> original_client_records_;
  /** Last zone-progress byte sent to the archived client. Kept so the field is
   * emitted once more with zero after the flower leaves an overleveled zone. */
  std::uint8_t original_client_zone_progress_ = 0;
  /** Same clear-once behaviour for the compact domain stream. */
  std::uint8_t domain_zone_progress_ = 0;
  bool original_client_enabled_ = false;
  bool original_client_viewer_started_ = false;
  Vec2 original_client_viewer_position_;
  f32 original_client_viewer_scale_ = f32(1.0F);
  std::uint32_t original_client_sequence_ = 0;
  std::uint64_t original_client_queued_tick_ = 0;
  std::uint64_t original_client_event_tick_ = std::numeric_limits<std::uint64_t>::max();
  std::deque<OutputPacket> original_client_output_;
  std::vector<std::pair<std::uint8_t, std::vector<std::uint8_t>>> original_client_pending_events_;
  /** Last score sent on this live stream. Repeated field 59 resets the
   * original client's interpolation clock even when its value is equal. */
  std::unordered_map<std::uint32_t, std::uint32_t> domain_score_bits_;
  std::unordered_map<std::uint32_t, std::array<std::uint32_t, 2>> domain_camera_bits_;
  std::unordered_map<std::uint32_t, std::array<std::uint64_t, 2>> domain_position_revisions_;
  std::unordered_map<std::uint32_t, std::uint16_t> domain_angle_values_;
  struct DomainLoadoutValues {
    std::array<std::uint8_t, 16> inventory{};
    std::array<std::uint16_t, 8> recharge{};
  };
  std::unordered_map<std::uint32_t, DomainLoadoutValues> domain_loadout_values_;
  /** A populated production world has no spatial viewer until its first
   * controlled body. Unpopulated native fixtures publish their explicit
   * entities without a session, as before. Retain the viewer after death. */
  bool domain_viewer_started_ = false;
  /** Original beginSnapshot's per-peer spatial set. Explicit init(false)
   * fixtures bypass this query; a joined production peer retains its last
   * position/scale after losing its controlled body. Stream caches belong to
   * this set, so re-entry must send initial camera/angle/profile fields. */
  bool domain_visibility_enabled_ = false;
  Vec2 domain_viewer_position_;
  f32 domain_viewer_scale_ = f32(1.0F);
  std::unordered_set<std::uint32_t> domain_known_;
  struct SnapshotValues {
    std::array<float, 64> floats{};
    std::array<std::uint32_t, 64> varints{};
    std::array<bool, 64> bits{};
    std::array<std::string, 64> strings{};
    std::array<double, 64> doubles{};
    std::array<std::uint32_t, 64> references{};
    std::array<std::uint8_t, 64> bytes{};
    std::array<std::array<std::uint8_t, 16>, 64> byte_arrays{};
    std::array<std::array<std::uint8_t, 10>, 64> byte_arrays10{};
    std::array<std::array<std::uint16_t, 8>, 64> short_arrays{};
    std::array<std::array<std::string, 10>, 64> string_arrays{};
    std::array<std::array<std::uint32_t, 10>, 64> handle_arrays{};
    std::array<std::array<std::uint32_t, 10>, 64> varint_arrays{};
    bool auto_position = false;
  };
  std::unordered_map<std::uint32_t, std::array<std::uint8_t, 64>> snapshot_byte_values_;
  std::unordered_map<std::uint32_t, SnapshotValues> snapshot_values_;
  bool player_spawn_configured_ = false;
  PlayerConfig player_config_{};
  Vec2 player_position_;
  bool full_field_framing_ = false;
  bool default_dense_groups_ = true;
  std::vector<EntityHandle> pending_deletes_;
  std::vector<std::pair<std::uint8_t, std::vector<std::uint8_t>>> pending_events_;
};

} // namespace engine
