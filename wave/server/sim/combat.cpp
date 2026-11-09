#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <limits>
#include <numbers>

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

DamageSource source_of(const EntityView& entity) {
  return {entity.id, entity.owner, entity.faction, entity.damage_origin};
}

}  // namespace

void Match::move_entities() {
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  const auto& active = entities_.active();
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
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
    } else if (rules_.catalog && body.mob) {
      direction = mob_direction(entity);
    } else if (entity.rules.speed_per_second > 0 && body.group != Group::petal) {
      double closest = std::numeric_limits<double>::infinity();
      for (const auto candidate : active) {
        const auto& target = entities_.at(candidate).view;
        if (body.faction == target.faction || target.group == Group::petal) {
          continue;
        }
        const Vec2 delta = target.position - body.position;
        const double distance = delta.length();
        if (distance < closest) {
          closest = distance;
          direction = distance > 0 ? delta * (1 / distance) : Vec2{};
        }
      }
    }
    if (direction != Vec2{}) {
      body.heading_rad = std::atan2(direction.y, direction.x);
    }
    double slow = 1;
    std::erase_if(entity.slows,
                  [this](const detail::Slow& effect) { return tick_ >= effect.until; });
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
      if (!area.ground_web || area.view.faction == body.faction || body.group == Group::petal ||
          body.mob == Mob::spider) {
        continue;
      }
      const auto& definition = *rules_.catalog->petal(Petal::web, area.view.rarity);
      if (seconds * (tick_ - area.born_tick) >= definition.duration_seconds) {
        continue;
      }
      if (overlaps(body.position, body.radius, area.view.position, area.view.radius)) {
        slow *= rules_.catalog->petal(Petal::web, area.view.rarity)->slow_multiplier;
        break;
      }
    }
    double speed =
        entity.projectile && rules_.catalog
            ? (entity.flight_speed > 0
                   ? entity.flight_speed
                   : rules_.catalog->petal(*body.petal, body.rarity)->projectile_speed)
            : entity.rules.speed_per_second;
    if (entity.projectile && body.petal == Petal::missile && body.faction == Faction::team) {
      const auto age = (tick_ - entity.born_tick) * seconds;
      speed += 400 * std::min(.25, age);
    }
    body.velocity =
        entity.stun_until > tick_ ? Vec2{} : direction * (speed * slow) + entity.knockback;
  }
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    if ((body.group == Group::petal && !entity.projectile) || entity.predecessor) {
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
      } else {
        const Vec2 normal = clamped * (1 / distance);
        const double outward = normal.x * entity.knockback.x + normal.y * entity.knockback.y;
        entity.knockback = entity.knockback - normal * std::max(0.0, outward);
      }
    }
    entity.knockback = entity.knockback * rules_.knockback_retention;
    body.velocity = (clamped - body.position) * (1 / seconds);
    if (entity.projectile) {
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
  if (rules_.catalog) {
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
        const auto* p =
            rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
        bonus += p->rotation_bonus;
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
  }
  for (const auto slot : entities_.active()) {
    auto& petal = entities_.at(slot);
    if (petal.view.group != Group::petal || petal.projectile || petal.held || petal.ground_web ||
        !petal.view.anchor) {
      continue;
    }
    const auto& body = entities_.get(*petal.view.anchor)->view;
    const auto& owner = *player(petal.view.owner->player);
    const double phase =
        rules_.catalog ? owner.orbit_phase : rules_.orbit_rad_per_second * seconds * tick_;
    bool third_eye = false;
    if (rules_.catalog) {
      for (std::size_t i = 0; i < owner.view.loadout.size(); ++i) {
        third_eye |=
            owner.view.loadout[i] == Petal::third_eye && owner.view.petals[i].entity.has_value();
      }
    }
    if (rules_.catalog) {
      double total = 0, before = 0;
      for (std::size_t i = 0; i < owner.view.loadout.size(); ++i) {
        const auto* p =
            rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
        if (!p || p->mechanics.hidden) {
          continue;
        }
        const double weight =
            p->kind == Petal::light || p->kind == Petal::pollen ? p->particles : 1;
        if (std::ranges::find(owner.view.petals[i].entities, petal.view.id) !=
            owner.view.petals[i].entities.end()) {
          before = total;
          if (weight > 1) {
            before += petal.particle_index;
          }
        }
        total += weight;
      }
      petal.orbit_offset = total > 0 ? turn * before / total : 0;
    }
    const double heading =
        std::fmod((third_eye ? owner.aim_angle : phase) + petal.orbit_offset, turn);
    const Vec2 offset{std::cos(heading), std::sin(heading)};
    double radius = rules_.orbit_radius * (owner.defend   ? rules_.defend_orbit_multiplier
                                           : owner.attack ? rules_.attack_orbit_multiplier
                                                          : 1);
    Vec2 cluster_offset;
    if (rules_.catalog) {
      const auto& p = *rules_.catalog->petal(*petal.view.petal, petal.view.rarity);
      radius = owner.defend   ? p.mechanics.defend_distance
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
        const double angle = heading + turn * petal.particle_index / p.particles;
        cluster_offset = Vec2{std::cos(angle), std::sin(angle)} *
                         (p.body.radius * .75 / std::sin(std::numbers::pi / p.particles));
      }
    }
    petal.view.heading_rad = heading;
    petal.view.position =
        clamp_center(body.position + offset * radius + cluster_offset, rules_.arena_radius,
                     petal.view.radius);
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
    if (slot.entities.empty()) {
      const Tick reload = reload_ticks(owner->view.loadout[i], owner->view.loadout_rarities[i]);
      slot.reload_ticks = slot.reload_total_ticks = reload;
      owner->petal_ready[i] = tick_ + reload;
    }
    return;
  }
}

void Match::consume_petal(EntityId id) {
  flush_sponge(id);
  detach_petal(id);
  entities_.erase(id);
}

void Match::update_effects() {
  if (!rules_.catalog) {
    return;
  }
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  std::vector<EntityId> active;
  for (auto slot : entities_.active()) {
    active.push_back(entities_.at(slot).view.id);
  }
  // Queue effects before contacts; useful healing is consumed when impacts are applied.
  for (const auto id : active) {
    auto* entity = entities_.get(id);
    if (!entity || entity->projectile || entity->ground_web || entity->view.group != Group::petal ||
        entity->view.health <= 0) {
      continue;
    }
    const auto& definition = *rules_.catalog->petal(*entity->view.petal, entity->view.rarity);
    auto& owner = *player(entity->view.owner->player);
    if (owner.view.life != *entity->view.owner || !owner.view.body) {
      continue;
    }
    const auto owner_body = *owner.view.body;
    const auto origin = entities_.get(owner_body)->view.position;
    const auto source = source_of(entity->view);
    const Tick delay = rules_.timing.ticks_ceil(
        Microseconds(static_cast<Microseconds::rep>(definition.activation_seconds * 1000000)));
    if (definition.effect == catalog::Effect::leaf) {
      impacts_.push_back(
          {owner_body, source, HealthKind::heal, definition.passive_heal_per_second * seconds});
    } else if (definition.effect == catalog::Effect::rose && tick_ >= entity->born_tick + delay) {
      // Owner first, then nearest teammate; no consumption at full health or outside range.
      std::optional<EntityId> target;
      double closest = definition.range;
      for (const auto candidate : entities_.active()) {
        const auto& body = entities_.at(candidate).view;
        if (body.group != Group::player || body.faction != entity->view.faction ||
            body.health <= 0 || body.health >= body.max_health) {
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
      if (target) {
        Impact hit{*target, source, HealthKind::heal, definition.heal};
        hit.consume_source = true;
        impacts_.push_back(hit);
      }
    } else if (definition.effect == catalog::Effect::summon && tick_ >= entity->born_tick + delay) {
      EntityView summon;
      summon.group = Group::summon;
      summon.faction = Faction::team;
      summon.mob = definition.summon_mob;
      summon.rarity = definition.summon_rarity;
      summon.owner = entity->view.owner;
      summon.position = entity->view.position;
      // Copy before pool insertion: insert may move its backing storage.
      const auto lifetime = rules_.timing.ticks_ceil(
          Microseconds(static_cast<Microseconds::rep>(definition.duration_seconds * 1e6)));
      consume_petal(id);
      const auto child =
          spawn_mob(*summon.mob, summon.rarity, summon.position, Group::summon, summon.owner);
      entities_.get(child)->summon_origin = Petal::egg;
      entities_.get(child)->expires = tick_ + lifetime;
    } else if (owner.attack && !owner.defend && tick_ >= entity->born_tick + delay &&
               (definition.effect == catalog::Effect::projectile ||
                definition.effect == catalog::Effect::poison_projectile ||
                definition.effect == catalog::Effect::web)) {
      const auto launch = [&](detail::Entity& shot, double heading, double range, Tick duration) {
        shot.projectile = true;
        shot.flight_direction = {std::cos(heading), std::sin(heading)};
        shot.range_left = range;
        shot.born_tick = tick_;
        shot.expires = tick_ + duration;
        shot.view.anchor.reset();
        shot.view.heading_rad = heading;
      };
      if (definition.kind == Petal::peas || definition.kind == Petal::grapes) {
        // World Peas replace the equipped cluster with four radial children.
        const double phase = 2 * std::numbers::pi *
                             (draw(DrawPurpose::projectile_phase) / 4294967296.0);
        auto shot = entity->view;
        const auto center = shot.position;
        shot.split_particle = true;
        const auto duration = rules_.timing.ticks_ceil(std::chrono::seconds(1));
        consume_petal(id);
        for (unsigned i = 0; i < 4; ++i) {
          const double heading = phase + i * std::numbers::pi / 2;
          const auto direction = Vec2{std::cos(heading), std::sin(heading)};
          shot.position = center + direction * (std::sqrt(72.) / 5);
          const auto child = add_entity(shot, petal_body(definition.kind, shot.rarity));
          launch(*entities_.get(child), heading, definition.projectile_speed, duration);
        }
      } else {
        const bool missile = definition.kind == Petal::missile;
        const auto duration = rules_.timing.ticks_ceil(
            std::chrono::milliseconds(missile ? 1500 : 2000));
        launch(*entity, entity->view.heading_rad, missile ? 160 : definition.range, duration);
        detach_petal(id);
      }
    }
  }
}

void Match::finish_projectiles() {
  if (!rules_.catalog) {
    return;
  }
  const auto active = entities_.active();
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    const auto id = entity.view.id;
    if (entity.spent && !entity.projectile && !entity.ground_web) {
      consume_petal(id);
    } else if (entity.ground_web) {
      const auto& definition = *rules_.catalog->petal(Petal::web, entity.view.rarity);
      if (std::chrono::duration<double>(rules_.timing.step).count() * (tick_ - entity.born_tick) >=
          definition.duration_seconds) {
        consume_petal(id);
      }
    } else if (entity.projectile &&
               (entity.range_left <= 0 || entity.spent || entity.view.health <= 0 ||
                (entity.expires && tick_ >= entity.expires))) {
      if (entity.view.petal == Petal::web) {
        entity.projectile = false;
        entity.ground_web = true;
        entity.spent = false;
        entity.born_tick = tick_;
        entity.view.velocity = {};
        entity.view.radius = rules_.catalog->petal(Petal::web, entity.view.rarity)->area_radius;
        entity.view.health = entity.view.max_health = 1;
        entity.rules.contact_damage = 0;
        entity.poisons.clear();
        entity.fatal_hit.reset();
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
    if (source.ready_tick > tick_ || source.ground_web || target.ground_web || source.spent ||
        source.view.health <= 0 || target.view.health <= 0) {
      return;
    }
    if (rules_.catalog &&
        (source.view.mob == Mob::fire_ant_burrow || target.view.mob == Mob::fire_ant_burrow ||
         (source.view.mob == Mob::ant_hole && source.view.rarity >= Rarity::rare) ||
         (target.view.mob == Mob::ant_hole && target.view.rarity >= Rarity::rare))) {
      return;
    }
    const auto& pair = interaction(source.view.faction, target.view.faction);
    const auto* definition = rules_.catalog && source.view.petal
                                 ? rules_.catalog->petal(*source.view.petal, source.view.rarity)
                                 : nullptr;
    const auto* target_definition =
        rules_.catalog && target.view.petal
            ? rules_.catalog->petal(*target.view.petal, target.view.rarity)
            : nullptr;
    if ((definition && definition->mechanics.hidden) ||
        (target_definition && target_definition->mechanics.hidden)) {
      return;
    }
    if (definition && definition->effect == catalog::Effect::leaf && pair.heal && target.view.mob &&
        target.view.health < target.view.max_health) {
      Impact hit{target.view.id, source_of(source.view), HealthKind::heal,
                 definition->friendly_mob_heal};
      hit.consume_source = true;
      impacts_.push_back(hit);
    } else if (pair.damage && definition && definition->effect == catalog::Effect::lightning &&
               target.view.group != Group::petal) {
      chain_attack(target.view.id, source_of(source.view), definition->mechanics.chain_damage,
                   definition->mechanics.bounces, 40);
      source.spent = true;

    } else if (pair.damage && source.rules.contact_damage > 0) {
      impacts_.push_back({target.view.id, source_of(source.view), HealthKind::contact,
                          source.rules.contact_damage, source.rules.poison_per_tick,
                          source.rules.poison_ticks});
      if (definition && definition->mechanics.damage_ratio > 0) {
        impacts_.back().amount += std::min(definition->mechanics.damage_limit,
                                           target.view.health * definition->mechanics.damage_ratio);
      }
    } else if (pair.heal && source.rules.contact_heal > 0 &&
               target.view.health < target.view.max_health) {
      impacts_.push_back(
          {target.view.id, source_of(source.view), HealthKind::heal, source.rules.contact_heal});
    } else {
      return;
    }
    if (definition &&
        (definition->effect == catalog::Effect::honey ||
         definition->effect == catalog::Effect::pincer) &&
        pair.damage) {
      auto& hit = impacts_.back();
      hit.slow_multiplier = definition->slow_multiplier;
      hit.attack_slow = definition->effect == catalog::Effect::honey;
      hit.slow_ticks = rules_.timing.ticks_ceil(
          Microseconds(static_cast<Microseconds::rep>(definition->duration_seconds * 1000000)));
    }
    if (definition && definition->effect == catalog::Effect::dandelion && pair.damage) {
      impacts_.back().heal_block_ticks =
          rules_.timing.ticks_ceil(Microseconds(static_cast<Microseconds::rep>(
              definition->duration_seconds * (target.view.group == Group::player ? .5 : 1) * 1e6)));
    }
    if (pair.damage && definition &&
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
    double attack_scale = 1;
    for (const auto& slow : source.slows) {
      if (slow.slows_attacks && slow.until > tick_) {
        attack_scale *= slow.multiplier;
      }
    }
    source.ready_tick =
        tick_ + static_cast<Tick>(std::ceil(source.rules.contact_cooldown / attack_scale));
  };

  const auto& active = entities_.active();
  std::vector<Vec2> positions;
  positions.reserve(active.size());
  for (const auto slot : active) {
    positions.push_back(entities_.at(slot).view.position);
  }
  for (std::size_t a = 0; a < active.size(); ++a) {
    auto& first = entities_.at(active[a]);
    for (std::size_t b = a + 1; b < active.size(); ++b) {
      auto& second = entities_.at(active[b]);
      const Vec2 delta = positions[b] - positions[a];
      const double distance = delta.length();
      const double depth = first.view.radius + second.view.radius - distance;
      if (depth <= 0) {
        continue;
      }
      attack(first, second);
      attack(second, first);

      const auto& pair = interaction(first.view.faction, second.view.faction);
      if (pair.push && !first.ground_web && !second.ground_web &&
          first.view.mob != Mob::fire_ant_burrow && second.view.mob != Mob::fire_ant_burrow &&
          !(first.view.mob == Mob::ant_hole && first.view.rarity >= Rarity::rare) &&
          !(second.view.mob == Mob::ant_hole && second.view.rarity >= Rarity::rare) &&
          first.view.group != Group::petal && second.view.group != Group::petal) {
        const Vec2 normal = distance > 0 ? delta * (1 / distance) : Vec2{1, 0};
        const Vec2 shift = normal * (depth / 2);
        first.view.position =
            clamp_center(first.view.position - shift, rules_.arena_radius, first.view.radius);
        second.view.position =
            clamp_center(second.view.position + shift, rules_.arena_radius, second.view.radius);
        if (pair.damage) {
          const Vec2 impulse = normal * rules_.contact_knockback_speed;
          first.knockback = first.knockback - impulse;
          second.knockback += impulse;
        }
      }
    }
  }
}

void Match::apply_impacts() {
  for (const auto slot : entities_.active()) {
    auto& entity = entities_.at(slot);
    for (auto& poison : entity.poisons) {
      (void)apply_health(entity.view.id, poison.source, HealthKind::poison, poison.amount);
      --poison.remaining;
    }
    std::erase_if(entity.poisons,
                  [](const detail::Poison& poison) { return poison.remaining == 0; });
    entity.view.poisoned = !entity.poisons.empty();
    entity.view.slowed = !entity.slows.empty();
    entity.view.heal_blocked = entity.heal_block_until > tick_;
    entity.view.cooldown_ticks = entity.ready_tick > tick_ ? entity.ready_tick - tick_ : 0;
  }
  for (const auto& hit : impacts_) {
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
      const detail::Poison poison{hit.source, hit.poison_per_tick, hit.poison_ticks};
      if (!rules_.catalog) {
        const auto prior = std::ranges::find(target->poisons, hit.source, &detail::Poison::source);
        if (prior == target->poisons.end()) {
          target->poisons.push_back(poison);
        } else {
          *prior = poison;
        }
      } else {
        const double remaining = target->poisons.empty() ? 0
                                                         : target->poisons.front().amount *
                                                               target->poisons.front().remaining;
        if (hit.poison_per_tick * hit.poison_ticks >= remaining) {
          target->poisons = {poison};
        }
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
    auto body = entity->view;
    const auto source = entity->fatal_hit.value_or(DamageSource{});
    if (entity->chain_kind) {
      const auto root = entity->root.value_or(id);
      std::optional<EntityId> successor;
      for (const auto slot : entities_.active()) {
        const auto& child = entities_.at(slot);
        if (child.root == root && child.view.health > 0) {
          successor = child.view.id;
          break;
        }
      }
      // A severed chain keeps moving; settle the W3 root reward only on its last death.
      if (id == root && successor) {
        auto& promoted = *entities_.get(*successor);
        promoted.view.group = body.group;
        promoted.view.origin_wave = body.origin_wave;
        promoted.root.reset();
        promoted.predecessor.reset();
        promoted.provoked = entity->provoked;
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
        if (child.predecessor == id) {
          child.predecessor.reset();
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
      reap_player(*player(body.owner->player), LifeState::waiting);
    } else {
      if (body.group == Group::petal) {
        detach_petal(id);
      }
      entities_.erase(id);
    }
  }
}

}  // namespace wave::sim
