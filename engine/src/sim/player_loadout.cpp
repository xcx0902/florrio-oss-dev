#include "engine/sim/player_loadout.hpp"
#include "engine/model/catalog.hpp"
#include "engine/model/world.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/progression.hpp"
#include <algorithm>
#include <cmath>

namespace engine {

namespace {

std::uint8_t active_slot_count(const PlayerProfile& profile) {
  return profile.active_slots();
}

} // namespace

void PlayerLoadout::reset_slot_state(std::uint8_t slot) {
  if (slot >= kSlots) return;
  slots_[slot] = PetalSlot{};
  handles_[slot].fill(EntityHandle{});
  pending_[slot].fill(0U);
  timers_[slot].fill(0U);
}

void PlayerLoadout::refresh_pending_cache() {
  pending_cache_count_ = 0;
  std::uint8_t order = 0;
  for (std::uint8_t slot = 0; slot < 8U; ++slot) {
    pending_cache_[slot].fill(0U);
    const std::uint16_t type = slots_[slot].type_id;
    if (type == 0U || type > 38U) {
      if (slot + 1U == active_slots_) pending_cache_count_ = order;
      continue;
    }
    const auto* petal = Catalog::instance().petal(type);
    if (petal == nullptr || petal->flag40 != 0U) {
      if (slot + 1U == active_slots_) pending_cache_count_ = order;
      continue;
    }
    const std::uint8_t instances = static_cast<std::uint8_t>(
      std::min<std::uint32_t>(petal->instancesPerSlot, kInstances));
    if (petal->flag41 != 0U) {
      // Original function 85's special branch: every live instance shares the
      // same cache index; the index advances once for the whole slot.
      std::uint8_t carry = 0;
      if (handles_[slot][0].valid()) {
        pending_cache_[slot][0] = order;
        carry = 1U;
      } else {
        carry = instances != 0U ? 1U : 0U;
      }
      if (handles_[slot][1].valid()) {
        pending_cache_[slot][1] = order;
        carry = 1U;
      } else {
        carry = static_cast<std::uint8_t>((instances > 1U ? 1U : 0U) | carry);
      }
      if (handles_[slot][2].valid()) {
        pending_cache_[slot][2] = order;
        ++order;
      } else {
        carry = static_cast<std::uint8_t>((instances > 2U ? 1U : 0U) | carry);
        order = static_cast<std::uint8_t>(order + carry);
      }
    } else {
      // Normal branch: one cache index per live or catalog-declared instance.
      for (std::uint8_t instance = 0; instance < kInstances; ++instance) {
        if (handles_[slot][instance].valid() || instance < instances)
          pending_cache_[slot][instance] = order++;
      }
    }
    if (slot + 1U == active_slots_) pending_cache_count_ = order;
  }
  if (active_slots_ > 8U) pending_cache_count_ = order;
}

void PlayerLoadout::clear_handles(World* world, std::uint8_t slot) {
  if (slot >= kSlots) return;
  for (std::uint8_t instance = 0; instance < kInstances; ++instance) {
    const EntityHandle handle = handles_[slot][instance];
    if (!handle.valid()) continue;
    if (world != nullptr) {
      Entity* entity = world->entities().get(handle);
      if (entity != nullptr && entity->health.value > 0.0F)
        (void)damage_entity(*world, handle, entity->health, EntityHandle{});
      else if (entity != nullptr)
        (void)world->destroy(handle);
    }
    handles_[slot][instance] = EntityHandle{};
  }
  slots_[slot].instances.fill(EntityHandle{});
}

bool PlayerLoadout::equip(std::uint8_t slot, std::uint16_t type_id) {
  if (slot >= kSlots) return false;
  PetalSlot value = make_petal_slot(type_id);
  if (value.count == 0) return false;
  reset_slot_state(slot);
  slots_[slot] = value;
  ++replication_epoch_;
  slot_epoch_[slot] = replication_epoch_;
  refresh_pending_cache();
  return true;
}

bool PlayerLoadout::discard(std::uint8_t slot, std::uint16_t expected_type) {
  if (slot >= kSlots) return false;
  PetalSlot& value = slots_[slot];
  if (value.count == 0 || value.type_id != expected_type) return false;
  reset_slot_state(slot);
  ++replication_epoch_;
  slot_epoch_[slot] = replication_epoch_;
  refresh_pending_cache();
  return true;
}

bool PlayerLoadout::discard(PlayerProfile& profile, std::uint8_t slot,
                            std::uint16_t expected_type) {
  if (slot >= profile.inventory_size()) return false;
  PetalSlot& value = slots_[slot];
  if (value.count == 0 || value.type_id != expected_type) return false;
  const auto* petal = Catalog::instance().petal(value.type_id);
  if (petal == nullptr) return false;
  if (value.type_id != 1U) profile.add_experience(rarity_experience(petal->rarityIndex));
  profile.push_backpack(value.type_id);
  profile.set_inventory(slot, 0);
  reset_slot_state(slot);
  ++replication_epoch_;
  slot_epoch_[slot] = replication_epoch_;
  return true;
}

bool PlayerLoadout::discard(World& world, PlayerProfile& profile, std::uint8_t slot,
                            std::uint16_t expected_type) {
  if (slot >= kSlots || slot >= profile.inventory_size()) return false;
  const auto& value = slots_[slot];
  if (value.count == 0U || value.type_id != expected_type
      || Catalog::instance().petal(value.type_id) == nullptr) return false;
  // Original opcode8 ends in 125: damage the occupant while its equipped
  // handle is still reachable, then clear the slot. A hatched pet has no
  // orbit record, so remove_slot_petals cannot retire it after this reset.
  clear_handles(&world, slot);
  const bool discarded = discard(profile, slot, expected_type);
  if (discarded) invalidate_packet_cache(world);
  return discarded;
}

bool PlayerLoadout::swap(std::uint8_t first, std::uint16_t first_type,
                         std::uint8_t second, std::uint16_t second_type) {
  if (first >= kSlots || second >= kSlots) return false;
  if (slots_[first].type_id != first_type || slots_[second].type_id != second_type) return false;
  std::swap(slots_[first], slots_[second]);
  std::swap(handles_[first], handles_[second]);
  std::swap(pending_[first], pending_[second]);
  std::swap(timers_[first], timers_[second]);
  ++replication_epoch_;
  slot_epoch_[first] = replication_epoch_;
  slot_epoch_[second] = replication_epoch_;
  refresh_pending_cache();
  return true;
}

bool PlayerLoadout::swap(PlayerProfile& profile, std::uint8_t first, std::uint16_t first_type,
                         std::uint8_t second, std::uint16_t second_type) {
  if (first >= profile.inventory_size() || second >= profile.inventory_size()) return false;
  if (!swap(first, first_type, second, second_type)) return false;
  profile.set_inventory(first, second_type);
  profile.set_inventory(second, first_type);
  return true;
}

bool PlayerLoadout::swap(World& world, PlayerProfile& profile, std::uint8_t first,
                         std::uint16_t first_type, std::uint8_t second,
                         std::uint16_t second_type) {
  if (first == second) return false;
  if (first >= profile.inventory_size() || second >= profile.inventory_size()) return false;
  if (slots_[first].type_id != first_type || slots_[second].type_id != second_type) return false;
  // Original input.mjs swapInventory performs two independent
  // changeSlotType calls (second <- first value, then first <- second value).
  // Both sides therefore retire their current children and re-enter the
  // catalog recharge/pending state; states are never exchanged in place.
  const std::uint16_t first_value = slots_[first].type_id;
  const std::uint16_t second_value = slots_[second].type_id;
  bool changed = false;
  if (second_value != first_value)
    changed = change_slot_type(world, profile, second, first_value) || changed;
  if (first_value != second_value)
    changed = change_slot_type(world, profile, first, second_value) || changed;
  return changed;
}

void PlayerLoadout::restore_from_profile(const PlayerProfile& profile) {
  clear();
  const std::uint8_t capacity = profile.inventory_size();
  const std::uint8_t limit = std::min<std::size_t>(capacity, kSlots);
  for (std::uint8_t slot = 0; slot < limit; ++slot) {
    const std::uint16_t type = profile.inventory(slot);
    if (type != 0U) (void)equip(slot, type);
  }
}

bool PlayerLoadout::change_slot_type(World& world, PlayerProfile& profile, std::uint8_t slot,
                                     std::uint16_t type_id) {
  if (slot >= kSlots) return false;
  if (slots_[slot].type_id == type_id && slots_[slot].count != 0) return false;
  if (slot <= 7U) {
    clear_handles(&world, slot);
    for (std::uint8_t instance = 0; instance < kInstances; ++instance) {
      pending_[slot][instance] = 1U;
      timers_[slot][instance] = 0U;
    }
  }
  if (type_id == 0U) {
    reset_slot_state(slot);
    profile.set_inventory(slot, 0);
  } else {
    PetalSlot value = make_petal_slot(type_id);
    if (value.count == 0) return false;
    slots_[slot] = value;
    handles_[slot].fill(EntityHandle{});
    profile.set_inventory(slot, type_id);
    // Every newly equipped type re-enters the full recharge window (at least
    // 2.5 s for short-recharge petals). The next spawn pass skips pending
    // slots, so a swapped-in petal cannot appear immediately and a swapped
    // petal cannot keep its old orbit/handle.
    if (slot <= 7U) {
      const auto* combat = Catalog::instance().petal_combat(type_id);
      const std::uint32_t duration = static_cast<std::uint32_t>(
        std::max(2500.0F, combat == nullptr ? 0.0F : combat->rechargeMilliseconds));
      for (std::uint8_t instance = 0; instance < kInstances; ++instance)
        timers_[slot][instance] = duration;
    }
  }
  const std::uint32_t epoch = std::max(
    static_cast<std::uint32_t>(world.tick() + 1U), replication_epoch_ + 1U);
  replication_epoch_ = epoch;
  slot_epoch_[slot] = epoch;
  invalidate_packet_cache(world);
  return true;
}

bool PlayerLoadout::cycle_reserve_slots(World& world, PlayerProfile& profile) {
  const std::uint8_t active = profile.active_slots();
  const std::uint16_t first_type = slots_[0].type_id;
  (void)change_slot_type(world, profile, active, first_type);
  std::uint8_t previous = active;
  for (;;) {
    const std::uint8_t level_active = profile.active_slots();
    const std::uint8_t slot = static_cast<std::uint8_t>(previous + 1U);
    const std::uint8_t total = profile.inventory_size();
    if (slot >= total) break;
    const std::uint16_t existing = previous <= 14U ? slots_[slot].type_id : 0U;
    const std::uint32_t petal = existing != 0U
      ? static_cast<std::uint32_t>(total - level_active - 1 + existing)
      : static_cast<std::uint32_t>(slot - level_active);
    (void)change_slot_type(world, profile, slot,
                           static_cast<std::uint16_t>(petal % 39U));
    previous = slot;
  }
  return true;
}

void PlayerLoadout::invalidate_packet_cache(World& world) {
  const std::uint32_t epoch = std::max(
    static_cast<std::uint32_t>(world.tick() + 1U), replication_epoch_ + 1U);
  packet_cache_epoch_ = epoch;
  active_slots_ = world.profile().active_slots();
  Entity* player = world.entities().get(world.player());
  if (player != nullptr) {
    player->packet_epoch_a = epoch;
    player->packet_epoch_b = epoch;
  }
  for (std::uint8_t slot = 0; slot < kSlots; ++slot) {
    if (slots_[slot].count != 0U) slot_epoch_[slot] = epoch;
  }
  refresh_pending_cache();
}

bool PlayerLoadout::set_slot_type(PlayerProfile& profile, std::uint8_t slot,
                                  std::uint16_t type_id) {
  if (slot >= profile.inventory_size() || slot >= kSlots) return false;
  if (slots_[slot].type_id == type_id && slots_[slot].count != 0) return false;
  if (type_id == 0U) {
    reset_slot_state(slot);
    profile.set_inventory(slot, 0);
    return true;
  }
  PetalSlot value = make_petal_slot(type_id);
  if (value.count == 0) return false;
  reset_slot_state(slot);
  slots_[slot] = value;
  profile.set_inventory(slot, type_id);
  return true;
}

bool PlayerLoadout::create_equipped_petal(World& world, std::uint8_t slot,
                                          std::uint8_t instance) {
  if (slot > 7U || instance >= kInstances) return false;
  if (handles_[slot][instance].valid()) return false;
  const std::uint16_t type = slots_[slot].type_id;
  if (type == 0U) return false;
  const std::uint8_t active = active_slot_count(world.profile());
  if (slot >= active) return false;
  const auto* combat = Catalog::instance().petal_combat(type);
  if (combat == nullptr || combat->drawRadius <= 0.0F) return false;
  const std::uint8_t count = slots_[slot].count == 0U ? 1U : slots_[slot].count;
  if (instance >= count) return false;
  Entity* owner = world.entities().get(world.player());
  if (owner == nullptr) return false;
  const std::uint8_t orbit_index = petal_orbit_index(world, slot, instance);
  const double angle = petal_orbit_angle(world, orbit_index);
  const EntityHandle handle = spawn_petal(world, type, owner->position, f32(65.0F),
                                          f32::from_double(angle), slot, instance, count,
                                          orbit_index);
  if (!handle.valid()) return false;
  if (Entity* entity = world.entities().get(handle)) entity->owner = world.player().raw;
  attach_child(world, world.player(), handle);
  handles_[slot][instance] = handle;
  slots_[slot].instances[instance] = handle;
  pending_[slot][instance] = 0U;
  timers_[slot][instance] = 0U;
  const std::uint32_t epoch = std::max(
    static_cast<std::uint32_t>(world.tick() + 1U), replication_epoch_ + 1U);
  replication_epoch_ = epoch;
  slot_epoch_[slot] = epoch;
  invalidate_packet_cache(world);
  return true;
}

void PlayerLoadout::advance(double delta_milliseconds) {
  for (auto& slot : slots_) slot.advance(delta_milliseconds);
  for (std::uint8_t slot = 0; slot < kSlots; ++slot) {
    for (std::uint8_t instance = 0; instance < kInstances; ++instance) {
      if (timers_[slot][instance] == 0U) continue;
      const double remaining = static_cast<double>(timers_[slot][instance]) - delta_milliseconds;
      timers_[slot][instance] = remaining > 0.0 ? static_cast<std::uint32_t>(remaining) : 0U;
      if (timers_[slot][instance] == 0U) pending_[slot][instance] = 0U;
    }
  }
}

void PlayerLoadout::refresh_recharge_progress(const World& world) {
  const Entity* player = world.entities().get(world.player());
  if (player == nullptr || player->health.value <= 0.0F) return;
  recharge_progress_.fill(65535U);
  for (std::uint8_t slot = 0; slot < std::min<std::uint8_t>(world.profile().active_slots(), 8U); ++slot) {
    const auto* combat = Catalog::instance().petal_combat(slots_[slot].type_id);
    const auto* definition = Catalog::instance().petal(slots_[slot].type_id);
    if (slots_[slot].type_id == 0U || combat == nullptr || definition == nullptr) continue;
    for (std::uint8_t instance = 0; instance < std::min<std::uint32_t>(combat->instancesPerSlot, kInstances); ++instance) {
      const Entity* petal = world.entities().get(handles_[slot][instance]);
      if (petal != nullptr && petal->health.value > 0.0F) continue;
      if (definition->flag40 != 0U) continue;
      // Original 654 advances the elapsed timer but publishes zero for an
      // equipped slot whose zone restriction currently blocks spawning.
      if (world.zone_petals_disabled()) {
        recharge_progress_[slot] = 0U;
        continue;
      }
      const float duration = pending_[slot][instance] != 0U
        ? std::max(2500.0F, combat->rechargeMilliseconds) : combat->rechargeMilliseconds;
      const float remaining = pending_[slot][instance] != 0U
        ? static_cast<float>(timers_[slot][instance])
        : static_cast<float>(slots_[slot].recharge_remaining_ms);
      const float elapsed = std::clamp(duration - remaining, 0.0F, duration);
      const float progress = duration > 0.0F ? (elapsed * 65535.0F) / duration : 65535.0F;
      recharge_progress_[slot] = std::min(recharge_progress_[slot],
        static_cast<std::uint16_t>(std::clamp(progress, 0.0F, 65535.0F)));
    }
  }
}

void PlayerLoadout::clear() {
  for (std::uint8_t slot = 0; slot < kSlots; ++slot) reset_slot_state(slot);
  replication_epoch_ = 0;
  slot_epoch_.fill(0U);
  recharge_progress_.fill(0U);
  pickup_transfers_.clear();
  pending_cache_ = {};
  pending_cache_count_ = 0;
  score_ = f32(0.0F);
  orbit_phase_ = f32(0.0F);
  orbit_positions_ = 0U;
}

} // namespace engine
