#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <limits>
#include <numbers>
#include <unordered_map>

namespace wave::sim {
namespace {

struct Interaction {
  bool push;
  bool damage;
  bool heal;
};

// Rows are source faction, columns are target faction.
constexpr Interaction pve[2][2]{
    {{true, false, true}, {true, true, false}},
    {{true, true, false}, {true, false, true}},
};

const Interaction& interaction(Faction source, Faction target) {
  return pve[static_cast<std::size_t>(source)][static_cast<std::size_t>(target)];
}

constexpr auto heal_travel_time = std::chrono::milliseconds(225);

bool can_receive_healing(const detail::Entity& source, const detail::Entity& target, Tick tick) {
  return interaction(source.view.faction, target.view.faction).heal && target.view.health > 0 &&
         target.view.health < target.view.max_health && target.heal_block_until <= tick;
}

double dot(Vec2 a, Vec2 b) {
  return a.x * b.x + a.y * b.y;
}

void rebound_player_mob(detail::Entity& player, detail::Entity& mob, const Rules& rules) {
  auto& flower = player.view;
  auto& creature = mob.view;
  const auto delta = flower.position - creature.position;
  const double distance = delta.length();
  const double depth = flower.radius + creature.radius - distance;
  if (depth <= 0) {
    return;
  }
  const auto normal = distance > 0 ? delta * (1 / distance) : Vec2{1, 0};
  const auto space_to_wall = [&](const EntityView& body, Vec2 away) {
    const double limit = std::max(0., rules.arena_radius - body.radius);
    const double radial = dot(body.position, away);
    const double remaining = std::max(0., limit * limit - dot(body.position, body.position));
    return std::sqrt(radial * radial + remaining) - radial;
  };
  const double player_space = space_to_wall(flower, normal);
  // Followers are positioned by their chain; they cannot integrate an impulse.
  const double mob_space =
      mob.immovable || creature.predecessor ? 0 : space_to_wall(creature, normal * -1);
  // Like the original engine, split the response by the bodies' effective mass.
  const double player_mass = flower.radius * flower.radius;
  const double mob_mass = creature.radius * creature.radius;
  double player_share = mob_mass / (player_mass + mob_mass);
  const double player_shift =
      std::min(player_space, std::max(depth * player_share, depth - mob_space));
  const double mob_shift = std::min(mob_space, depth - player_shift);
  flower.position =
      clamp_center(flower.position + normal * player_shift, rules.arena_radius, flower.radius);
  creature.position =
      clamp_center(creature.position - normal * mob_shift, rules.arena_radius, creature.radius);

  // Give the available body the full rebound when the other cannot move away.
  constexpr double wall_slop = 1e-6;
  const bool player_free = player_space - player_shift > wall_slop;
  const bool mob_free = mob_space - mob_shift > wall_slop;
  if (!player_free && !mob_free) {
    return;
  }
  if (!mob_free) {
    player_share = 1;
  } else if (!player_free) {
    player_share = 0;
  }
  // Cancel the closing speed and leave a small opening speed, even when the
  // player's input and the mob's AI continue trying to move toward each other.
  constexpr double restitution = .25;
  const double closing = dot(creature.velocity - flower.velocity, normal);
  const double opening = rules.contact_knockback_speed * (player_free + mob_free);
  const double impulse = std::max(0., closing + std::max(0., closing) * restitution + opening);
  player.knockback += normal * (impulse * player_share);
  mob.knockback = mob.knockback - normal * (impulse * (1 - player_share));
}

std::optional<double> flight_contact(Vec2 start, Vec2 end, double radius) {
  const double outside = dot(start, start) - radius * radius;
  if (outside < 0) {
    return 0;
  }
  const auto travel = end - start;
  const double along = dot(start, travel);
  const double length_squared = dot(travel, travel);
  const double discriminant = along * along - length_squared * outside;
  if (along >= 0 || discriminant <= 0) {
    return std::nullopt;
  }
  const double entry = outside / (-along + std::sqrt(discriminant));
  return entry < 1 ? std::optional{entry} : std::nullopt;
}

}  // namespace

void Match::move_entities() {
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  const double impulse_damping = std::pow(.992, seconds * 1000);
  const double impulse_drag = .125 * (1 - impulse_damping) / seconds;
  const auto& active = entities_.active();
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    std::erase_if(entity.slows,
                  [this](const detail::Slow& effect) { return tick_ >= effect.until; });
    if (entity.immovable || body.predecessor) {
      body.velocity = {};
      entity.knockback = {};
      entity.recoil = {};
      continue;
    }
    Vec2 direction;
    if (entity.held) {
      const auto* owner = body.owner ? player(body.owner->player) : nullptr;
      if (body.petal == Petal::pearl && owner && owner->view.body) {
        const auto delta = entities_.get(*owner->view.body)->view.position - body.position;
        if (delta.length() > 50 || ((owner->attack || owner->defend) && delta.length() > 5)) {
          direction = delta * (1 / delta.length());
        }
        entity.range_left = 1e9;
      }
    } else if (entity.projectile) {
      direction = entity.flight_direction;
    } else if (body.group == Group::player) {
      direction = player(body.owner->player)->move;
    } else if (body.mob) {
      direction = mob_direction(entity);
    }
    if (direction != Vec2{}) {
      body.heading_rad = std::atan2(direction.y, direction.x);
    }
    if (body.mob == Mob::hornet && entity.target) {
      if (const auto* target = entities_.get(*entity.target)) {
        const auto aim = target->view.position - body.position;
        if (aim != Vec2{}) {
          body.heading_rad = std::atan2(aim.y, aim.x);
        }
      }
    }
    double slow = 1;
    double movement_slow = 1;
    for (const auto& effect : entity.slows) {
      if (effect.slows_attacks) {
        slow *= effect.multiplier;
      } else {
        movement_slow = std::min(movement_slow, effect.multiplier);
      }
    }
    slow *= movement_slow;
    for (const auto area_slot : active) {
      const auto& area = entities_.at(area_slot);
      if (!area.view.ground_web || area.view.faction == body.faction ||
          body.group == Group::petal || body.mob == Mob::spider) {
        continue;
      }
      const auto& mechanics = rules_.catalog.petal(Petal::web, area.view.rarity)->mechanics;
      if (seconds * (tick_ - area.born_tick) >= mechanics.duration_seconds) {
        continue;
      }
      if (overlaps(body.position, body.radius, area.view.position, area.view.radius)) {
        slow *= mechanics.slow_multiplier;
        break;
      }
    }
    double speed = entity.projectile ? entity.flight_speed : entity.rules.speed_per_second;
    if (entity.projectile) {
      speed += entity.flight_impulse * impulse_drag;
      entity.flight_impulse *= impulse_damping;
    }
    body.velocity = entity.stun_until > tick_ ? Vec2{}
                                              : direction * (speed * slow) + entity.knockback +
                                                    entity.recoil * impulse_drag;
  }
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    if ((body.group == Group::petal && !entity.projectile) || body.predecessor ||
        entity.immovable) {
      continue;
    }
    auto displacement = body.velocity * seconds;
    const double distance = displacement.length();
    const bool reaches_range = entity.projectile && distance >= entity.range_left;
    if (reaches_range && distance > 0) {
      displacement = displacement * (entity.range_left / distance);
    }
    const auto next = body.position + displacement;
    const auto clamped = clamp_center(next, rules_.arena_radius, body.radius);
    if (next != clamped) {
      const double distance = clamped.length();
      if (distance == 0) {
        entity.knockback = {};
        entity.recoil = {};
      } else {
        const Vec2 normal = clamped * (1 / distance);
        const auto cancel_outward = [normal](Vec2 impulse) {
          const double outward = normal.x * impulse.x + normal.y * impulse.y;
          return impulse - normal * std::max(0.0, outward);
        };
        entity.knockback = cancel_outward(entity.knockback);
        entity.recoil = cancel_outward(entity.recoil);
      }
    }
    entity.knockback = entity.knockback * rules_.knockback_retention;
    entity.recoil = entity.recoil * impulse_damping;
    body.velocity = (clamped - body.position) * (1 / seconds);
    if (entity.projectile) {
      entity.flight_start = body.position;
      entity.range_left = std::max(0.0, entity.range_left - (clamped - body.position).length());
      if (reaches_range || next != clamped || entity.range_left <= 1e-8) {
        entity.range_left = 0;
      }
    }
    body.position = clamped;
  }
}

void Match::update_orbits() {
  constexpr double turn = 2 * std::numbers::pi;
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  for (auto& owner : players_) {
    if (owner.orbit_updated == tick_) {
      continue;
    }
    double bonus = 0;
    unsigned yin_yang = 0;
    for (std::size_t i = 0; i < owner.view.petals.size(); ++i) {
      if (!owner.view.petals[i].entity) {
        continue;
      }
      const auto* p = rules_.catalog.petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
      bonus += p->mechanics.rotation_bonus;
      yin_yang += p->effect == catalog::Effect::yin_yang;
    }
    double slow = 1;
    if (owner.view.body) {
      for (const auto& effect : entities_.get(*owner.view.body)->slows) {
        if (effect.until > tick_) {
          if (effect.slows_attacks) {
            slow *= effect.multiplier;
          }
        }
      }
    }
    if (tick_ != 0) {
      owner.orbit_phase =
          std::fmod(owner.orbit_phase + (rules_.orbit_rad_per_second + bonus) * slow * seconds *
                                            (yin_yang == 8       ? 5
                                             : yin_yang % 3 == 1 ? -1
                                             : yin_yang % 3 == 2 ? 0
                                                                 : 1),
                    turn);
    }
    owner.orbit_updated = tick_;
  }
  for (const auto slot : entities_.active()) {
    auto& petal = entities_.at(slot);
    if (petal.view.group != Group::petal || petal.projectile || petal.held ||
        petal.view.ground_web || !petal.view.anchor) {
      continue;
    }
    if (petal.healing) {
      if (petal.view.petal == Petal::leaf && tick_ >= petal.healing->arrival) {
        // Keep the arrived Leaf centered even after the mob's contacts move it.
        if (const auto* target = entities_.get(petal.healing->recipient)) {
          petal.view.position = target->view.position;
        }
      }
      continue;
    }
    const auto& body = entities_.get(*petal.view.anchor)->view;
    const auto& owner = *player(petal.view.owner->player);
    bool third_eye = false;
    for (std::size_t i = 0; i < owner.view.loadout.size(); ++i) {
      third_eye |=
          owner.view.loadout[i] == Petal::third_eye && owner.view.petals[i].entity.has_value();
    }
    double total = 0, before = 0;
    for (std::size_t i = 0; i < owner.view.loadout.size(); ++i) {
      const auto* p = rules_.catalog.petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
      if (!p || p->mechanics.hidden) {
        continue;
      }
      const auto& equipped = owner.view.petals[i];
      const auto* occupant = equipped.entity ? entities_.get(*equipped.entity) : nullptr;
      // A hatchling holds its equipment slot but does not take up an orbit position.
      // Empty slots still reserve a position during recharge.
      if (occupant && !occupant->view.petal) {
        continue;
      }
      const double weight = p->kind == Petal::light || p->kind == Petal::pollen ? p->particles : 1;
      if (std::ranges::find(equipped.entities, petal.view.id) != equipped.entities.end()) {
        before = total;
        if (weight > 1) {
          before += petal.particle_index;
        }
      }
      total += weight;
    }
    const double orbit_offset = total > 0 ? turn * before / total : 0;
    const double heading =
        std::fmod((third_eye ? owner.aim_angle : owner.orbit_phase) + orbit_offset, turn);
    const Vec2 offset{std::cos(heading), std::sin(heading)};
    Vec2 cluster_offset;
    const auto& p = *rules_.catalog.petal(*petal.view.petal, petal.view.rarity);
    double radius = owner.defend   ? p.mechanics.defend_distance
                    : owner.attack ? p.mechanics.attack_distance
                                   : rules_.orbit_radius;
    if (p.effect == catalog::Effect::wing && owner.attack && !owner.defend) {
      radius += (1 + std::sin(seconds * (tick_ - petal.born_tick) * 5)) * 12;
    }
    if (third_eye) {
      radius = owner.aim_distance;
    }
    if (p.mechanics.hidden) {
      radius = 0;
    }
    if (p.particles > 1 && p.kind != Petal::light && p.kind != Petal::pollen &&
        p.kind != Petal::peas && p.kind != Petal::grapes) {
      // Pack the particles around their slot center. Spacing is in world units,
      // so attacking or aiming farther away does not stretch the cluster.
      const bool dahlia = p.kind == Petal::dahlia;
      // Match the original three-particle Rose ring (11 client units). Put
      // Dahlia's first petal on the inside so it can heal without crossing the others.
      const double angle =
          heading + (dahlia ? std::numbers::pi : 0) + turn * petal.particle_index / p.particles;
      const double cluster_radius =
          dahlia ? 2.2 : p.body.radius * .75 / std::sin(std::numbers::pi / p.particles);
      cluster_offset = Vec2{std::cos(angle), std::sin(angle)} * cluster_radius;
    }
    // Egg art is upright at zero; its position still follows the orbit phase.
    petal.view.heading_rad = p.kind == Petal::egg ? 0 : heading;
    petal.view.position = body.position + offset * radius + cluster_offset;
  }
}

void Match::detach_petal(EntityId id) {
  const auto* entity = entities_.get(id);
  if (!entity || !entity->view.owner) {
    return;
  }
  auto* owner = player(entity->view.owner->player);
  if (!owner || owner->view.life != *entity->view.owner) {
    return;
  }
  for (std::size_t i = 0; i < owner->view.petals.size(); ++i) {
    auto& slot = owner->view.petals[i];
    const auto found = std::ranges::find(slot.entities, id);
    if (found == slot.entities.end()) {
      continue;
    }
    slot.entities.erase(found);
    slot.entity = slot.entities.empty() ? std::nullopt : std::optional{slot.entities.front()};
    const Tick reload = reload_ticks(owner->view.loadout[i], owner->view.loadout_rarities[i]);
    slot.reload_ticks = slot.reload_total_ticks = reload;
    owner->petal_ready[i] = tick_ + reload;
    return;
  }
}

void Match::consume_petal(EntityId id) {
  flush_sponge(id);
  detach_petal(id);
  entities_.erase(id);
}

void Match::launch_projectile(detail::Entity& shot, double heading, Microseconds duration) {
  const bool web = shot.view.petal == Petal::web;
  shot.projectile = true;
  shot.flight_direction = {std::cos(heading), std::sin(heading)};
  shot.flight_start = shot.view.position;
  // World PvP integrates a damped launch impulse plus steady displacement.
  // Convert its client units/ms to Wave units/s (1000 / 5).
  shot.flight_impulse = (web ? 2.2 : 1.4) * 200;
  shot.flight_speed = web ? 0 : .6 * 200;
  shot.range_left = std::numeric_limits<double>::infinity();
  shot.born_tick = tick_;
  shot.expires = tick_ + rules_.timing.ticks_ceil(duration);
  shot.view.anchor.reset();
  shot.view.heading_rad = heading;
}

void Match::update_effects() {
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  // The original Rose closes in over nine 25 ms updates with exponential easing.
  const double heal_step = 1 - std::pow(.8, seconds * 60);
  const Tick heal_travel = rules_.timing.ticks_ceil(heal_travel_time);
  const Tick leaf_center_hold = rules_.timing.ticks_ceil(rules_.timing.broadcast_interval);
  const auto can_heal = [this](const detail::Entity& petal, const detail::Entity& target) {
    return target.view.group == Group::player && can_receive_healing(petal, target, tick_);
  };
  // Reserve healing already on its way, so a small injury only draws one petal.
  std::unordered_map<std::uint32_t, double> incoming_heal;
  std::vector<EntityId> active;
  for (auto slot : entities_.active()) {
    const auto& entity = entities_.at(slot);
    active.push_back(entity.view.id);
    if (entity.healing && entity.view.health > 0) {
      const auto* target = entities_.get(entity.healing->recipient);
      if (target && can_heal(entity, *target)) {
        incoming_heal[target->view.id.slot] +=
            rules_.catalog.petal(*entity.view.petal, entity.view.rarity)->mechanics.heal;
      }
    }
  }
  // Queue effects before contacts; useful healing is consumed when impacts are applied.
  for (const auto id : active) {
    auto* entity = entities_.get(id);
    if (!entity || entity->projectile || entity->view.ground_web ||
        entity->view.group != Group::petal || entity->view.health <= 0) {
      continue;
    }
    const auto& definition = *rules_.catalog.petal(*entity->view.petal, entity->view.rarity);
    auto& owner = *player(entity->view.owner->player);
    if (owner.view.life != *entity->view.owner || !owner.view.body) {
      continue;
    }
    const auto owner_body = *owner.view.body;
    const auto origin = entities_.get(owner_body)->view.position;
    const auto source = damage_source(*entity);
    const Tick delay = rules_.timing.ticks_ceil(
        Microseconds(static_cast<Microseconds::rep>(definition.activation_seconds * 1000000)));
    if (definition.effect == catalog::Effect::leaf) {
      impacts_.push_back({owner_body, source, HealthKind::heal,
                          definition.mechanics.passive_heal_per_second * seconds});
      if (!entity->healing) {
        continue;
      }
      const auto [recipient, arrival] = *entity->healing;
      const auto* target = entities_.get(recipient);
      if (!target || !can_receive_healing(*entity, *target, tick_)) {
        entity->healing.reset();
        continue;
      }
      if (tick_ < arrival) {
        entity->view.position += (target->view.position - entity->view.position) * heal_step;
      } else if (tick_ - arrival >= leaf_center_hold) {
        // Publish the Leaf at the mob's center before its disappearance is sent.
        Impact hit{recipient, source, HealthKind::heal, definition.mechanics.friendly_mob_heal};
        hit.consume_source = true;
        impacts_.push_back(hit);
      }
    } else if ((definition.effect == catalog::Effect::rose ||
                definition.effect == catalog::Effect::dahlia) &&
               tick_ >= entity->born_tick + delay) {
      if (!entity->healing) {
        // Owner first, then nearest teammate who still needs healing.
        std::optional<EntityId> target;
        double closest = definition.mechanics.range;
        for (const auto candidate : entities_.active()) {
          const auto& recipient = entities_.at(candidate);
          const auto& body = recipient.view;
          if (!can_heal(*entity, recipient) ||
              body.health + incoming_heal[body.id.slot] >= body.max_health) {
            continue;
          }
          const double distance = (body.position - origin).length();
          if (body.id == owner_body || distance <= closest) {
            target = body.id;
            closest = distance;
            if (body.id == owner_body) {
              break;
            }
          }
        }
        if (!target) {
          continue;
        }
        incoming_heal[target->slot] += definition.mechanics.heal;
        entity->healing = detail::HealingPetal{*target, tick_ + heal_travel - 1};
      }
      const auto* target = entities_.get(entity->healing->recipient);
      if (!target || !can_heal(*entity, *target)) {
        entity->healing.reset();
        continue;
      }
      entity->view.position += (target->view.position - entity->view.position) * heal_step;
      if (tick_ >= entity->healing->arrival) {
        Impact hit{target->view.id, source, HealthKind::heal, definition.mechanics.heal};
        hit.consume_source = true;
        impacts_.push_back(hit);
        entity->healing.reset();
      }
    } else if (definition.effect == catalog::Effect::summon && tick_ >= entity->born_tick + delay) {
      for (auto& slot : owner.view.petals) {
        const auto equipped = std::ranges::find(slot.entities, id);
        if (equipped == slot.entities.end()) {
          continue;
        }
        const auto child = spawn_mob(definition.summon_mob, definition.summon_rarity,
                                     entity->view.position, Group::summon, entity->view.owner);
        entities_.get(child)->summon_origin = Petal::egg;
        // The hatchling keeps the slot out of recharge until it dies.
        *equipped = child;
        slot.entity = slot.entities.front();
        entities_.erase(id);
        break;
      }
    } else if (owner.attack && !owner.defend && tick_ >= entity->born_tick + delay &&
               (definition.effect == catalog::Effect::projectile ||
                definition.effect == catalog::Effect::poison_projectile ||
                definition.effect == catalog::Effect::web)) {
      if (definition.kind == Petal::peas || definition.kind == Petal::grapes) {
        // World Peas replace the equipped cluster with four radial children.
        const double phase =
            2 * std::numbers::pi * (draw(DrawPurpose::projectile_phase) / 4294967296.0);
        auto shot = entity->view;
        const auto center = shot.position;
        shot.split_particle = true;
        consume_petal(id);
        for (unsigned i = 0; i < 4; ++i) {
          const double heading = phase + i * std::numbers::pi / 2;
          const auto direction = Vec2{std::cos(heading), std::sin(heading)};
          shot.position = center + direction * (std::sqrt(72.) / 5);
          const auto child = add_entity(shot, petal_body(definition.kind, shot.rarity));
          launch_projectile(*entities_.get(child), heading, std::chrono::seconds(1));
        }
      } else {
        launch_projectile(*entity, entity->view.heading_rad,
                          std::chrono::milliseconds(definition.kind == Petal::web ? 650 : 1500));
        detach_petal(id);
      }
    }
  }
}

void Match::finish_projectiles() {
  const auto active = entities_.active();
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    const auto id = entity.view.id;
    if (entity.spent && !entity.projectile && !entity.view.ground_web) {
      consume_petal(id);
    } else if (entity.view.ground_web) {
      const auto& definition = *rules_.catalog.petal(Petal::web, entity.view.rarity);
      if (std::chrono::duration<double>(rules_.timing.step).count() * (tick_ - entity.born_tick) >=
          definition.mechanics.duration_seconds) {
        consume_petal(id);
      }
    } else if (entity.projectile &&
               (entity.range_left <= 0 || entity.spent || entity.view.health <= 0 ||
                (entity.expires && tick_ >= entity.expires))) {
      if (entity.view.petal == Petal::web) {
        // The original client keeps component presence for the life of a handle.
        // Give the unfolded web its own entity and radius.
        auto web = entity.view;
        web.ground_web = true;
        web.velocity = {};
        const double radius = rules_.catalog.petal(Petal::web, web.rarity)->mechanics.area_radius;
        consume_petal(id);
        (void)add_entity(web, {.radius = radius, .health = 1});
      } else {
        consume_petal(id);
      }
    } else if (entity.expires && tick_ >= entity.expires) {
      consume_petal(id);
    }
  }
}

void Match::resolve_contacts() {
  const auto attack = [this](detail::Entity& source, const detail::Entity& target) {
    if (source.view.ground_web || target.view.ground_web || source.spent ||
        source.view.health <= 0 || target.view.health <= 0) {
      return;
    }
    if (source.view.mob == Mob::fire_ant_burrow || target.view.mob == Mob::fire_ant_burrow ||
        (source.view.mob == Mob::ant_hole && source.view.rarity >= Rarity::rare) ||
        (target.view.mob == Mob::ant_hole && target.view.rarity >= Rarity::rare)) {
      return;
    }
    const auto& pair = interaction(source.view.faction, target.view.faction);
    const auto* definition =
        source.view.petal ? rules_.catalog.petal(*source.view.petal, source.view.rarity) : nullptr;
    const auto* target_definition =
        target.view.petal ? rules_.catalog.petal(*target.view.petal, target.view.rarity) : nullptr;
    if ((definition && definition->mechanics.hidden) ||
        (target_definition && target_definition->mechanics.hidden)) {
      return;
    }
    if (pair.damage && source.projectile && source.view.petal == Petal::web &&
        target.view.group != Group::petal) {
      source.spent = true;
      return;
    }
    if (definition && definition->effect == catalog::Effect::leaf && target.view.mob &&
        !source.healing && can_receive_healing(source, target, tick_)) {
      source.healing = detail::HealingPetal{
          target.view.id, tick_ + rules_.timing.ticks_ceil(heal_travel_time)};
      return;
    }
    if (pair.damage && definition && definition->effect == catalog::Effect::lightning &&
        target.view.group != Group::petal) {
      chain_attack(target.view.id, damage_source(source), definition->mechanics.chain_damage,
                   definition->mechanics.bounces, 40);
      source.spent = true;

    } else if (pair.damage && source.rules.contact_damage > 0) {
      impacts_.push_back({target.view.id, damage_source(source), HealthKind::contact,
                          source.rules.contact_damage, source.rules.poison_per_tick,
                          source.rules.poison_ticks});
      if (definition && definition->mechanics.damage_ratio > 0) {
        impacts_.back().amount += std::min(definition->mechanics.damage_limit,
                                           target.view.health * definition->mechanics.damage_ratio);
      }
    } else {
      return;
    }
    if (definition &&
        (definition->effect == catalog::Effect::honey ||
         definition->effect == catalog::Effect::pincer) &&
        pair.damage) {
      auto& hit = impacts_.back();
      hit.slow_multiplier = definition->mechanics.slow_multiplier;
      hit.attack_slow = definition->effect == catalog::Effect::honey;
      hit.slow_ticks = rules_.timing.ticks_ceil(Microseconds(
          static_cast<Microseconds::rep>(definition->mechanics.duration_seconds * 1000000)));
    }
    if (definition && definition->effect == catalog::Effect::dandelion && pair.damage) {
      impacts_.back().heal_block_ticks = rules_.timing.ticks_ceil(Microseconds(
          static_cast<Microseconds::rep>(definition->mechanics.duration_seconds *
                                         (target.view.group == Group::player ? .5 : 1) * 1e6)));
    }
    if (pair.damage && definition && !target.immovable && !target.view.predecessor &&
        (definition->mechanics.knockback > 0 || definition->effect == catalog::Effect::heavy)) {
      const auto delta = target.view.position - source.view.position;
      if (delta.length() > 0) {
        entities_.get(target.view.id)->knockback +=
            delta * ((definition->mechanics.knockback > 0 ? definition->mechanics.knockback : 50) /
                     delta.length());
      }
    }
    if (source.projectile && !source.held && source.view.petal != Petal::pollen) {
      source.spent = true;
    }
  };

  const auto& active = entities_.active();
  std::vector<Vec2> positions;
  std::vector<Vec2> travel;
  positions.reserve(active.size());
  travel.reserve(active.size());
  for (const auto slot : active) {
    const auto& entity = entities_.at(slot);
    positions.push_back(entity.view.position);
    travel.push_back(entity.projectile && !entity.held ? entity.view.position - entity.flight_start
                                                       : Vec2{});
  }
  struct FlightContact {
    std::size_t first, second;
    double time;
  };
  std::vector<FlightContact> flight_contacts;
  for (std::size_t a = 0; a < active.size(); ++a) {
    auto& first = entities_.at(active[a]);
    for (std::size_t b = a + 1; b < active.size(); ++b) {
      auto& second = entities_.at(active[b]);
      const Vec2 delta = positions[b] - positions[a];
      const double radius = first.view.radius + second.view.radius;
      if (travel[a] != Vec2{} || travel[b] != Vec2{}) {
        if (const auto time = flight_contact(delta - (travel[b] - travel[a]), delta, radius)) {
          flight_contacts.push_back({a, b, *time});
        }
        continue;
      }
      const double distance = delta.length();
      const double depth = radius - distance;
      if (depth <= 0) {
        continue;
      }
      attack(first, second);
      attack(second, first);

      const auto& pair = interaction(first.view.faction, second.view.faction);
      if (pair.push && pair.damage && rules_.contact_knockback_speed > 0) {
        if (first.view.group == Group::player && second.view.mob && !second.projectile) {
          rebound_player_mob(first, second, rules_);
          continue;
        }
        if (second.view.group == Group::player && first.view.mob && !first.projectile) {
          rebound_player_mob(second, first, rules_);
          continue;
        }
      }
      // Centipede links may compress, and contacts can separate their bodies.
      // Leech sections overlap intentionally to draw one continuous body.
      const auto movable = [](const detail::Entity& body) {
        return !body.immovable && !(body.chain_kind == Mob::leech && body.view.predecessor);
      };
      const bool move_first = movable(first);
      const bool move_second = movable(second);
      const bool same_leech =
          first.chain_kind == Mob::leech && second.chain_kind == Mob::leech &&
          first.root.value_or(first.view.id) == second.root.value_or(second.view.id);
      if (pair.push && (move_first || move_second) && !same_leech &&
          first.view.group != Group::petal && second.view.group != Group::petal) {
        const Vec2 normal = distance > 0 ? delta * (1 / distance) : Vec2{1, 0};
        const Vec2 shift = normal * (depth / (move_first + move_second));
        const Vec2 impulse = normal * (pair.damage ? rules_.contact_knockback_speed : 0);
        if (move_first) {
          first.view.position =
              clamp_center(first.view.position - shift, rules_.arena_radius, first.view.radius);
          first.knockback = first.knockback - impulse;
        }
        if (move_second) {
          second.view.position =
              clamp_center(second.view.position + shift, rules_.arena_radius, second.view.radius);
          second.knockback += impulse;
        }
      }
    }
  }
  // A launch can cross more than one collider in a tick. Resolve the first
  // contact along the path before later ones, including where a Web lands.
  std::ranges::stable_sort(flight_contacts, {}, &FlightContact::time);
  for (const auto [a, b, time] : flight_contacts) {
    auto& first = entities_.at(active[a]);
    auto& second = entities_.at(active[b]);
    if (first.spent || second.spent) {
      continue;
    }
    attack(first, second);
    attack(second, first);
    if (first.projectile && first.spent) {
      first.view.position = positions[a] - travel[a] * (1 - time);
    }
    if (second.projectile && second.spent) {
      second.view.position = positions[b] - travel[b] * (1 - time);
    }
  }
}

void Match::apply_impacts() {
  for (const auto slot : entities_.active()) {
    auto& entity = entities_.at(slot);
    if (auto& poison = entity.poison) {
      (void)apply_health(entity.view.id, poison->source, HealthKind::poison, poison->amount);
      if (--poison->remaining == 0) {
        poison.reset();
      }
    }
    entity.view.poisoned = entity.poison.has_value();
    entity.view.slowed = !entity.slows.empty();
    entity.view.heal_blocked = entity.heal_block_until > tick_;
  }
  for (const auto& hit : impacts_) {
    // A consumable effect can only resolve while its source still exists.
    if (hit.consume_source && !entities_.get(hit.source.entity)) {
      continue;
    }
    auto* target = entities_.get(hit.target);
    if (!target || apply_health(hit.target, hit.source, hit.kind, hit.amount) <= 0) {
      continue;
    }
    if (hit.consume_source) {
      consume_petal(hit.source.entity);
    }
    if (target->view.health > 0 && hit.slow_ticks > 0) {
      const auto prior = std::ranges::find_if(target->slows, [&](const detail::Slow& slow) {
        return hit.attack_slow ? slow.source == hit.source : !slow.slows_attacks;
      });
      const detail::Slow slow{hit.source, hit.slow_multiplier, tick_ + hit.slow_ticks,
                              hit.attack_slow};
      if (prior == target->slows.end()) {
        target->slows.push_back(slow);
      } else {
        *prior = slow;
      }
    }
    if (target->view.health > 0 && hit.heal_block_ticks > 0) {
      target->heal_block_until = std::max(target->heal_block_until, tick_ + hit.heal_block_ticks);
    }
    if (target->view.health > 0 && hit.poison_ticks > 0 && hit.poison_per_tick > 0) {
      const auto& active = target->poison;
      const double remaining = active ? active->amount * active->remaining : 0;
      if (hit.poison_per_tick * hit.poison_ticks >= remaining) {
        target->poison = detail::Poison{hit.source, hit.poison_per_tick, hit.poison_ticks};
      }
    }
  }
  impacts_.clear();
}

void Match::reap_deaths() {
  for (const auto slot : entities_.active()) {
    const auto& e = entities_.at(slot).view;
    if (e.health == 0 && e.petal == Petal::sponge) {
      flush_sponge(e.id);
    }
  }
  std::vector<EntityId> dead;
  for (const auto slot : entities_.active()) {
    const auto& entity = entities_.at(slot).view;
    if (entity.health == 0) {
      dead.push_back(entity.id);
    }
  }
  for (const auto id : dead) {
    const auto* entity = entities_.get(id);
    if (!entity) {
      continue;
    }
    // Shared health kills the whole Leech. Only its head is a defeat.
    if (entity->chain_kind == Mob::leech && entity->root) {
      entities_.erase(id);
      continue;
    }
    auto body = entity->view;
    const auto source = entity->fatal_hit.value_or(DamageSource{});
    if (body.mob == Mob::ant_hole && entity->spawn_count > 0) {
      fallen_ant_holes_.push_back({id, body.rarity, body.position});
    }
    if (entity->chain_kind && entity->chain_kind != Mob::leech) {
      const auto root = entity->root.value_or(id);
      std::optional<EntityId> successor;
      if (id == root) {
        // Follow the chain in order, even if the pool recycled a slot.
        auto link = id;
        while (!successor) {
          const auto child = std::ranges::find_if(entities_.active(), [&](auto slot) {
            return entities_.at(slot).view.predecessor == link;
          });
          if (child == entities_.active().end()) {
            break;
          }
          const auto& next = entities_.at(*child).view;
          link = next.id;
          if (next.health > 0) {
            successor = link;
          }
        }
        if (!successor) {
          // A previous cut may have left other fragments of the same wave mob.
          const auto fragment = std::ranges::find_if(entities_.active(), [&](auto slot) {
            const auto& piece = entities_.at(slot);
            const auto* parent =
                piece.view.predecessor ? entities_.get(*piece.view.predecessor) : nullptr;
            return piece.root == root && piece.view.health > 0 &&
                   (!parent || parent->view.health == 0);
          });
          if (fragment != entities_.active().end()) {
            successor = entities_.at(*fragment).view.id;
          }
        }
      }
      // Settle the W3 root reward only on its last death.
      if (id == root && successor) {
        auto& promoted = *entities_.get(*successor);
        promoted.view.group = body.group;
        promoted.view.origin_wave = body.origin_wave;
        promoted.provoked = promoted.provoked || entity->provoked;
        for (const auto slot : entities_.active()) {
          auto& child = entities_.at(slot);
          if (child.root == root) {
            child.root = successor;
          }
        }
        promoted.root.reset();
        for (auto& spawn : wave_.plan) {
          if (spawn.entity == id) {
            spawn.entity = successor;
          }
        }
        body.group = Group::segment;
      }
      for (const auto slot : entities_.active()) {
        auto& child = entities_.at(slot);
        if (child.view.predecessor == id) {
          // The following piece leads its own fragment, even when the previous
          // fragment survives. Wave credit still belongs to the original mob.
          child.view.predecessor.reset();
          child.provoked = child.provoked || entity->provoked;
        }
      }
      if (!successor && id == root) {
        body.mob = entity->chain_kind;
      }
    }
    std::optional<PlayerId> credit;
    if (body.group == Group::main_mob && body.origin_wave == wave_.number) {
      --wave_.counts.alive;
      ++wave_.counts.defeated;
    }
    if ((body.group == Group::main_mob || body.group == Group::residual) && source.owner &&
        source.faction == Faction::team) {
      if (auto* entry = player(source.owner->player)) {
        ++entry->view.credited_defeats;
        credit = entry->view.id;
      }
    }
    emit(Defeat{id, body.group, source, credit, body.mob, body.rarity, body.position,
                body.origin_wave});
    if (body.group == Group::player) {
      auto& victim = *player(body.owner->player);
      victim.view.death_position = body.position;
      victim.view.killer = source.mob;
      reap_player(victim, LifeState::waiting);
    } else {
      if (body.group == Group::petal || entity->summon_origin == Petal::egg) {
        detach_petal(id);
      }
      entities_.erase(id);
    }
  }
}

}  // namespace wave::sim
