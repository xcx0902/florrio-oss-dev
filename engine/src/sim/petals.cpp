#include "engine/sim/petals.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/petal_orbit.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/pets.hpp"
#include "pickups.hpp"
#include <algorithm>
#include <cmath>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;
constexpr std::uint8_t kRoseHealSteps = 10;

std::uint8_t active_slot_count(const PlayerState& state) {
  return state.profile().active_slots();
}

}  // namespace

std::uint8_t petal_orbit_index(const PlayerState& state, std::uint8_t slot, std::uint8_t instance) {
  std::uint8_t orbit_index = 0;
  const auto& slots = state.loadout().slots();
  for (std::uint8_t index = 0; index < PlayerLoadout::kActiveSlots; ++index) {
    const std::uint16_t type = slots[index].type_id;
    const catalog::PetalCatalogEntry* definition = Catalog::instance().petal(type);
    if (catalog::petal_id(type) == catalog::PetalId::kNone || definition == nullptr) {
      continue;
    }
    // definition+40 disables the orbit slot entirely.
    if (definition->orbitHidden) {
      continue;
    }
    const std::uint8_t count = slots[index].count == 0U ? 1U : slots[index].count;
    if (definition->sharedOrbit) {
      // sharedOrbit: instances share one orbital position.
      if (index == slot) {
        return orbit_index;
      }
      if (count != 0U) {
        ++orbit_index;
      }
      continue;
    }
    for (std::uint8_t candidate = 0; candidate < PlayerLoadout::kInstances; ++candidate) {
      if (index == slot && candidate == instance) {
        return orbit_index;
      }
      // Existing entities take a position; otherwise the configured instance
      // count reserves one (petal-lifecycle assignPetalOrbitIndices).
      if (state.loadout().handle(index, candidate).valid() || candidate < count) {
        ++orbit_index;
      }
    }
  }
  return orbit_index;
}

void assign_petal_orbit_indices(PlayerState& state) {
  auto& loadout = state.loadout();
  const auto& slots = loadout.slots();
  std::uint8_t orbit_index = 0;
  const auto petal_state = [&state](EntityHandle handle) -> PetalOrbitState* {
    if (!handle.valid()) {
      return nullptr;
    }
    for (auto& orbit : state.petals()) {
      if (orbit.handle == handle) {
        return &orbit;
      }
    }
    return nullptr;
  };
  for (std::uint8_t slot = 0; slot < PlayerLoadout::kActiveSlots; ++slot) {
    const std::uint16_t type = slots[slot].type_id;
    const catalog::PetalCatalogEntry* definition = Catalog::instance().petal(type);
    if (catalog::petal_id(type) == catalog::PetalId::kNone || definition == nullptr) {
      // Still write the boundary counter for empty slots.
    } else {
      if (!definition->orbitHidden) {
        if (definition->sharedOrbit) {
          bool position_used = false;
          for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
            const EntityHandle handle = loadout.handle(slot, instance);
            PetalOrbitState* state = petal_state(handle);
            if (state != nullptr) {
              state->orbit_index = orbit_index;
            }
            if (instance < 2U) {
              // An existing slot entity without a petal component does not
              // reserve an orbit position; only a missing entity does.
              if (state != nullptr) {
                position_used = true;
              } else if (!handle.valid() && definition->instancesPerSlot > instance) {
                position_used = true;
              }
            } else if (state != nullptr) {
              ++orbit_index;
            } else if (handle.valid()) {
              // A live slot entity without a petal component consumes only the
              // position already claimed by its earlier instances.
              if (position_used) {
                ++orbit_index;
              }
            } else {
              position_used = position_used || definition->instancesPerSlot > 2U;
              if (position_used) {
                ++orbit_index;
              }
            }
          }
        } else {
          for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
            const EntityHandle handle = loadout.handle(slot, instance);
            PetalOrbitState* state = petal_state(handle);
            if (state != nullptr) {
              state->orbit_index = orbit_index;
              ++orbit_index;
            } else if (!handle.valid() && definition->instancesPerSlot > instance) {
              ++orbit_index;
            }
          }
        }
      }
    }
    if (static_cast<std::uint8_t>(slot + 1U) == state.profile().active_slots()) {
      loadout.set_orbit_positions(orbit_index);
    }
  }
}

double petal_orbit_angle(const PlayerState& state, std::uint8_t orbit_index) {
  const std::uint8_t active = active_slot_count(state);
  // Original loadout+292 stores the number of occupied orbit positions at
  // the active-slot boundary. Use it when available; derive it from the same
  // configured-instance rules for callers before the first assignment.
  std::uint8_t orbit_positions = state.loadout().orbit_positions();
  if (orbit_positions == 0U) {
    const auto& loadout_slots = state.loadout().slots();
    for (std::uint8_t slot = 0; slot < active && slot < loadout_slots.size(); ++slot) {
      const std::uint16_t type = loadout_slots[slot].type_id;
      const catalog::PetalCatalogEntry* definition = Catalog::instance().petal(type);
      if (catalog::petal_id(type) == catalog::PetalId::kNone || definition == nullptr ||
          definition->orbitHidden) {
        continue;
      }
      if (definition->sharedOrbit) {
        ++orbit_positions;
      } else {
        orbit_positions = static_cast<std::uint8_t>(orbit_positions + definition->instancesPerSlot);
      }
    }
  }
  const double slots = orbit_positions > 1U ? static_cast<double>(orbit_positions) : 1.0;
  const double angle = static_cast<double>(orbit_index) * kTau / slots +
                       static_cast<double>(state.loadout().orbit_phase().value);
  // Original updatePetalOrbits wraps the angle with fmod(angle, 2*pi) before
  // calling sin/cos.
  return std::fmod(angle, kTau);
}

Vec2 orbit_position(Vec2 center, f32 radius, f32 angle) {
  const double radians = static_cast<double>(angle.value);
  const f32 x = f32::from_double(std::cos(radians) * static_cast<double>(radius.value));
  const f32 y = f32::from_double(std::sin(radians) * static_cast<double>(radius.value));
  return center + Vec2(x, y);
}

f32 petal_radius(std::uint16_t type_id) {
  const auto* petal = Catalog::instance().petal(type_id);
  if (petal != nullptr) {
    return f32(petal->labelFontSize);
  }
  return f32(0.0F);
}

void update_petal_orbit(World& world, const PetalOrbitState& state, double step_milliseconds) {
  Entity* entity = world.entities().get(state.handle);
  if (entity == nullptr) {
    return;
  }
  // The orbit angle is kept full-width (original updatePetalOrbits computes it
  // from the f32 loadout phase and feeds it straight to sin/cos).
  const double radians = state.orbit_angle;
  double target_x = static_cast<double>(state.center.x.value) +
                    std::cos(radians) * static_cast<double>(state.orbit_radius.value);
  double target_y = static_cast<double>(state.center.y.value) +
                    std::sin(radians) * static_cast<double>(state.orbit_radius.value);
  if (state.extra_radius.value > 0.0F && state.instance_count > 0U) {
    const double extra_angle = radians * 1.1 + static_cast<double>(state.instance) * kTau /
                                                   static_cast<double>(state.instance_count);
    target_x += std::cos(extra_angle) * static_cast<double>(state.extra_radius.value);
    target_y += std::sin(extra_angle) * static_cast<double>(state.extra_radius.value);
  }
  const double dx = target_x - static_cast<double>(entity->position.x.value);
  const double dy = target_y - static_cast<double>(entity->position.y.value);
  const double distance_squared = dx * dx + dy * dy;
  double distance = std::sqrt(distance_squared);
  double unit_x = 1.0;
  double unit_y = 0.0;
  if (distance >= 2.220446049250313e-16) {
    unit_x = dx / distance;
    unit_y = dy / distance;
  }
  // Original updatePetalOrbits rounds only the final product to f32:
  // f32((dx*dx + dy*dy) * 0.0011111111111111111).
  const f32 raw_factor = f32::from_double(distance_squared * 0.0011111111111111111);
  double factor = raw_factor.value;
  if (factor < 0.009999999776482582) {
    factor = 0.009999999776482582;
  } else if (factor > 2.0) {
    factor = 2.0;
  }
  const double acceleration = step_milliseconds * 0.007 * factor;
  entity->velocity.x += acceleration * unit_x;
  entity->velocity.y += acceleration * unit_y;
}

void advance_loadout_orbit_phase(PlayerState& state, double step_milliseconds) {
  const auto& slots = state.loadout().slots();
  const std::uint8_t active =
      std::min<std::uint8_t>(8U, static_cast<std::uint8_t>(state.profile().active_slots()));
  std::uint32_t yinyang = 0;
  std::uint32_t faster = 0;
  for (std::uint8_t slot = 0; slot < active && slot < slots.size(); ++slot) {
    if (catalog::petal_id(slots[slot].type_id) == catalog::PetalId::kYinYangEpic) {
      ++yinyang;
    }
    if (catalog::petal_id(slots[slot].type_id) == catalog::PetalId::kFasterRare &&
        !state.loadout().pending(slot, 0U)) {
      ++faster;
    }
  }
  // Original data $d0 read at address 1024: 1, -1, 0, 1, -1, 0, 1, -1, 5.
  static constexpr f32 kYinYangDirection[9] = {
      f32(1.0F), f32(-1.0F), f32(0.0F),  f32(1.0F), f32(-1.0F),
      f32(0.0F), f32(1.0F),  f32(-1.0F), f32(5.0F),
  };
  const f32 direction = kYinYangDirection[yinyang % 9U];
  const double increment = (2.5 + 0.8 * static_cast<double>(faster)) *
                           static_cast<double>(direction.value) * step_milliseconds * 0.001;
  state.loadout().set_orbit_phase(
      f32::from_double(increment + static_cast<double>(state.loadout().orbit_phase().value)));
}

void update_zone_restriction(World& world, PlayerState& state, double step_milliseconds) {
  const Entity* player = world.entities().get(state.player());
  if (player == nullptr) {
    return;
  }
  const int level = static_cast<int>(state.profile().level());
  double fraction = 0.0;
  bool limited = true;
  if (level >= 45) {
    fraction = 0.9;
  } else if (level >= 30) {
    fraction = 0.6;
  } else if (level >= 15) {
    fraction = 0.3;
  } else {
    limited = false;
  }
  const double width = static_cast<double>(world.width().value);
  const double minimum_x =
      limited ? (-width * 0.5) + fraction * width : -std::numeric_limits<double>::infinity();
  const bool overleveled = static_cast<double>(player->position.x.value) < minimum_x;
  const double threshold = 45000.0;
  double timer = static_cast<double>(state.zone_timer_ms().value);
  timer += overleveled ? step_milliseconds : -(step_milliseconds * 0.1);
  timer = std::clamp(timer, 0.0, threshold);
  state.set_zone_timer_ms(f32::from_double(timer));
  state.set_zone_petals_disabled(timer >= threshold);
  const double progress = std::clamp(timer * 255.0 / threshold, 0.0, 255.0);
  state.set_zone_progress(static_cast<std::uint8_t>(progress));
}

void damage_zone_locked_petals(World& world, PlayerState& state, double step_milliseconds) {
  if (!state.zone_petals_disabled()) {
    return;
  }
  // Original 654 sweeps all 8x3 equipped handles, including hatched pets that
  // no longer have an orbit record. Damage runs the ordinary corpse path.
  for (std::uint8_t slot = 0U; slot < PlayerLoadout::kActiveSlots; ++slot) {
    for (std::uint8_t instance = 0U; instance < PlayerLoadout::kInstances; ++instance) {
      const auto handle = state.loadout().handle(slot, instance);
      Entity* entity = world.entities().get(handle);
      if (entity == nullptr || entity->health.value <= 0.0F) {
        continue;
      }
      (void)damage_entity(world, handle, entity->health, EntityHandle{});
    }
  }
  refresh_egg_pet_slots(world, state);
  // Original advances recharge in this same slot sweep, while blocking new
  // spawns. It does not hold an Egg's timer at zero after the pet is defeated.
  state.loadout().advance(step_milliseconds);
  state.loadout().refresh_recharge_progress(world, state);
}

void update_petal_orbits(World& world, PlayerState& state, double step_milliseconds) {
  assign_petal_orbit_indices(state);
  const std::uint32_t buttons = state.input().buttons;
  const Entity* player = world.entities().get(state.player());
  // Rose consumption erases its own orbit record. Advance before processing,
  // then revisit the shifted element after a consumption so simultaneous
  // Rose instances all receive their callback in this tick.
  for (std::size_t index = 0; index < state.petals().size();) {
    auto& orbit = state.petals()[index++];
    if (world.entities().get(orbit.handle) == nullptr) {
      continue;
    }
    if (player != nullptr) {
      orbit.center = player->position;
    }
    const auto profile = static_cast<OrbitProfile>(orbit.profile);
    const auto type = catalog::petal_id(orbit.type_id);
    const bool defend = has_flag(buttons, InputButton::kDefend);
    const double held_ms = world.time_ms() - orbit.behavior_started_at_ms;
    if (update_projectile_petal_orbit(world, orbit, buttons)) {
      --index;
      continue;
    }
    // Bubble (684) stays at radius 60 and, while defending for 500 ms,
    // transfers its stored momentum to the flower before popping itself.
    if (type == catalog::PetalId::kBubbleRare) {
      orbit.orbit_radius = f32(60.0F);
      if (orbit.behavior_state == 0U && defend && held_ms > 500.0) {
        const EntityHandle petal_handle = orbit.handle;
        Entity* petal = world.entities().get(petal_handle);
        Entity* owner =
            petal != nullptr ? world.entities().get(EntityHandle{petal->owner}) : nullptr;
        if (petal != nullptr && owner != nullptr) {
          orbit.behavior_state = 1U;
          const double dx = static_cast<double>(owner->position.x.value) -
                            static_cast<double>(petal->position.x.value);
          const double dy = static_cast<double>(owner->position.y.value) -
                            static_cast<double>(petal->position.y.value);
          const double length = std::sqrt(dx * dx + dy * dy);
          double impulse_x = 1.4;
          double impulse_y = 0.0;
          if (!(length < 2.220446049250313e-16)) {
            impulse_x = dx * 1.4 / length;
            impulse_y = dy * 1.4 / length;
          }
          owner->velocity.x += impulse_x;
          owner->velocity.y += impulse_y;
          (void)damage_entity(world, petal_handle, petal->health, EntityHandle{});
          --index;
          continue;
        }
      }
    } else if (type == catalog::PetalId::kPollenEpic) {
      orbit.orbit_radius = f32(65.0F);
    } else if (type == catalog::PetalId::kMissileRare || type == catalog::PetalId::kDandelionRare ||
               type == catalog::PetalId::kWebRare || type == catalog::PetalId::kWebLegendary) {
      orbit.orbit_radius = defend ? f32(40.0F) : f32(65.0F);
    } else if (type == catalog::PetalId::kEggEpic || type == catalog::PetalId::kEggLegendary) {
      // Egg callbacks always report radius 65 and never respond to buttons.
      orbit.orbit_radius = f32(65.0F);
      if (held_ms > (type == catalog::PetalId::kEggEpic ? 1000.0 : 2500.0) &&
          hatch_equipped_egg(world, orbit.handle,
                             catalog::species_type_id(type == catalog::PetalId::kEggEpic
                                                          ? catalog::SpeciesId::kSoldierAnt
                                                          : catalog::SpeciesId::kBeetle))) {
        --index;
        continue;
      }
    } else if (is_rose_behavior(orbit.behavior)) {
      orbit.orbit_radius = rose_orbit_radius(buttons);
    } else if (profile == OrbitProfile::kWing) {
      orbit.phase =
          f32::from_double(static_cast<double>(orbit.phase.value) + step_milliseconds * 0.005);
      orbit.orbit_radius = wing_orbit_radius(buttons, orbit.phase);
    } else if (type == catalog::PetalId::kPeasRare || type == catalog::PetalId::kPeasEpic ||
               type == catalog::PetalId::kPeasLegendary ||
               type == catalog::PetalId::kAntennaeLegendary) {
      orbit.orbit_radius = defend ? f32(40.0F) : f32(65.0F);
    } else {
      orbit.orbit_radius = orbit_radius(profile, buttons);
    }
    // Original recomputes the ring angle from the shared loadout phase every
    // tick: petalOrbitIndex * 2*pi / unlockedSlots + loadout+284.
    orbit.orbit_angle = petal_orbit_angle(state, orbit.orbit_index);
    orbit.angle = f32::from_double(orbit.orbit_angle);
    if (is_rose_behavior(orbit.behavior)) {
      Entity* petal = world.entities().get(orbit.handle);
      Entity* owner = petal != nullptr ? world.entities().get(EntityHandle{petal->owner}) : nullptr;
      if (owner != nullptr && owner->health.value > 0.0F && orbit.behavior_state == 0U) {
        // Original RoseR1 arms its 1000 ms timer even while the owner is at
        // full health. Once armed, damage is healed almost immediately; the
        // ten-step state below then advances once per simulation tick.
        if (world.time_ms() - orbit.behavior_started_at_ms > 1000.0 &&
            owner->health.value < owner->max_health.value && !blocks_healing(*owner)) {
          orbit.behavior_state = 1U;
        }
      }
      if (owner != nullptr && orbit.behavior_state != 0U) {
        // Original 665/682/723 marks the orbit callback handled and moves the
        // petal toward the owner's current world position instead of applying
        // the ordinary orbital spring. The callback receives f32 elapsed time.
        const double elapsed = static_cast<double>(f32::from_double(step_milliseconds).value);
        const double weight = std::clamp(1.0 - std::pow(0.8, elapsed * 0.06), 0.0, 1.0);
        const double x = static_cast<double>(petal->position.x.value);
        const double y = static_cast<double>(petal->position.y.value);
        petal->set_position_x(
            f32::from_double((static_cast<double>(owner->position.x.value) - x) * weight + x));
        petal->set_position_y(
            f32::from_double((static_cast<double>(owner->position.y.value) - y) * weight + y));
        invalidate_bounds(world, orbit.handle);
        ++orbit.behavior_state;
        if (orbit.behavior_state != kRoseHealSteps) {
          continue;
        }
        (void)heal_entity(world, EntityHandle{petal->owner}, orbit.heal_amount);
        // The original passes health+8 to damage, consuming the entire Rose.
        // This clears the equipped handle and starts its catalog recharge.
        (void)damage_entity(world, orbit.handle, petal->health, EntityHandle{});
        --index;
        continue;
      }
    }
    update_petal_orbit(world, orbit, step_milliseconds);
  }
}

std::size_t advance_pickups(World& world, double delta_milliseconds) {
  // Original simulation-tick 845..1270 keeps all arithmetic in f64 until
  // setLocalX/Y demotes the final position to f32. Follow runs even after the
  // recipient dies, until its intrusive handle is actually released.
  const double factor = std::clamp(1.0 - std::pow(0.8, delta_milliseconds * 0.06), 0.0, 1.0);
  std::size_t collected = 0;
  for (const EntityHandle handle : world.pickups()) {
    Entity* pointer = world.entities().get(handle);
    if (pointer == nullptr) {
      continue;
    }
    Entity& drop = *pointer;
    if (drop.pickup_transfer_deadline_ms <= world.time_ms() + 2000.0) {
      drop.pickup_collected = true;
    }
    if (!drop.pickup_collected && world.time_ms() >= drop.behavior_cooldown_ms) {
      const EntityHandle recipient = find_pickup_recipient(world, handle);
      if (auto* owner = world.players().by_body(recipient)) {
        auto& state = *owner;
        const std::uint8_t capacity =
            std::min<std::uint8_t>(state.profile().inventory_size(), PlayerLoadout::kSlots);
        for (std::uint8_t slot = 0; slot < capacity; ++slot) {
          if (state.loadout().slots()[slot].count != 0U) {
            continue;
          }
          if (!state.loadout().equip(slot, drop.type_id)) {
            break;
          }
          state.profile().set_inventory(slot, drop.type_id);
          if (slot >= state.profile().inventory_count()) {
            state.profile().set_inventory_count(static_cast<std::uint8_t>(slot + 1U));
          }
          state.loadout().record_pickup_transfer(handle, slot);
          drop.ai.target = recipient;
          drop.pickup_recipient = state.id();
          drop.pickup_collected = true;
          drop.pickup_transfer_deadline_ms = world.time_ms() + 2000.0;
          ++collected;
          break;
        }
      }
    }
    const Entity* recipient = world.entities().get(drop.ai.target);
    if (recipient == nullptr) {
      continue;
    }
    const auto follow = [factor](f32 position, f32 target) {
      const double source = static_cast<double>(position.value);
      const double destination = static_cast<double>(target.value);
      return f32::from_double(std::abs(source - destination) < 1e-7
                                  ? destination
                                  : factor * (destination - source) + source);
    };
    drop.set_position_x(follow(drop.position.x, recipient->position.x));
    drop.set_position_y(follow(drop.position.y, recipient->position.y));
    invalidate_bounds(world, handle);
  }
  return collected;
}

std::size_t collect_drops(World& world) {
  return advance_pickups(world, 0.0);
}

}  // namespace engine
