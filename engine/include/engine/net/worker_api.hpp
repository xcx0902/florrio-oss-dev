#pragma once
#include "engine/core/fixed_step.hpp"
#include "engine/model/world.hpp"
#include "engine/net/snapshot_publisher.hpp"
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

/** Domain-facing server API behind the four wasm exports. Keeping the mutable
 * world/clock/queue here lets native tests exercise the same path as the ABI
 * without duplicating the worker contract. */
class WorkerApi {
 public:
  void init(bool populate = false);
  [[nodiscard]] bool send(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key);
  void think();
  [[nodiscard]] std::deque<OutputPacket> flush();
  /** Live domain snapshot: fields 2/5/8/24/26/31/53/55, coalesced hit events and
   * pending deletes. This is the path used by `sp_server_think`. */
  [[nodiscard]] std::vector<std::uint8_t> domain_snapshot_bytes(std::uint32_t sequence,
                                                               std::uint32_t reliable_ack = 0);
  void enqueue_domain_snapshot(std::uint32_t sequence);
  void set_default_dense_groups(bool value) { publisher_.set_dense(value); }
  [[nodiscard]] bool default_dense_groups() const { return publisher_.dense(); }

  [[nodiscard]] World& world() { return world_; }
  [[nodiscard]] const World& world() const { return world_; }
  [[nodiscard]] std::uint32_t last_sequence() const { return last_sequence_; }
  [[nodiscard]] EntityHandle spawn(EntityKind kind, std::uint16_t type_id, Vec2 position);
  [[nodiscard]] bool occupied(Vec2 position) const;
  [[nodiscard]] bool despawn(EntityHandle handle);

 private:
  World world_;
  SnapshotPublisher publisher_;
  OutputQueue output_;
  std::uint32_t last_sequence_ = 0;
  double next_spawn_time_ms_ = 0.0;
};
} // namespace engine
