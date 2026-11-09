#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <numbers>

namespace wave::sim {
namespace {
Tick ticks(const Rules& rules, double seconds) {
  return rules.timing.ticks_ceil(
      Microseconds(static_cast<Microseconds::rep>(std::ceil(seconds * 1e6))));
}
DamageSource source_of(const EntityView& view) {
  return {view.id, view.owner, view.faction, view.damage_origin};
}
}

void Match::refresh_passives() {
  if (!rules_.catalog) {
    return;
  }
  for (auto& owner : players_) {
    owner.view.vision_multiplier = owner.view.pickup_multiplier = 1;
    if (!owner.view.body) {
      continue;
    }
    auto& body = *entities_.get(*owner.view.body);
    double speed = 1, size = 1, damage = rules_.player.contact_damage;
    for (std::size_t i = 0; i < owner.view.petals.size(); ++i) {
      if (!owner.view.petals[i].entity) {
        continue;
      }
      const auto& p = *rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
      owner.view.vision_multiplier =
          std::max(owner.view.vision_multiplier, p.mechanics.vision_multiplier);
      owner.view.pickup_multiplier =
          std::max(owner.view.pickup_multiplier, p.mechanics.pickup_multiplier);
      speed *= p.mechanics.speed_multiplier;
      size *= p.mechanics.size_multiplier;
      damage = std::max(damage, p.mechanics.body_damage);
    }
    for (std::size_t i = 0; i < owner.view.loadout.size(); ++i) {
      const auto* p = rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
      if (p && p->effect == catalog::Effect::starfish &&
          body.view.health < body.view.max_health * .5) {
        impacts_.push_back({body.view.id, source_of(body.view), HealthKind::heal,
                            p->passive_heal_per_second *
                                std::chrono::duration<double>(rules_.timing.step).count()});
      }
    }
    body.rules.speed_per_second = rules_.player.speed_per_second * speed;
    body.rules.contact_damage = damage;
    body.view.radius = rules_.player.radius * size;
    body.view.position = clamp_center(body.view.position, rules_.arena_radius, body.view.radius);
  }
}

void Match::chain_attack(EntityId first, const DamageSource& source, double damage,
                         unsigned bounces, double range) {
  std::vector<EntityId> visited;
  auto current = std::optional{first};
  const auto* emitter = entities_.get(source.entity);
  std::optional<Vec2> from = emitter ? std::optional{emitter->view.position} : std::nullopt;
  for (unsigned hop = 0; current && hop <= bounces; ++hop) {
    const auto* hit = entities_.get(*current);
    if (!hit || hit->view.group == Group::petal || hit->view.health <= 0 ||
        hit->view.faction == source.faction) {
      break;
    }
    const auto intended = *current;
    const auto position = hit->view.position;
    visited.push_back(intended);
    if (hit->view.group == Group::player && hit->view.owner) {
      const auto* owner = player(hit->view.owner->player);
      for (std::size_t i = 0; i < owner->view.loadout.size(); ++i) {
        if (owner->view.loadout[i] == Petal::magnet && owner->view.petals[i].entity) {
          current = owner->view.petals[i].entity;
          visited.push_back(*current);
          break;
        }
      }
    }
    auto& struck = *entities_.get(*current);
    if (from && *from != struck.view.position) {
      emit(LightningArc{*from, struck.view.position});
    }
    from = struck.view.position;
    struck.stun_until = tick_ + ticks(rules_, .1);
    struck.view.velocity = {};
    impacts_.push_back({*current, source, HealthKind::contact, damage});
    current.reset();
    double nearest = range;
    for (const auto slot : entities_.active()) {
      const auto& target = entities_.at(slot).view;
      if (target.faction == source.faction || target.health <= 0 || target.group == Group::petal ||
          std::ranges::find(visited, target.id) != visited.end()) {
        continue;
      }
      const double distance = (target.position - position).length();
      if (distance <= nearest) {
        nearest = distance;
        current = target.id;
      }
    }
  }
}

double Match::apply_health(EntityId id, const DamageSource& source, HealthKind kind, double amount,
                           bool secondary) {
  auto* target = entities_.get(id);
  if (!target || target->view.health <= 0 || amount <= 0) {
    return 0;
  }
  if (kind != HealthKind::heal && kind != HealthKind::shield &&
      (target->view.mob == Mob::fire_ant_burrow ||
       (target->view.mob == Mob::ant_hole && target->view.rarity >= Rarity::rare))) {
    return 0;
  }
  auto& body = target->view;
  if (kind == HealthKind::shield) {
    if (source.faction != body.faction) {
      return 0;
    }
    const auto old = body.shield;
    body.shield = std::max(body.shield, amount);
    target->shield_until = tick_ + ticks(rules_, 10);
    return body.shield - old;
  }
  if (kind == HealthKind::heal) {
    if (source.faction != body.faction || target->heal_block_until > tick_) {
      return 0;
    }
    amount = std::min(amount, body.max_health - body.health);
    body.health += amount;
  } else {
    if (source.faction == body.faction && source.entity != id && kind != HealthKind::deferred) {
      return 0;
    }
    const double absorbed = std::min(body.shield, amount);
    body.shield -= absorbed;
    const double accepted = amount;
    amount -= absorbed;
    if (!secondary && body.group == Group::player && rules_.catalog && body.owner) {
      const auto& owner = *player(body.owner->player);
      std::optional<EntityId> sponge;
      double period = 0;
      for (std::size_t i = 0; i < owner.view.petals.size(); ++i) {
        const auto& slot = owner.view.petals[i];
        const auto* p =
            rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i]);
        if (slot.entity && p && p->mechanics.sponge_seconds > period) {
          sponge = slot.entity;
          period = p->mechanics.sponge_seconds;
        }
      }
      if (sponge && amount > 0) {
        target->deferred.push_back(
            {source, *sponge, amount * .9, std::max<Tick>(1, ticks(rules_, period))});
        amount *= .1;
      }
    }
    amount = std::min(amount, body.health);
    body.health -= amount;
    if (body.health == 0) {
      target->fatal_hit = source;
    }
    if (amount > 0 && !secondary) {
      if (body.mob && *body.mob != Mob::sandstorm && *body.mob != Mob::bubble) {
        const auto ai = rules_.catalog ? rules_.catalog->mob(*body.mob, body.rarity)->ai
                                       : catalog::MobAI::chase;
        if (ai != catalog::MobAI::passive || kind == HealthKind::radiation) {
          target->provoked = true;
        }
        EntityId attacker = source.instigator.value_or(source.entity);
        if (source.owner) {
          const auto* owner = player(source.owner->player);
          if (owner && owner->view.life == *source.owner && owner->view.body) {
            attacker = *owner->view.body;
          }
        }
        if (target->provoked) {
          target->target = attacker;
        }
        // The dated Worker Ant page describes retaliation when another ant is hit.
        if (body.mob == Mob::baby_ant || body.mob == Mob::worker_ant ||
            body.mob == Mob::soldier_ant || body.mob == Mob::queen_ant ||
            body.mob == Mob::ant_hole) {
          for (const auto slot : entities_.active()) {
            auto& ally = entities_.at(slot);
            if (ally.view.mob == Mob::worker_ant && ally.view.faction == body.faction &&
                ally.view.health > 0 && (ally.view.position - body.position).length() <= 60) {
              ally.provoked = true;
              ally.target = attacker;
            }
          }
        }
        if (body.mob == Mob::ant_hole) {
          target->action_ready = tick_;
        }
      }
      if (body.group == Group::player && body.owner && rules_.catalog) {
        double reflect = 0;
        const auto& owner = *player(body.owner->player);
        for (std::size_t i = 0; i < owner.view.petals.size(); ++i) {
          if (owner.view.petals[i].entity) {
            reflect += rules_.catalog->petal(owner.view.loadout[i], owner.view.loadout_rarities[i])
                           ->mechanics.reflection;
          }
        }
        auto attacker_id = source.instigator.value_or(source.entity);
        if (source.owner) {
          const auto* owner = player(source.owner->player);
          if (owner && owner->view.life == *source.owner && owner->view.body) {
            attacker_id = *owner->view.body;
          }
        }
        const auto* attacker = entities_.get(attacker_id);
        if (attacker && reflect > 0) {
          const double flower_factor = attacker->view.group == Group::player ? .25 : 1;
          (void)apply_health(attacker_id, source_of(body), HealthKind::reflected,
                             amount * reflect * flower_factor, true);
        }
      }
      const auto* attacker = entities_.get(source.entity);
      if (attacker && rules_.catalog) {
        if (attacker->view.petal && attacker->view.owner) {
          const auto& p = *rules_.catalog->petal(*attacker->view.petal, attacker->view.rarity);
          if (p.mechanics.heal_ratio > 0) {
            auto* owner = player(attacker->view.owner->player);
            if (owner && owner->view.life == *attacker->view.owner && owner->view.body) {
              (void)apply_health(*owner->view.body, source, HealthKind::heal,
                                 amount * p.mechanics.heal_ratio, true);
            }
          }
        } else if (attacker->view.mob) {
          const auto& m = *rules_.catalog->mob(*attacker->view.mob, attacker->view.rarity);
          if (m.lifesteal > 0) {
            (void)apply_health(source.entity, source, HealthKind::heal,
                               std::min(amount, m.lifesteal), true);
          }
        }
      }
    }
    if (amount > 0) {
      emit(HealthChange{id, source, kind, amount, body.health});
    }
    return accepted;
  }
  if (amount > 0) {
    emit(HealthChange{id, source, kind, amount, body.health});
  }
  return amount;
}

void Match::flush_sponge(EntityId id) {
  for (const auto slot : entities_.active()) {
    auto& e = entities_.at(slot);
    auto debts = std::move(e.deferred);
    e.deferred.clear();
    for (const auto& debt : debts) {
      if (debt.sponge == id) {
        (void)apply_health(e.view.id, debt.source, HealthKind::deferred, debt.remaining, true);
      } else {
        e.deferred.push_back(debt);
      }
    }
  }
}

void Match::update_special_effects() {
  if (!rules_.catalog) {
    return;
  }
  const double dt = std::chrono::duration<double>(rules_.timing.step).count();
  const auto active = entities_.active();
  for (const auto slot : active) {
    auto* e = entities_.get(entities_.at(slot).view.id);
    if (!e) {
      continue;
    }
    if (e->shield_until <= tick_) {
      e->view.shield = 0;
    }
    // Removing or breaking a sponge settles every outstanding debt on its owner.
    auto debts = std::move(e->deferred);
    const auto target = e->view.id;
    for (auto& debt : debts) {
      const auto* sponge = entities_.get(debt.sponge);
      const bool flush = !sponge || sponge->view.health <= 0;
      const double amount = flush ? debt.remaining : debt.remaining / std::max<Tick>(1, debt.ticks);
      (void)apply_health(target, debt.source, HealthKind::deferred, amount, true);
      debt.remaining -= amount;
      if (debt.ticks) {
        --debt.ticks;
      }
      if (!flush && debt.ticks && debt.remaining > 0) {
        entities_.get(target)->deferred.push_back(debt);
      }
    }
    e = entities_.get(target);
    if (!e || e->view.health <= 0 || e->view.group != Group::petal || e->projectile ||
        e->ground_web || !e->view.owner) {
      continue;
    }
    auto* owner = player(e->view.owner->player);
    if (!owner || owner->view.life != *e->view.owner || !owner->view.body) {
      continue;
    }
    const auto& p = *rules_.catalog->petal(*e->view.petal, e->view.rarity);
    const auto source = source_of(e->view);
    const auto owner_id = *owner->view.body;
    const auto origin = entities_.get(owner_id)->view.position;
    const auto delay = ticks(rules_, p.activation_seconds);
    if (p.effect == catalog::Effect::yucca && owner->defend) {
      impacts_.push_back({owner_id, source, HealthKind::heal, p.passive_heal_per_second * dt});
    }
    if (p.effect == catalog::Effect::bubble && owner->defend && tick_ >= e->born_tick + delay) {
      Vec2 direction = origin - e->view.position;
      const auto length = direction.length();
      direction = length > 0 ? direction * (1 / length) : Vec2{1, 0};
      entities_.get(owner_id)->knockback += direction * 110;
      consume_petal(target);
    } else if ((p.effect == catalog::Effect::dahlia || p.effect == catalog::Effect::shell) &&
               tick_ >= e->born_tick + delay) {
      std::optional<EntityId> recipient;
      double nearest = p.range;
      for (const auto candidate : entities_.active()) {
        const auto& t = entities_.at(candidate).view;
        if (t.group != Group::player || t.faction != e->view.faction || t.health <= 0) {
          continue;
        }
        const bool useful = p.effect == catalog::Effect::shell ? t.shield < p.mechanics.shield
                                                               : t.health < t.max_health;
        if (!useful) {
          continue;
        }
        const auto distance = (t.position - origin).length();
        if (t.id == owner_id || distance <= nearest) {
          recipient = t.id;
          nearest = distance;
          if (t.id == owner_id) {
            break;
          }
        }
      }
      if (recipient) {
        const auto kind =
            p.effect == catalog::Effect::shell ? HealthKind::shield : HealthKind::heal;
        impacts_.push_back({*recipient, source, kind,
                            p.effect == catalog::Effect::shell ? p.mechanics.shield : p.heal, 0, 0,
                            1, 0, true});
      }
    } else if (p.effect == catalog::Effect::yggdrasil) {
      const bool waiting = std::ranges::any_of(players_, [](const Player& p) {
        return p.view.connected && p.view.state == LifeState::waiting;
      });
      if (!waiting) {
        e->held = false;
        continue;
      }
      if (!e->held) {
        e->held = true;
        e->action_ready = tick_ + delay;
      }
      if (tick_ < e->action_ready) {
        continue;
      }
      for (auto& dead : players_) {
        if (dead.view.connected && dead.view.state == LifeState::waiting) {
          const auto position = e->view.position;
          consume_petal(target);
          const auto spawn = dead.spawn;
          dead.spawn = position;
          spawn_player(dead);
          dead.spawn = spawn;
          auto& revived = entities_.get(*dead.view.body)->view;
          revived.health = revived.max_health * .5;
          break;
        }
      }
    } else if (p.effect == catalog::Effect::uranium && tick_ >= e->born_tick + delay &&
               tick_ >= e->action_ready) {
      e->action_ready = tick_ + std::max<Tick>(1, delay);
      for (const auto candidate : entities_.active()) {
        auto& t = entities_.at(candidate);
        if (t.view.group == Group::petal || t.view.health <= 0 ||
            (t.view.position - e->view.position).length() > p.area_radius) {
          continue;
        }
        if (t.view.faction != source.faction) {
          impacts_.push_back({t.view.id, source, HealthKind::radiation,
                              p.body.contact_damage * (t.view.group == Group::player ? .25 : 1)});
        }
      }
      auto self = source;
      self.entity = owner_id;
      impacts_.push_back({owner_id, self, HealthKind::radiation, p.body.contact_damage * 4});
    } else if (p.effect == catalog::Effect::stick && tick_ >= e->born_tick + delay) {
      const auto rarity = e->view.rarity;
      const auto life = e->view.owner;
      const auto position = e->view.position;
      consume_petal(target);
      const auto wind = spawn_mob(Mob::sandstorm, rarity, position, Group::summon, life);
      auto& tornado = *entities_.get(wind);
      tornado.summon_origin = Petal::stick;
      tornado.expires = tick_ + ticks(rules_, p.duration_seconds);
    } else if ((p.effect == catalog::Effect::pollen || p.effect == catalog::Effect::dandelion ||
                p.effect == catalog::Effect::pearl) &&
               tick_ >= e->born_tick + delay &&
               (owner->attack ||
                ((p.effect == catalog::Effect::pollen || p.effect == catalog::Effect::pearl) &&
                 owner->defend))) {
      if (p.effect == catalog::Effect::dandelion) {
        launch_projectile(*e, e->view.heading_rad, std::chrono::milliseconds(1500));
        detach_petal(target);
        continue;
      }
      e->projectile = true;
      e->flight_start = e->view.position;
      e->range_left = p.range;
      e->flight_speed = p.projectile_speed;
      e->expires = p.effect == catalog::Effect::pearl ? 0 : tick_ + ticks(rules_, 5);
      e->held = p.effect == catalog::Effect::pearl;
      e->view.anchor.reset();
      if (p.effect != catalog::Effect::pearl) {
        detach_petal(target);
      }
    }
  }
}

}  // namespace wave::sim
