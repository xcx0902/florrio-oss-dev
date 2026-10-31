#pragma once
#include "engine/model/world.hpp"
#include <optional>
#include <unordered_map>
#include <unordered_set>
namespace engine {
struct PublishedLoadout {
  std::array<std::uint8_t, 16> inventory{};
  std::array<std::uint16_t, 8> recharge{};
};
struct PublishedEntity {
  std::optional<std::array<std::uint32_t, 2>> camera;
  std::optional<std::array<std::uint64_t, 2>> position;
  std::optional<std::uint16_t> angle;
  std::optional<std::uint32_t> score;
  std::optional<PublishedLoadout> loadout;
};
struct ReplicationSession {
  std::unordered_map<std::uint32_t, PublishedEntity> published;
  std::unordered_set<std::uint32_t> known;
  bool viewer_started = false;
  bool visibility_enabled = false;
  Vec2 viewer_position;
  f32 viewer_scale = f32(1.0F);
  std::uint8_t zone_progress = 0;
};
class SnapshotPublisher {
 public:
  void reset(bool populated) { session_ = {}; session_.visibility_enabled = populated; session_.viewer_started = !populated; pending_chat_.clear(); default_dense_groups_ = true; }
  std::vector<std::uint8_t> publish(World& world, std::uint32_t sequence, std::uint32_t reliable_ack = 0);
  void emit_chat(std::string text) { pending_chat_.push_back(std::move(text)); }
  void set_dense(bool enabled) { default_dense_groups_ = enabled; }
  bool dense() const { return default_dense_groups_; }
 private:
  ReplicationSession session_;
  bool default_dense_groups_ = true;
  std::vector<std::string> pending_chat_;
};
}
