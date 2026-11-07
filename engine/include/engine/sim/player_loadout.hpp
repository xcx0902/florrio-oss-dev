#pragma once
#include "engine/catalog/loadout_rules.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/sim/petal_slot.hpp"
#include <array>
#include <cstdint>

namespace engine {

class World;
class PlayerState;

/** Sixteen-slot player loadout. The record owns the slot types with their
 * catalog instance counts and shared recharge windows, the three equipped
 * instance handles per slot with their pending flags and timers, the per-slot
 * replication epochs, the score and petal-ring phase, and the pickup-transfer
 * queue.
 *
 * The equipped handles in this class are the single authority for "which entity
 * occupies slot/instance"; slot records never keep a second copy. */
class PlayerLoadout {
 public:
  struct PickupTransfer {
    EntityHandle drop{};
    std::uint8_t slot = 0U;
  };
  static constexpr std::size_t kSlots = catalog::kInventorySlots;
  /** Slots that can hold an active, orbit-spawning petal. */
  static constexpr std::size_t kActiveSlots = catalog::kActiveSlots;
  static constexpr std::size_t kInstances = catalog::kInstancesPerSlot;
  static constexpr std::size_t kRechargeProgressSlots = kActiveSlots;

  bool equip(std::uint8_t slot, catalog::PetalId type_id);
  bool discard(std::uint8_t slot, catalog::PetalId expected_type);
  bool discard(PlayerProfile& profile, std::uint8_t slot, catalog::PetalId expected_type);
  /** Retire the equipped occupant before resetting the slot, including a
   * hatched Egg's mob handle. */
  bool discard(World& world, PlayerState& state, PlayerProfile& profile, std::uint8_t slot,
               catalog::PetalId expected_type);
  bool swap(std::uint8_t first, catalog::PetalId first_type, std::uint8_t second,
            catalog::PetalId second_type);
  bool swap(PlayerProfile& profile, std::uint8_t first, catalog::PetalId first_type,
            std::uint8_t second, catalog::PetalId second_type);
  bool swap(World& world, PlayerState& state, PlayerProfile& profile, std::uint8_t first,
            catalog::PetalId first_type, std::uint8_t second, catalog::PetalId second_type);
  /** Restore carried types, including reserve slots; only active slots spawn
   * equipped entities. Backpack contents stay in the profile. */
  void restore_from_profile(const PlayerProfile& profile);
  /** Change a slot type: retire its three equipped handles (damaging live
   * petals to zero), mark pending bytes and bump the replication epoch. */
  bool change_slot_type(World& world, PlayerState& state, PlayerProfile& profile, std::uint8_t slot,
                        catalog::PetalId type_id);
  /** Profile-only slot update used by reserve/backpack helpers. */
  bool set_slot_type(PlayerProfile& profile, std::uint8_t slot, catalog::PetalId type_id);
  /** Fill the reserve slots (active..capacity-1) with the rotating petal types
   * used by the inventory-cycle input. */
  bool cycle_reserve_slots(World& world, PlayerState& state, PlayerProfile& profile);
  /** Mark the loadout packet cache dirty after a type change and rebuild the
   * per-slot/instance cache order table. */
  void invalidate_packet_cache(World& world, PlayerState& state);
  /** Cache order assigned to one equipped instance (0 = not in the cache). */
  [[nodiscard]] std::uint8_t pending_cache(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? pending_cache_[slot][instance] : 0U;
  }
  [[nodiscard]] std::uint8_t pending_cache_count() const { return pending_cache_count_; }
  /** Active slot count used by the cache band check (5..8). */
  void set_active_slots(std::uint8_t value) { active_slots_ = value; }
  /** Create one equipped petal entity for a slot instance when the slot is
   * active and the catalog count allows it. */
  bool create_equipped_petal(World& world, PlayerState& state, std::uint8_t slot,
                             std::uint8_t instance);
  void advance(double delta_milliseconds);
  /** Minimum recharge progress over the slot's missing instances (65535 =
   * ready), latched before this tick's collisions. */
  void refresh_recharge_progress(const World& world, const PlayerState& state);
  [[nodiscard]] const std::array<std::uint16_t, 8>& recharge_progress() const {
    return recharge_progress_;
  }
  void record_pickup_transfer(EntityHandle drop, std::uint8_t slot) {
    pickup_transfers_.push_back({drop, slot});
  }
  [[nodiscard]] const std::vector<PickupTransfer>& pickup_transfers() const {
    return pickup_transfers_;
  }
  void clear_pickup_transfers() { pickup_transfers_.clear(); }
  void clear();

  [[nodiscard]] const std::array<PetalSlot, kSlots>& slots() const { return slots_; }
  [[nodiscard]] std::array<PetalSlot, kSlots>& slots() { return slots_; }
  [[nodiscard]] PetalSlot* slot(std::uint8_t index) {
    return index < kSlots ? &slots_[index] : nullptr;
  }

  /** The three equipped instance handles of one slot; invalid entries are empty. */
  [[nodiscard]] std::array<EntityHandle, kInstances> handles(std::uint8_t slot) const {
    return slot < kSlots ? handles_[slot] : std::array<EntityHandle, kInstances>{};
  }
  [[nodiscard]] EntityHandle handle(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? handles_[slot][instance] : EntityHandle{};
  }
  void set_handle(std::uint8_t slot, std::uint8_t instance, EntityHandle handle) {
    if (slot < kSlots && instance < kInstances) {
      handles_[slot][instance] = handle;
    }
  }
  void clear_handle(std::uint8_t slot, std::uint8_t instance) {
    if (slot < kSlots && instance < kInstances) {
      handles_[slot][instance] = EntityHandle{};
    }
  }
  /** Clear one equipped instance and start the slot's recharge window. */
  void retire_handle(std::uint8_t slot, std::uint8_t instance);
  [[nodiscard]] bool pending(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances && pending_[slot][instance] != 0U;
  }
  void set_pending(std::uint8_t slot, std::uint8_t instance, bool value) {
    if (slot < kSlots && instance < kInstances) {
      pending_[slot][instance] = value ? 1U : 0U;
    }
  }
  [[nodiscard]] std::uint32_t pending_timer(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? timers_[slot][instance] : 0U;
  }
  void set_pending_timer(std::uint8_t slot, std::uint8_t instance, std::uint32_t value) {
    if (slot < kSlots && instance < kInstances) {
      timers_[slot][instance] = value;
    }
  }
  [[nodiscard]] std::uint32_t replication_epoch() const { return replication_epoch_; }
  [[nodiscard]] std::uint32_t slot_epoch(std::uint8_t slot) const {
    return slot < kSlots ? slot_epoch_[slot] : 0U;
  }
  void bump_replication(std::uint32_t epoch) {
    replication_epoch_ = epoch;
    for (auto& value : slot_epoch_) {
      value = epoch;
    }
  }
  void bump_slot(std::uint8_t slot, std::uint32_t epoch) {
    if (slot < kSlots) {
      slot_epoch_[slot] = epoch;
    }
  }
  [[nodiscard]] f32 score() const { return score_; }
  void set_score(f32 value) { score_ = value; }
  /** Number of occupied orbit positions at the active-slot boundary, written
   * when the packet cache is rebuilt. */
  [[nodiscard]] std::uint8_t orbit_positions() const { return orbit_positions_; }
  void set_orbit_positions(std::uint8_t value) { orbit_positions_ = value; }
  /** Petal-ring phase. It advances once per tick by
   * 2.5 * dt * 0.001 rad (0.125 rad at 50 ms). */
  [[nodiscard]] f32 orbit_phase() const { return orbit_phase_; }
  void set_orbit_phase(f32 value) { orbit_phase_ = value; }
  void advance_orbit_phase(double step_milliseconds) {
    orbit_phase_ =
        f32::from_double(static_cast<double>(orbit_phase_.value) + 2.5 * step_milliseconds * 0.001);
  }
  [[nodiscard]] std::uint32_t packet_cache_epoch() const { return packet_cache_epoch_; }

 private:
  void reset_slot_state(std::uint8_t slot);
  void clear_handles(World* world, std::uint8_t slot);
  void refresh_pending_cache();

  std::array<PetalSlot, kSlots> slots_{};
  std::array<std::uint16_t, kRechargeProgressSlots> recharge_progress_{};
  std::vector<PickupTransfer> pickup_transfers_;
  std::array<std::array<EntityHandle, kInstances>, kSlots> handles_{};
  std::array<std::array<std::uint8_t, kInstances>, kSlots> pending_{};
  std::array<std::array<std::uint32_t, kInstances>, kSlots> timers_{};
  std::uint32_t replication_epoch_ = 0;
  std::array<std::uint32_t, kSlots> slot_epoch_{};
  std::uint32_t packet_cache_epoch_ = 0;
  std::array<std::array<std::uint8_t, kInstances>, kSlots> pending_cache_{};
  std::uint8_t pending_cache_count_ = 0;
  std::uint8_t active_slots_ = static_cast<std::uint8_t>(kActiveSlots);
  std::uint8_t orbit_positions_ = 0;
  f32 score_;
  f32 orbit_phase_ = f32(0.0F);
};

}  // namespace engine
