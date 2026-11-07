#include "sim/match.hpp"

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
    if (body.group == Group::player) {
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
    body.velocity = direction * entity.rules.speed_per_second + entity.knockback;
  }
  for (const auto slot : active) {
    auto& entity = entities_.at(slot);
    auto& body = entity.view;
    if (body.group == Group::petal) {
      continue;
    }
    const auto next = body.position + body.velocity * seconds;
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
    body.position = clamped;
  }
}

void Match::update_orbits() {
  constexpr double turn = 2 * std::numbers::pi;
  const double seconds = std::chrono::duration<double>(rules_.timing.step).count();
  for (const auto slot : entities_.active()) {
    auto& petal = entities_.at(slot);
    if (petal.view.group != Group::petal) {
      continue;
    }
    const auto& body = entities_.get(*petal.view.anchor)->view;
    const double heading =
        std::fmod(rules_.orbit_rad_per_second * seconds * tick_ + petal.orbit_offset, turn);
    const Vec2 offset{std::cos(heading), std::sin(heading)};
    petal.view.heading_rad = heading;
    petal.view.position = clamp_center(body.position + offset * rules_.orbit_radius,
                                       rules_.arena_radius, petal.view.radius);
  }
}

void Match::resolve_contacts() {
  const auto attack = [this](detail::Entity& source, const detail::Entity& target) {
    if (source.ready_tick > tick_) {
      return;
    }
    const auto& pair = interaction(source.view.faction, target.view.faction);
    if (pair.damage && source.rules.contact_damage > 0) {
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
      if (pair.push && first.view.group != Group::petal && second.view.group != Group::petal) {
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
    if (target && apply(*target, hit.source, hit.kind, hit.amount) && target->view.health > 0 &&
        hit.poison_ticks > 0 && hit.poison_per_tick > 0) {
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
    emit(Defeat{id, body.group, source, credit});
    if (body.group == Group::player) {
      reap_player(*player(body.owner->player), LifeState::waiting);
    } else {
      if (body.group == Group::petal) {
        auto& owner = *player(body.owner->player);
        for (std::size_t index = 0; index < owner.view.petals.size(); ++index) {
          if (owner.view.petals[index].entity == id) {
            owner.view.petals[index] = {std::nullopt, rules_.petal_reload};
            owner.petal_ready[index] = tick_ + rules_.petal_reload;
            break;
          }
        }
      }
      entities_.erase(id);
    }
  }
}

}  // namespace wave::sim
