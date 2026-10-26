#pragma once
#include "engine/model/entity.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/sim/petal_slot.hpp"
#include <array>
#include <cstdint>

namespace engine {

class World;

/** Sixteen-slot player loadout with the recovered original layout:
 *
 *   types          loadout + 20 + slot              (u8)
 *   handles        loadout + 296 + slot*36 + inst*12 (EntityHandle)
 *   pending        loadout + 584 + slot*3 + inst      (u8)
 *   pending timers loadout + 608 + slot*12 + inst*4   (u32 ms)
 *   level mirror   loadout + 148                     (u8)
 *   replication    loadout + 172 and + (slot+9)*4    (u32 epoch)
 *   score          loadout + 16                      (f32)
 *   backpack count loadout + 704                     (u8)
 *
 * The domain keeps the same information without exposing byte offsets. */
class PlayerLoadout {
 public:
  struct PickupTransfer { EntityHandle drop{}; std::uint8_t slot = 0U; };
  static constexpr std::size_t kSlots = 16;
  static constexpr std::size_t kInstances = 3;

  bool equip(std::uint8_t slot, std::uint16_t type_id);
  bool discard(std::uint8_t slot, std::uint16_t expected_type);
  bool discard(PlayerProfile& profile, std::uint8_t slot, std::uint16_t expected_type);
  bool swap(std::uint8_t first, std::uint16_t first_type,
            std::uint8_t second, std::uint16_t second_type);
  bool swap(PlayerProfile& profile, std::uint8_t first, std::uint16_t first_type,
            std::uint8_t second, std::uint16_t second_type);
  bool swap(World& world, PlayerProfile& profile, std::uint8_t first,
            std::uint16_t first_type, std::uint8_t second, std::uint16_t second_type);
  /** Restore carried types, including reserve slots; only active slots spawn
   * equipped entities. Backpack contents stay in the profile. */
  void restore_from_profile(const PlayerProfile& profile);
  /** Domain form of original 125: change a slot type, clear its three equipped
   * handles (damaging live petals to zero), mark pending bytes and bump the
   * replication epoch. */
  bool change_slot_type(World& world, PlayerProfile& profile, std::uint8_t slot,
                        std::uint16_t type_id);
  /** Legacy domain helper kept for callers that only need the profile update. */
  bool set_slot_type(PlayerProfile& profile, std::uint8_t slot, std::uint16_t type_id);
  /** Original cycleInventory: fill the reserve slots (active..capacity-1) with
   * the rotating petal types used by the inventory-cycle input. */
  bool cycle_reserve_slots(World& world, PlayerProfile& profile);
  /** Original function 85: mark the loadout packet cache dirty after a type
   * change and rebuild the per-slot/instance cache order table. */
  void invalidate_packet_cache(World& world);
  /** Cache order assigned to one equipped instance (0 = not in the cache).
   * The original writes this byte into the handle record at +18. */
  [[nodiscard]] std::uint8_t pending_cache(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? pending_cache_[slot][instance] : 0U;
  }
  [[nodiscard]] std::uint8_t pending_cache_count() const { return pending_cache_count_; }
  /** Active slot count used by the original function-85 band check (5..8). */
  void set_active_slots(std::uint8_t value) { active_slots_ = value; }
  /** Domain form of original 397: create one equipped petal entity for a slot
   * instance when the slot is active and the catalog count allows it. */
  bool create_equipped_petal(World& world, std::uint8_t slot, std::uint8_t instance);
  void advance(double delta_milliseconds);
  /** Original updateEquippedPetals loadout+100: minimum progress over missing
   * instances (65535 = ready), latched before this tick's collisions. */
  void refresh_recharge_progress(const World& world);
  [[nodiscard]] const std::array<std::uint16_t, 8>& recharge_progress() const {
    return recharge_progress_;
  }
  void record_pickup_transfer(EntityHandle drop, std::uint8_t slot) {
    pickup_transfers_.push_back({drop, slot});
  }
  [[nodiscard]] const std::vector<PickupTransfer>& pickup_transfers() const { return pickup_transfers_; }
  void clear_pickup_transfers() { pickup_transfers_.clear(); }
  void clear();

  [[nodiscard]] const std::array<PetalSlot, kSlots>& slots() const { return slots_; }
  [[nodiscard]] std::array<PetalSlot, kSlots>& slots() { return slots_; }
  [[nodiscard]] PetalSlot* slot(std::uint8_t index) {
    return index < kSlots ? &slots_[index] : nullptr;
  }

  [[nodiscard]] EntityHandle handle(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? handles_[slot][instance] : EntityHandle{};
  }
  void set_handle(std::uint8_t slot, std::uint8_t instance, EntityHandle handle) {
    if (slot < kSlots && instance < kInstances) handles_[slot][instance] = handle;
  }
  void clear_handle(std::uint8_t slot, std::uint8_t instance) {
    if (slot < kSlots && instance < kInstances) handles_[slot][instance] = EntityHandle{};
  }
  [[nodiscard]] bool pending(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances && pending_[slot][instance] != 0U;
  }
  void set_pending(std::uint8_t slot, std::uint8_t instance, bool value) {
    if (slot < kSlots && instance < kInstances) pending_[slot][instance] = value ? 1U : 0U;
  }
  [[nodiscard]] std::uint32_t pending_timer(std::uint8_t slot, std::uint8_t instance) const {
    return slot < kSlots && instance < kInstances ? timers_[slot][instance] : 0U;
  }
  void set_pending_timer(std::uint8_t slot, std::uint8_t instance, std::uint32_t value) {
    if (slot < kSlots && instance < kInstances) timers_[slot][instance] = value;
  }
  [[nodiscard]] std::uint32_t replication_epoch() const { return replication_epoch_; }
  [[nodiscard]] std::uint32_t slot_epoch(std::uint8_t slot) const {
    return slot < kSlots ? slot_epoch_[slot] : 0U;
  }
  void bump_replication(std::uint32_t epoch) {
    replication_epoch_ = epoch;
    for (auto& value : slot_epoch_) value = epoch;
  }
  void bump_slot(std::uint8_t slot, std::uint32_t epoch) {
    if (slot < kSlots) slot_epoch_[slot] = epoch;
  }
  [[nodiscard]] f32 score() const { return score_; }
  void set_score(f32 value) { score_ = value; }
  /** Original updateEquippedPetals keeps the petal-ring phase at loadout +284.
   * It advances once per tick: (entry*0.8 + 2.5) * amount * scale * dt * 0.001.
   * `amount` and every scale multiplier are 1 for the recovered default
   * loadout, so the shipped increment is 2.5 * dt * 0.001 (0.125 rad at 50 ms).
   */
  [[nodiscard]] f32 orbit_phase() const { return orbit_phase_; }
  void set_orbit_phase(f32 value) { orbit_phase_ = value; }
  void advance_orbit_phase(double step_milliseconds) {
    orbit_phase_ = f32::from_double(static_cast<double>(orbit_phase_.value)
                                    + 2.5 * step_milliseconds * 0.001);
  }
  [[nodiscard]] std::uint32_t packet_cache_epoch() const { return packet_cache_epoch_; }

 private:
  void reset_slot_state(std::uint8_t slot);
  void clear_handles(World* world, std::uint8_t slot);
  void refresh_pending_cache();

  std::array<PetalSlot, kSlots> slots_{};
  std::array<std::uint16_t, 8> recharge_progress_{};
  std::vector<PickupTransfer> pickup_transfers_;
  std::array<std::array<EntityHandle, kInstances>, kSlots> handles_{};
  std::array<std::array<std::uint8_t, kInstances>, kSlots> pending_{};
  std::array<std::array<std::uint32_t, kInstances>, kSlots> timers_{};
  std::uint32_t replication_epoch_ = 0;
  std::array<std::uint32_t, kSlots> slot_epoch_{};
  std::uint32_t packet_cache_epoch_ = 0;
  std::array<std::array<std::uint8_t, kInstances>, kSlots> pending_cache_{};
  std::uint8_t pending_cache_count_ = 0;
  std::uint8_t active_slots_ = 8;
  f32 score_;
  /** Petal-ring phase (loadout +284): advances once per server tick. */
  f32 orbit_phase_ = f32(0.0F);
};

} // namespace engine
