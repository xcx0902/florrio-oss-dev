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
  return {entity.id, entity.owner, entity.faction};
}

}  // namespace

void Match::move_entities() {
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  const auto& active = entities_.active();
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    Vec2 direction;
    if (entity.projectile) {
      direction = entity.flight_direction;
    } else if (body.group == Group::player) {
      direction = player(body.owner->player)->move;
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
    for (const auto& effect : entity.slows) {
      slow *= effect.multiplier;
    }
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
    const double speed = entity.projectile && rules_.catalog
                             ? rules_.catalog->petal(*body.petal, body.rarity)->projectile_speed
                             : entity.rules.speed_per_second;
    body.velocity = direction * (speed * slow) + entity.knockback;
  }
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    if (body.group == Group::petal && !entity.projectile) {
      continue;
    }
    auto displacement = body.velocity * seconds;
    if (entity.projectile && displacement.length() > entity.range_left) {
      displacement = displacement * (entity.range_left / displacement.length());
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
      if (next != clamped) {
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
      for (std::size_t i = 0; i < owner.view.petals.size(); ++i) {
        if (!owner.view.petals[i].entity) {
          continue;
        }
        bonus += rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i])
                     ->rotation_bonus;
      }
      double slow = 1;
      if (owner.view.body) {
        for (const auto& effect : entities_.get(*owner.view.body)->slows) {
          if (effect.until > tick_) {
            slow *= effect.multiplier;
          }
        }
      }
      if (tick_ != 0) {
        owner.orbit_phase = std::fmod(
            owner.orbit_phase + (rules_.orbit_rad_per_second + bonus) * slow * seconds, turn);
      }
      owner.orbit_updated = tick_;
    }
  }
  for (const auto slot : entities_.active()) {
    auto& petal = entities_.at(slot);
    if (petal.view.group != Group::petal || petal.projectile || petal.ground_web ||
        !petal.view.anchor) {
      continue;
    }
    const auto& body = entities_.get(*petal.view.anchor)->view;
    const auto& owner = *player(petal.view.owner->player);
    const double phase =
        rules_.catalog ? owner.orbit_phase : rules_.orbit_rad_per_second * seconds * tick_;
    const double heading = std::fmod(phase + petal.orbit_offset, turn);
    const Vec2 offset{std::cos(heading), std::sin(heading)};
    const bool rose = rules_.catalog && petal.view.petal == Petal::rose;
    const double radius =
        rules_.orbit_radius * (owner.defend            ? rules_.defend_orbit_multiplier
                               : owner.attack && !rose ? rules_.attack_orbit_multiplier
                                                       : 1);
    petal.view.heading_rad = heading;
    petal.view.position =
        clamp_center(body.position + offset * radius, rules_.arena_radius, petal.view.radius);
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
  detach_petal(id);
  entities_.erase(id);
}

void Match::update_effects() {
  if (!rules_.catalog) {
    return;
  }
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  const auto active = entities_.active();
  // Queue effects before contacts; useful healing is consumed when impacts are applied.
  for (const auto slot : active) {
    auto* entity = entities_.get(entities_.at(slot).view.id);
    if (!entity || entity->projectile || entity->ground_web || entity->view.group != Group::petal ||
        entity->view.health <= 0) {
      continue;
    }
    const auto id = entity->view.id;
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
      summon.mob = Mob::beetle;
      summon.rarity = entity->view.rarity;
      summon.owner = entity->view.owner;
      summon.position = entity->view.position;
      // Copy before pool insertion: insert may move its backing storage.
      const auto body = rules_.catalog->mob(Mob::beetle, summon.rarity)->body;
      consume_petal(id);
      (void)add_entity(summon, body);
    } else if (owner.attack && !owner.defend && tick_ >= entity->born_tick + delay &&
               (definition.effect == catalog::Effect::projectile ||
                definition.effect == catalog::Effect::poison_projectile ||
                definition.effect == catalog::Effect::web)) {
      // Four-shot directions are stable, seeded by the orbit phase; absolute aiming is
      // reconstructed.
      const double cluster_offset =
          definition.particles > 1
              ? (double(entity->particle_index) - (definition.particles - 1) / 2.0) * .12
              : 0;
      const double heading =
          entity->view.heading_rad - cluster_offset +
          (definition.particles > 1 ? entity->particle_index * std::numbers::pi / 2 : 0);
      entity->projectile = true;
      entity->flight_direction = {std::cos(heading), std::sin(heading)};
      entity->range_left = definition.range;
      entity->view.anchor.reset();
      detach_petal(id);
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
    if (entity.ground_web) {
      const auto& definition = *rules_.catalog->petal(Petal::web, entity.view.rarity);
      if (std::chrono::duration<double>(rules_.timing.step).count() * (tick_ - entity.born_tick) >=
          definition.duration_seconds) {
        consume_petal(id);
      }
    } else if (entity.projectile &&
               (entity.range_left <= 0 || entity.spent || entity.view.health <= 0)) {
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
    } else if (entity.view.group == Group::summon && entity.view.owner) {
      const auto* definition = rules_.catalog->petal(Petal::egg, entity.view.rarity);
      if (std::chrono::duration<double>(rules_.timing.step).count() * (tick_ - entity.born_tick) >=
          definition->duration_seconds) {
        entities_.erase(id);
      }
    }
  }
}

void Match::resolve_contacts() {
  const auto attack = [this](detail::Entity& source, const detail::Entity& target) {
    if (source.ready_tick > tick_ || source.ground_web || target.ground_web || source.spent) {
      return;
    }
    const auto& pair = interaction(source.view.faction, target.view.faction);
    const auto* definition = rules_.catalog && source.view.petal
                                 ? rules_.catalog->petal(*source.view.petal, source.view.rarity)
                                 : nullptr;
    if (definition && definition->effect == catalog::Effect::leaf && pair.heal && target.view.mob &&
        target.view.health < target.view.max_health) {
      Impact hit{target.view.id, source_of(source.view), HealthKind::heal,
                 definition->friendly_mob_heal};
      hit.consume_source = true;
      impacts_.push_back(hit);
    } else if (pair.damage && source.rules.contact_damage > 0) {
      impacts_.push_back({target.view.id, source_of(source.view), HealthKind::contact,
                          source.rules.contact_damage, source.rules.poison_per_tick,
                          source.rules.poison_ticks});
    } else if (pair.heal && source.rules.contact_heal > 0 &&
               target.view.health < target.view.max_health) {
      impacts_.push_back(
          {target.view.id, source_of(source.view), HealthKind::heal, source.rules.contact_heal});
    } else {
      return;
    }
    if (definition && definition->effect == catalog::Effect::honey && pair.damage) {
      auto& hit = impacts_.back();
      hit.slow_multiplier = definition->slow_multiplier;
      hit.slow_ticks = rules_.timing.ticks_ceil(
          Microseconds(static_cast<Microseconds::rep>(definition->duration_seconds * 1000000)));
    }
    if (source.projectile) {
      source.spent = true;
    }
    source.ready_tick = tick_ + source.rules.contact_cooldown;
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
  const auto apply = [this](detail::Entity& target, const DamageSource& source, HealthKind kind,
                            double amount) {
    auto& body = target.view;
    if (body.health <= 0) {
      return false;
    }
    const auto& pair = interaction(source.faction, body.faction);
    if (kind == HealthKind::heal && pair.heal) {
      amount = std::min(amount, body.max_health - body.health);
      body.health += amount;
    } else if (kind != HealthKind::heal && pair.damage) {
      amount = std::min(amount, body.health);
      body.health -= amount;
      if (body.health == 0) {
        target.fatal_hit = source;
      }
    } else {
      return false;
    }
    if (amount <= 0) {
      return false;
    }
    emit(HealthChange{body.id, source, kind, amount, body.health});
    return true;
  };

  for (const auto slot : entities_.active()) {
    auto& entity = entities_.at(slot);
    for (auto& poison : entity.poisons) {
      apply(entity, poison.source, HealthKind::poison, poison.amount);
      --poison.remaining;
    }
    std::erase_if(entity.poisons,
                  [](const detail::Poison& poison) { return poison.remaining == 0; });
    entity.view.cooldown_ticks = entity.ready_tick > tick_ ? entity.ready_tick - tick_ : 0;
  }
  for (const auto& hit : impacts_) {
    auto* target = entities_.get(hit.target);
    if (!target || !apply(*target, hit.source, hit.kind, hit.amount)) {
      continue;
    }
    if (hit.consume_source) {
      consume_petal(hit.source.entity);
    }
    if (target->view.health > 0 && hit.slow_ticks > 0) {
      const auto prior = std::ranges::find(target->slows, hit.source, &detail::Slow::source);
      const detail::Slow slow{hit.source, hit.slow_multiplier, tick_ + hit.slow_ticks};
      if (prior == target->slows.end()) {
        target->slows.push_back(slow);
      } else {
        *prior = slow;
      }
    }
    if (target->view.health > 0 && hit.poison_ticks > 0 && hit.poison_per_tick > 0) {
      const auto prior = std::ranges::find(target->poisons, hit.source, &detail::Poison::source);
      const detail::Poison poison{hit.source, hit.poison_per_tick, hit.poison_ticks};
      if (prior == target->poisons.end()) {
        target->poisons.push_back(poison);
      } else {
        *prior = poison;
      }
    }
  }
  impacts_.clear();
}

void Match::reap_deaths() {
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
    const auto& body = entity->view;
    const auto& source = *entity->fatal_hit;
    std::optional<PlayerId> credit;
    if (body.group == Group::main_mob && body.origin_wave == wave_.number) {
      --wave_.counts.alive;
      ++wave_.counts.defeated;
      if (source.owner && source.faction == Faction::team) {
        if (auto* entry = player(source.owner->player)) {
          ++entry->view.credited_defeats;
          credit = entry->view.id;
        }
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
