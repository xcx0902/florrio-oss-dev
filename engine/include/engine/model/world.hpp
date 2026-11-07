#pragma once
#include "engine/core/perf.hpp"
#include "engine/core/rng.hpp"
#include "engine/model/entity_pool.hpp"
#include "engine/model/world_records.hpp"
#include "engine/sim/collision_context.hpp"
#include "engine/model/effect_payload.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/petal_state.hpp"
#include "engine/model/player_registry.hpp"
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
#include <span>
#include <vector>

namespace engine {

inline constexpr std::uint32_t kInvalidEntity = std::numeric_limits<std::uint32_t>::max();

/** Server-side world skeleton. Simulation domains are filled in by
 * engine/src/sim/; this header declares typed state and accessors only. */
class World {
 public:
  World() = default;

  void reset();

  /** Initialize all 16,384 entity slots: every index gets a nonzero generation
   * from the 64-bit LCG, rejecting generation & 262143 == 0. */
  void initialize(std::uint64_t handle_seed = 0);

  [[nodiscard]] CollisionContext& collision() { return collision_; }
  [[nodiscard]] const std::vector<EntityHandle>& destroyed() const { return destroyed_; }
  void clear_destroyed() { destroyed_.clear(); }
  [[nodiscard]] EntityPool& entities() { return entities_; }
  [[nodiscard]] const EntityPool& entities() const { return entities_; }
  [[nodiscard]] MinstdRng& rng() { return rng_; }
  [[nodiscard]] const MinstdRng& rng() const { return rng_; }
  [[nodiscard]] ServerRng& random() { return random_; }
  [[nodiscard]] const ServerRng& random() const { return random_; }
  /** The death shuffle keeps its own random stream, separate from the world
   * RNG. The seed is the supplied entropy modulo INT_MAX, with zero coerced to
   * one; the default seed of 1 keeps runs deterministic. */
  void seed_death_shuffle(std::uint32_t entropy) { death_shuffle_.seed(entropy % 2147483647U); }
  [[nodiscard]] ServerRng& death_shuffle_random() { return death_shuffle_; }
  [[nodiscard]] PlayerRegistry& players() { return players_; }
  [[nodiscard]] const PlayerRegistry& players() const { return players_; }
  /** Adopt latest input for this identity/life, without simulating movement. */
  bool apply_input(PlayerId id, LifeEpoch life, std::uint32_t buttons, f32 angle, f32 strength,
                   std::uint64_t ttl_ticks = kInputTtlTicks);
  [[nodiscard]] f32 width() const { return width_; }
  [[nodiscard]] f32 height() const { return height_; }
  void set_dimensions(f32 width, f32 height) {
    width_ = width;
    height_ = height;
  }
  [[nodiscard]] bool compact() const { return compact_; }
  void set_compact(bool compact) { compact_ = compact; }
  [[nodiscard]] bool auto_populate() const { return auto_populate_; }
  void set_auto_populate(bool value) { auto_populate_ = value; }

  /** Diagnostics: the most recent destruction records (kind/type/position).
   * Read by native tests to explain count divergence. */
  struct DeathRecord {
    std::uint64_t tick = 0;
    catalog::SpeciesId species_id = catalog::SpeciesId::kNone;
    catalog::PetalId petal_id = catalog::PetalId::kNone;
    catalog::SpeciesId attacker_species = catalog::SpeciesId::kNone;
    catalog::PetalId attacker_petal = catalog::PetalId::kNone;
    EntityKind kind = EntityKind::kNone;
    EntityKind attacker_kind = EntityKind::kNone;
    float x = 0.0F;
    float y = 0.0F;
  };
  void record_death(const Entity& entity, const DamageSource& attacker) {
    deaths_.push_back(DeathRecord{tick_, entity.species_id, entity.petal_id, attacker.species_id,
                                  attacker.petal_id, entity.kind, attacker.kind,
                                  entity.position.x.value, entity.position.y.value});
    if (deaths_.size() > 128U) {
      deaths_.pop_front();
    }
  }
  [[nodiscard]] const std::deque<DeathRecord>& deaths() const { return deaths_; }

  /** Detach constraint links at health death, independently of ordinary
   * ownership. The dead handle and any segment that names it as predecessor
   * lose that link, so a surviving next segment becomes a root even after a
   * middle death. */
  void detach_linked_entities(EntityHandle handle);

  [[nodiscard]] bool destroy(EntityHandle handle);

  /** Simulation records hits independently of any observer's visibility. */
  void record_hit(EntityHandle target, EntityHandle attacker, f32 amount, f32 health_after,
                  const DamageSource* source = nullptr);
  [[nodiscard]] const std::vector<HitEvent>& hit_events() const { return hit_events_; }
  void clear_hit_events() { hit_events_.clear(); }

  /** Intrusive pickup registry; `pickup_prev`/`pickup_next` link live pickups. */
  void register_pickup(EntityHandle handle) {
    Entity* entity = entities_.get(handle);
    if (entity == nullptr || entity->pickup_listed) {
      return;
    }
    entity->pickup_listed = true;
    entity->pickup_prev = pickups_.empty() ? EntityHandle{} : pickups_.back();
    entity->pickup_next = EntityHandle{};
    if (!pickups_.empty()) {
      if (Entity* previous = entities_.get(pickups_.back())) {
        previous->pickup_next = handle;
      }
    }
    pickups_.push_back(handle);
  }
  void unregister_pickup(EntityHandle handle) {
    Entity* entity = entities_.get(handle);
    if (entity == nullptr || !entity->pickup_listed) {
      return;
    }
    if (Entity* previous = entities_.get(entity->pickup_prev)) {
      previous->pickup_next = entity->pickup_next;
    }
    if (Entity* next = entities_.get(entity->pickup_next)) {
      next->pickup_prev = entity->pickup_prev;
    }
    const auto found = std::find(pickups_.begin(), pickups_.end(), handle);
    if (found != pickups_.end()) {
      pickups_.erase(found);
    }
    entity->pickup_listed = false;
    entity->pickup_prev = EntityHandle{};
    entity->pickup_next = EntityHandle{};
  }
  [[nodiscard]] const std::vector<EntityHandle>& pickups() const { return pickups_; }

  /** AI component registry: append on creation, swap with the tail on removal.
   * Its order determines RNG assignment when several wandering timers fire in
   * one tick. */
  void register_ai(EntityHandle handle) {
    if (!handle.valid()) {
      return;
    }
    if (std::find(ai_order_.begin(), ai_order_.end(), handle) != ai_order_.end()) {
      return;
    }
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

  /** Ant-hole release registry: append on species initialization, swap with
   * the tail on destruction. Registration order determines RNG assignment when
   * several holes cross a threshold in the same tick. */
  void register_ant_hole(EntityHandle handle) {
    if (!handle.valid()) {
      return;
    }
    for (const auto& entry : ant_hole_releases_) {
      if (entry.entity == handle) {
        return;
      }
    }
    ant_hole_releases_.push_back(AntHoleRelease{handle, 0U});
  }
  void unregister_ant_hole(EntityHandle handle) {
    for (std::size_t index = 0; index < ant_hole_releases_.size(); ++index) {
      if (ant_hole_releases_[index].entity != handle) {
        continue;
      }
      ant_hole_releases_[index] = ant_hole_releases_.back();
      ant_hole_releases_.pop_back();
      return;
    }
  }
  [[nodiscard]] std::vector<AntHoleRelease>& ant_hole_releases() { return ant_hole_releases_; }
  [[nodiscard]] const std::vector<AntHoleRelease>& ant_hole_releases() const {
    return ant_hole_releases_;
  }

  /** Area-effect domain: one payload per effect owner, refreshed each tick. */
  std::shared_ptr<EffectPayload> replace_area_effect(EntityHandle owner, f32 scale,
                                                     std::shared_ptr<EffectPayload> payload);
  std::size_t update_area_effects();
  [[nodiscard]] std::vector<AreaEffect>& area_effects() { return area_effects_; }
  [[nodiscard]] const std::vector<AreaEffect>& area_effects() const { return area_effects_; }
  [[nodiscard]] std::uint32_t allocate_effect_id() { return next_effect_id_++; }

  /** Deferred Peas launch queue, dispatched in due-time order. */
  void schedule_deferred_launch(double due_ms, f32 phase, std::vector<EntityHandle> children) {
    DeferredLaunch launch;
    launch.due_ms = due_ms;
    launch.phase = phase;
    launch.children = std::move(children);
    launch.sequence = ++deferred_sequence_;
    deferred_launches_.push_back(std::move(launch));
  }
  std::size_t run_deferred_launches(double now_ms);
  [[nodiscard]] const std::vector<DeferredLaunch>& deferred_launches() const {
    return deferred_launches_;
  }
  /** Sequences processed by the last run_deferred_launches call, in order. */
  [[nodiscard]] const std::vector<std::uint64_t>& last_launch_order() const {
    return last_launch_order_;
  }

  /** Phase trace: the ordered system names executed by the last tick. */
  void record_phase(const char* phase) {
    PERF_PHASE(phase);
    phase_trace_.push_back(phase);
    phase_draws_.push_back(random_.draws());
  }
  void clear_phase_trace() {
    PERF_START();
    phase_trace_.clear();
    phase_draws_.clear();
  }
  [[nodiscard]] const std::vector<const char*>& phase_trace() const { return phase_trace_; }
  /** Cumulative server-RNG draw count at each recorded phase (diagnostics). */
  [[nodiscard]] const std::vector<std::uint32_t>& phase_draws() const { return phase_draws_; }
  [[nodiscard]] std::uint32_t rng_draws() const { return random_.draws(); }

  [[nodiscard]] double time_ms() const { return time_ms_; }
  void set_time_ms(double value) { time_ms_ = value; }
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
  PlayerRegistry players_;
  std::vector<HitEvent> hit_events_;
  std::vector<AreaEffect> area_effects_;
  std::uint32_t next_effect_id_ = 1;
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
  f32 width_ = f32(50000.0F);
  f32 height_ = f32(4000.0F);
  bool compact_ = false;
  bool auto_populate_ = false;
  std::uint64_t tick_ = 0;
  std::uint64_t bounds_rebuilds_ = 0;
  std::uint64_t quadtree_updates_ = 0;
  std::uint64_t identity_ = next_identity();
  bool initialized_ = false;
};

}  // namespace engine
