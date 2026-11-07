#pragma once
#include "engine/model/player_id.hpp"
#include "engine/model/world_records.hpp"
#include "engine/model/petal_state.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/sim/player_loadout.hpp"
#include <algorithm>
#include <array>
#include <span>
#include <string>
#include <vector>

namespace engine {
inline constexpr std::uint64_t kInputTtlTicks = 5;
// The v1 Worker keeps its last menu/corpse input until the next successful
// spawn. Native multiplayer input uses a finite lease instead.
inline constexpr std::uint64_t kOfflineInputTtl = UINT64_MAX;

enum class PlayerLife {
  kRegistered,
  kAlive,
  kCorpse,
  kRespawnable
};

struct DeathState {
  Vec2 position;
  f32 view_scale{0.9F};
  f32 score{};
  std::uint8_t level = 0;
  std::array<catalog::PetalId, 10> kept{};
  std::uint8_t kept_count = 0;
  EntityHandle killer{};
  std::string killer_name;
  DamageSource source;
};

/** Authoritative state belonging to one identity, independent of its body. */
class PlayerState {
 public:
  [[nodiscard]] PlayerId id() const { return id_; }
  [[nodiscard]] EntityHandle player() const { return body_; }
  [[nodiscard]] const std::string& player_name() const { return name_; }
  void set_player_name(std::string name) { name_ = std::move(name); }
  [[nodiscard]] f32 player_speed() const { return speed_; }
  void set_player_speed(f32 speed) { speed_ = speed; }
  [[nodiscard]] PlayerProfile& profile() { return profile_; }
  [[nodiscard]] const PlayerProfile& profile() const { return profile_; }
  [[nodiscard]] PlayerLoadout& loadout() { return loadout_; }
  [[nodiscard]] const PlayerLoadout& loadout() const { return loadout_; }
  [[nodiscard]] const PlayerInput& input() const { return input_; }
  [[nodiscard]] std::vector<PetalOrbitState>& petals() { return petals_; }
  [[nodiscard]] const std::vector<PetalOrbitState>& petals() const { return petals_; }
  [[nodiscard]] f32 zone_timer_ms() const { return zone_timer_ms_; }
  void set_zone_timer_ms(f32 value) { zone_timer_ms_ = value; }
  [[nodiscard]] bool zone_petals_disabled() const { return zone_disabled_; }
  void set_zone_petals_disabled(bool value) { zone_disabled_ = value; }
  [[nodiscard]] std::uint8_t zone_progress() const { return zone_progress_; }
  void set_zone_progress(std::uint8_t value) { zone_progress_ = value; }
  [[nodiscard]] f32 last_death_score() const { return death.score; }
  [[nodiscard]] std::uint8_t last_death_level() const { return death.level; }
  [[nodiscard]] const auto& last_death_kept() const { return death.kept; }
  [[nodiscard]] std::uint8_t last_death_kept_count() const { return death.kept_count; }
  void set_last_death(f32 score, std::uint8_t level) {
    death.score = score;
    death.level = level;
  }
  void set_last_death_kept(std::span<const catalog::PetalId> kept) {
    death.kept.fill(catalog::PetalId::kNone);
    death.kept_count = static_cast<std::uint8_t>(std::min(kept.size(), death.kept.size()));
    std::copy_n(kept.begin(), death.kept_count, death.kept.begin());
  }
  void set_last_killer(EntityHandle handle, std::string name) {
    death.killer = handle;
    death.killer_name = std::move(name);
  }
  [[nodiscard]] EntityHandle last_killer() const { return death.killer; }
  [[nodiscard]] const std::string& last_killer_name() const { return death.killer_name; }

  DeathState death;
  PlayerLife life = PlayerLife::kRegistered;
  LifeEpoch life_epoch = 0;
  std::uint64_t next_spawn_tick = 0;
  std::uint64_t last_applied_input_tick = 0;
  std::uint64_t input_valid_until_tick = 0;
  std::uint32_t input_session_epoch = 0;
  std::uint32_t input_sequence = 0;
  std::uint32_t last_applied_input_sequence = 0;
  std::uint64_t last_control_tick = UINT64_MAX;

  void store_input(PlayerInput input) { input_ = input; }
  void clear_input() {
    input_ = {};
    input_sequence = 0;
    input_valid_until_tick = 0;
  }
  [[nodiscard]] bool has_offline_input_lease() const {
    return input_valid_until_tick == kOfflineInputTtl;
  }

 private:
  friend class PlayerRegistry;
  PlayerId id_{};
  EntityHandle body_{};
  std::string name_;
  f32 speed_{};
  PlayerProfile profile_;
  PlayerLoadout loadout_;
  PlayerInput input_;
  std::vector<PetalOrbitState> petals_;
  f32 zone_timer_ms_{};
  std::uint8_t zone_progress_ = 0;
  bool zone_disabled_ = false;
};
}  // namespace engine
