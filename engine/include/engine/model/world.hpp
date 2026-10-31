#pragma once
#include "engine/core/perf.hpp"
#include "engine/core/rng.hpp"
#include "engine/model/entity_pool.hpp"
#include "engine/model/world_records.hpp"
#include "engine/sim/collision_context.hpp"
#include "engine/model/effect_payload.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/petal_state.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/sim/player_loadout.hpp"
#include <string>
#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <cmath>
#include <limits>
#include <memory>
#include <optional>
#include <set>
#include <span>
#include <vector>

namespace engine {

inline constexpr std::uint32_t kInvalidEntity = std::numeric_limits<std::uint32_t>::max();

/** Server-side world skeleton. Simulation domains are filled in by
 * engine/src/sim/; this header intentionally has no magic offsets. */
class World {
 public:
  World() = default;

  void reset();

  /** Match sp_server_init's 16,384 entity-slot handle pass: every index gets a
   * nonzero generation from the 64-bit LCG, rejecting generation & 262143 == 0. */
  void initialize();

  [[nodiscard]] CollisionContext& collision() { return collision_; }
  [[nodiscard]] const std::vector<EntityHandle>& destroyed() const { return destroyed_; }
  void clear_destroyed() { destroyed_.clear(); }
  [[nodiscard]] EntityPool& entities() { return entities_; }
  [[nodiscard]] const EntityPool& entities() const { return entities_; }
  [[nodiscard]] MinstdRng& rng() { return rng_; }
  [[nodiscard]] const MinstdRng& rng() const { return rng_; }
  [[nodiscard]] ServerRng& random() { return random_; }
  [[nodiscard]] const ServerRng& random() const { return random_; }
  /** Original retainPlayerLoot has a separate, once-initialized minstd stream.
   * Original130 obtains four host entropy bytes; seed modulo INT_MAX, zero->1.
   * Host entropy is not shared with this deterministic reconstruction: seed1
   * is the bounded fixture default. Callers can supply an explicit raw seed. */
  void seed_death_shuffle(std::uint32_t entropy) {
    death_shuffle_.seed(entropy % 2147483647U);
  }
  [[nodiscard]] ServerRng& death_shuffle_random() { return death_shuffle_; }
  [[nodiscard]] const PlayerInput& input() const { return input_; }
  [[nodiscard]] std::vector<PetalOrbitState>& petals() { return petals_; }
  [[nodiscard]] const std::vector<PetalOrbitState>& petals() const { return petals_; }
  [[nodiscard]] EntityHandle player() const { return player_; }
  void set_player(EntityHandle handle) { player_ = handle; }
  [[nodiscard]] const std::string& player_name() const { return player_name_; }
  void set_player_speed(f32 speed) { player_speed_ = speed; }
  [[nodiscard]] f32 player_speed() const { return player_speed_; }
  [[nodiscard]] PlayerLoadout& loadout() { return loadout_; }
  [[nodiscard]] const PlayerLoadout& loadout() const { return loadout_; }
  [[nodiscard]] PlayerProfile& profile() { return profile_; }
  [[nodiscard]] const PlayerProfile& profile() const { return profile_; }
  void set_player_name(std::string name) { player_name_ = std::move(name); }
  [[nodiscard]] f32 width() const { return width_; }
  [[nodiscard]] f32 height() const { return height_; }
  void set_dimensions(f32 width, f32 height) { width_ = width; height_ = height; }
  /** Zone timer at loadout+288. Overleveled time accumulates while the player
   * is left of minimumLevelZoneX; it drains at one tenth speed otherwise. */
  [[nodiscard]] f32 zone_timer_ms() const { return zone_timer_ms_; }
  void set_zone_timer_ms(f32 value) { zone_timer_ms_ = value; }
  [[nodiscard]] bool zone_petals_disabled() const { return zone_disabled_; }
  void set_zone_petals_disabled(bool value) { zone_disabled_ = value; }
  [[nodiscard]] std::uint8_t zone_progress() const { return zone_progress_; }
  void set_zone_progress(std::uint8_t value) { zone_progress_ = value; }
  [[nodiscard]] bool compact() const { return compact_; }
  void set_compact(bool compact) { compact_ = compact; }
  [[nodiscard]] bool auto_populate() const { return auto_populate_; }
  void set_auto_populate(bool value) { auto_populate_ = value; }

  /** Diagnostics: the most recent destruction records (kind/type/position).
   * Read by native tests to explain count divergence. */
  struct DeathRecord {
    std::uint64_t tick = 0;
    std::uint16_t type_id = 0;
    std::uint16_t attacker_type = 0;
    std::uint8_t kind = 0;
    std::uint8_t attacker_kind = 0;
    float x = 0.0F;
    float y = 0.0F;
  };
  void record_death(EntityKind kind, std::uint16_t type_id, Vec2 position,
                    EntityKind attacker_kind = EntityKind::kNone,
                    std::uint16_t attacker_type = 0) {
    deaths_.push_back(DeathRecord{tick_, type_id, attacker_type,
                                  static_cast<std::uint8_t>(kind),
                                  static_cast<std::uint8_t>(attacker_kind),
                                  position.x.value, position.y.value});
    if (deaths_.size() > 128U) deaths_.pop_front();
  }
  [[nodiscard]] const std::deque<DeathRecord>& deaths() const { return deaths_; }

  /** Original424 detaches the entity+212 constraint links at health death,
   * independently of ordinary ownership. Centipede links have +76 clear,
   * so a surviving next segment becomes a root even after a middle death. */
  void detach_linked_entities(EntityHandle handle);

  [[nodiscard]] bool destroy(EntityHandle handle);

  /** Sorted known-entity list used by the original hit-message cache. */
  void mark_known(EntityHandle handle) {
    if (handle.valid()) known_entities_.insert(handle.raw);
  }
  [[nodiscard]] bool is_known(EntityHandle handle) const {
    return known_entities_.find(handle.raw) != known_entities_.end();
  }
  [[nodiscard]] const std::set<std::uint32_t>& known_entities() const { return known_entities_; }

  /** Coalesce a hit notification for the current tick. The original keeps one
   * message per target epoch and merges repeated damage into it. Targets that
   * are not in the sorted known list stay in a pending vector. */
  void record_hit(EntityHandle target, EntityHandle attacker, f32 amount, f32 health_after);
  /** Move pending notifications into the outgoing list once their target is
   * visible in the known-entity list. */
  std::size_t flush_pending_hits() {
    std::size_t moved = 0;
    for (auto it = pending_hit_events_.begin(); it != pending_hit_events_.end();) {
      if (!is_known(it->target)) { ++it; continue; }
      it->known = true;
      hit_events_.push_back(*it);
      it = pending_hit_events_.erase(it);
      ++moved;
    }
    return moved;
  }
  [[nodiscard]] const std::vector<HitEvent>& hit_events() const { return hit_events_; }
  [[nodiscard]] const std::vector<HitEvent>& pending_hit_events() const { return pending_hit_events_; }
  void clear_hit_events() { hit_events_.clear(); }

  /** Pickup intrusive registry (world +36 count / +44 pointer vector). */
  void register_pickup(EntityHandle handle) {
    Entity* entity = entities_.get(handle);
    if (entity == nullptr || entity->pickup_listed) return;
    entity->pickup_listed = true;
    entity->pickup_prev = pickups_.empty() ? EntityHandle{} : pickups_.back();
    entity->pickup_next = EntityHandle{};
    if (!pickups_.empty()) {
      if (Entity* previous = entities_.get(pickups_.back())) previous->pickup_next = handle;
    }
    pickups_.push_back(handle);
  }
  void unregister_pickup(EntityHandle handle) {
    Entity* entity = entities_.get(handle);
    if (entity == nullptr || !entity->pickup_listed) return;
    if (Entity* previous = entities_.get(entity->pickup_prev)) previous->pickup_next = entity->pickup_next;
    if (Entity* next = entities_.get(entity->pickup_next)) next->pickup_prev = entity->pickup_prev;
    const auto found = std::find(pickups_.begin(), pickups_.end(), handle);
    if (found != pickups_.end()) pickups_.erase(found);
    entity->pickup_listed = false;
    entity->pickup_prev = EntityHandle{};
    entity->pickup_next = EntityHandle{};
  }
  [[nodiscard]] const std::vector<EntityHandle>& pickups() const { return pickups_; }

  /** AI component registry: append on creation, swap with the tail on removal,
   * matching the original dense component vector. Its order determines RNG
   * assignment when several wandering timers fire in one tick. */
  void register_ai(EntityHandle handle) {
    if (!handle.valid()) return;
    if (std::find(ai_order_.begin(), ai_order_.end(), handle) != ai_order_.end()) return;
    ai_order_.push_back(handle);
  }
  void unregister_ai(EntityHandle handle) {
    const auto found = std::find(ai_order_.begin(), ai_order_.end(), handle);
    if (found != ai_order_.end()) {
      *found = ai_order_.back();
      ai_order_.pop_back();
    }
  }
  [[nodiscard]] const std::vector<EntityHandle>& ai_entities() const { return ai_order_; }

  /** Original ant-hole release registry: append on species initialization,
   * swap with the tail on destruction. The iteration order is the order in
   * which holes were spawned, which determines RNG assignment when several
   * holes cross a threshold in the same tick. */
  void register_ant_hole(EntityHandle handle) {
    if (!handle.valid()) return;
    for (const auto& entry : ant_hole_releases_) {
      if (entry.entity == handle) return;
    }
    ant_hole_releases_.push_back(AntHoleRelease{handle, 0U});
  }
  void unregister_ant_hole(EntityHandle handle) {
    for (std::size_t index = 0; index < ant_hole_releases_.size(); ++index) {
      if (ant_hole_releases_[index].entity != handle) continue;
      ant_hole_releases_[index] = ant_hole_releases_.back();
      ant_hole_releases_.pop_back();
      return;
    }
  }
  [[nodiscard]] std::vector<AntHoleRelease>& ant_hole_releases() { return ant_hole_releases_; }
  [[nodiscard]] const std::vector<AntHoleRelease>& ant_hole_releases() const { return ant_hole_releases_; }

  /** Area-effect domain (original world+24780 vector and function 271). */
  std::shared_ptr<EffectPayload> replace_area_effect(EntityHandle owner, f32 scale,
                                                     std::shared_ptr<EffectPayload> payload);
  std::size_t update_area_effects();
  [[nodiscard]] std::vector<AreaEffect>& area_effects() { return area_effects_; }
  [[nodiscard]] const std::vector<AreaEffect>& area_effects() const { return area_effects_; }

  /** Deferred Peas launch queue (original world+1916 vector). */
  void schedule_deferred_launch(double due_ms, f32 phase, std::vector<EntityHandle> children) {
    DeferredLaunch launch;
    launch.due_ms = due_ms;
    launch.phase = phase;
    launch.children = std::move(children);
    launch.sequence = ++deferred_sequence_;
    deferred_launches_.push_back(std::move(launch));
  }
  std::size_t run_deferred_launches(double now_ms);
  [[nodiscard]] const std::vector<DeferredLaunch>& deferred_launches() const { return deferred_launches_; }
  /** Sequences processed by the last run_deferred_launches call, in order. */
  [[nodiscard]] const std::vector<std::uint64_t>& last_launch_order() const { return last_launch_order_; }

  /** R05 phase trace: the ordered system names executed by the last tick.
   * This is evidence for the phase-level comparison against spServerThink. */
  void record_phase(const char* phase) {
    PERF_PHASE(phase);
    phase_trace_.push_back(phase);
    phase_draws_.push_back(random_.draws());
  }
  void clear_phase_trace() { PERF_START(); phase_trace_.clear(); phase_draws_.clear(); }
  [[nodiscard]] const std::vector<const char*>& phase_trace() const { return phase_trace_; }
  /** Cumulative server-RNG draw count at each recorded phase (diagnostics). */
  [[nodiscard]] const std::vector<std::uint32_t>& phase_draws() const { return phase_draws_; }
  [[nodiscard]] std::uint32_t rng_draws() const { return random_.draws(); }

  [[nodiscard]] double time_ms() const { return time_ms_; }
  void set_time_ms(double value) { time_ms_ = value; }
  [[nodiscard]] f32 last_death_score() const { return last_death_score_; }
  [[nodiscard]] std::uint8_t last_death_level() const { return last_death_level_; }
  [[nodiscard]] const std::array<std::uint16_t, 10>& last_death_kept() const { return last_death_kept_; }
  [[nodiscard]] std::uint8_t last_death_kept_count() const { return last_death_kept_count_; }
  void set_last_death(f32 score, std::uint8_t level) {
    last_death_score_ = score;
    last_death_level_ = level;
  }
  void set_last_death_kept(std::span<const std::uint16_t> kept) {
    last_death_kept_.fill(0);
    last_death_kept_count_ = static_cast<std::uint8_t>(std::min(kept.size(), last_death_kept_.size()));
    std::copy_n(kept.begin(), last_death_kept_count_, last_death_kept_.begin());
  }
  void set_last_killer(EntityHandle handle, std::string name) {
    last_killer_ = handle;
    last_killer_name_ = std::move(name);
  }
  [[nodiscard]] EntityHandle last_killer() const { return last_killer_; }
  [[nodiscard]] const std::string& last_killer_name() const { return last_killer_name_; }

  void apply_input(std::uint32_t buttons, f32 angle, f32 strength) {
    input_.buttons = buttons;
    input_.angle = angle;
    input_.strength = f32(strength.value > 0.0F ? strength.value : 0.0F);
    input_.normalized_angle = f32(std::fmod(static_cast<double>(angle.value), kInputAngleModulus));
    input_.direction = pack_direction(input_.normalized_angle);
    if (Entity* player = entities_.get(player_); player != nullptr) {
      player->player_look = static_cast<std::uint8_t>(input_.direction);
      player->player_expression = static_cast<std::uint8_t>(
        (player->player_expression & 0xFCU) | (buttons & 3U));
    }
    // The original applies one control impulse per simulation tick in
    // applyPlayerControls, not once per received packet. The stored input is
    // consumed by engine::apply_player_controls from the tick.
  }
  [[nodiscard]] std::uint64_t tick() const { return tick_; }
  /** Number of `collision_bounds` cache misses since initialization. */
  [[nodiscard]] std::uint64_t bounds_rebuilds() const { return bounds_rebuilds_; }
  void note_bounds_rebuild() { ++bounds_rebuilds_; }
  /** Number of persistent contact-quadtree update passes. */
  [[nodiscard]] std::uint64_t quadtree_updates() const { return quadtree_updates_; }
  void note_quadtree_update() { ++quadtree_updates_; }
  void advance_tick(double delta_milliseconds = 50.0) {
    ++tick_;
    time_ms_ += delta_milliseconds;
  }
  [[nodiscard]] std::uint64_t identity() const { return identity_; }
  [[nodiscard]] bool initialized() const { return initialized_; }
  void set_initialized(bool value) { initialized_ = value; }

 private:
  static std::uint64_t next_identity() {
    static std::uint64_t next = 1;
    return next++;
  }
  EntityPool entities_;
  CollisionContext collision_;
  std::vector<EntityHandle> destroyed_;
  MinstdRng rng_;
  ServerRng random_{285456437U};
  ServerRng death_shuffle_{1U};
  PlayerInput input_;
  std::vector<PetalOrbitState> petals_;
  std::vector<HitEvent> hit_events_;
  std::vector<HitEvent> pending_hit_events_;
  std::set<std::uint32_t> known_entities_;
  std::vector<AreaEffect> area_effects_;
  std::vector<EntityHandle> area_alive_, area_candidates_, area_added_, area_removed_;
  std::vector<DeferredLaunch> deferred_launches_;
  std::uint64_t deferred_sequence_ = 0;
  std::vector<std::uint64_t> last_launch_order_;
  std::vector<const char*> phase_trace_;
  std::vector<std::uint32_t> phase_draws_;
  std::vector<EntityHandle> pickups_;
  std::vector<EntityHandle> ai_order_;
  std::vector<AntHoleRelease> ant_hole_releases_;
  std::deque<DeathRecord> deaths_;
  double time_ms_ = 0.0;
  f32 last_death_score_;
  std::uint8_t last_death_level_ = 0;
  std::array<std::uint16_t, 10> last_death_kept_{};
  std::uint8_t last_death_kept_count_ = 0;
  EntityHandle last_killer_{};
  std::string last_killer_name_;
  EntityHandle player_;
  std::string player_name_;
  f32 player_speed_;
  PlayerLoadout loadout_;
  PlayerProfile profile_;
  f32 width_ = f32(50000.0F);
  f32 height_ = f32(4000.0F);
  f32 zone_timer_ms_ = f32(0.0F);
  std::uint8_t zone_progress_ = 0;
  bool zone_disabled_ = false;
  bool compact_ = false;
  bool auto_populate_ = false;
  std::uint64_t tick_ = 0;
  std::uint64_t bounds_rebuilds_ = 0;
  std::uint64_t quadtree_updates_ = 0;
  std::uint64_t identity_ = next_identity();
  bool initialized_ = false;
};

} // namespace engine
