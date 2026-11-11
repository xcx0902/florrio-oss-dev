#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <map>
#include <numbers>

namespace wave::sim {
namespace {
Tick seconds(const Rules& rules, double value) {
  return rules.timing.ticks_ceil(
      Microseconds(static_cast<Microseconds::rep>(std::ceil(value * 1e6))));
}

double segment_gap(Mob kind, double radii) {
  // The Leech is drawn as a continuous body; separate Centipede outlines.
  return radii * (kind == Mob::leech ? .9 : 1.1);
}

void place_spawn_segment(EntityView& body, const EntityView& parent, Vec2 direction, double gap,
                         double arena_radius) {
  const auto offset = direction * (-gap / direction.length());
  const double limit = std::max(0., arena_radius - body.radius);
  auto position = parent.position + offset;
  if (position.length() > limit) {
    if (const double distance = parent.position.length(); distance > 0) {
      // Rotate the link just enough to fit. The cosine rule gives the closest
      // legal direction without shortening the link or stacking its circles.
      const auto inward = parent.position * (-1 / distance);
      const Vec2 tangent{-inward.y, inward.x};
      const double cosine = std::clamp(
          (distance * distance + gap * gap - limit * limit) / (2 * distance * gap), -1., 1.);
      const double sine = std::copysign(std::sqrt((1 - cosine) * (1 + cosine)),
                                       offset.x * tangent.x + offset.y * tangent.y);
      position = parent.position + (inward * cosine + tangent * sine) * gap;
    }
    // Also handles rounding or an arena too small to fit a full link.
    position = clamp_center(position, arena_radius, body.radius);
  }
  body.position = position;
  const auto forward = parent.position - position;
  body.heading_rad = forward == Vec2{} ? parent.heading_rad : std::atan2(forward.y, forward.x);
}
}

double Match::mob_radius(Mob kind, Rarity rarity) const {
  constexpr std::array radii{7., 8., 9.5, 11.5, 14., 17.5};
  const bool smaller = kind == Mob::spider || kind == Mob::leech || kind == Mob::leech_segment;
  return radii.at(static_cast<unsigned>(rarity)) * (smaller ? .75 : 1.);
}

DamageSource Match::damage_source(const detail::Entity& entity) const {
  const auto& view = entity.view;
  auto mob = view.damage_mob;
  if (const auto kind = entity.chain_kind ? entity.chain_kind : view.mob) {
    mob = MobIdentity{*kind, view.rarity};
  }
  return {view.id, view.owner, view.faction, view.damage_origin, mob};
}

EntityId Match::spawn_mob(Mob kind, Rarity rarity, Vec2 position, Group group,
                          std::optional<LifeId> owner, std::uint32_t wave) {
  const auto& definition = *rules_.catalog->mob(kind, rarity);
  EntityView view;
  view.mob = kind;
  view.rarity = rarity;
  view.position = position;
  view.group = group;
  view.owner = owner;
  view.faction = owner || kind == Mob::digger ? Faction::team : Faction::garden;
  view.origin_wave = wave;
  auto body = definition.body;
  body.radius = mob_radius(kind, rarity);
  if (kind == Mob::spider || kind == Mob::leech) {
    body.speed_per_second = rules_.player.speed_per_second * 1.1;
  } else if (kind == Mob::jellyfish) {
    body.speed_per_second = rules_.player.speed_per_second * .9;
  }
  // Continue scaling health and damage in waves past 61.
  const double strength =
      rules_.progressive_waves && wave > 61 ? 1 + std::log1p((wave - 61) / 100.0) : 1;
  body.health *= strength;
  body.contact_damage *= strength;
  const double scale = std::chrono::duration<double>(rules_.timing.step).count() / .025;
  body.poison_per_tick *= scale;
  body.poison_ticks = rules_.timing.ticks_ceil(Microseconds(body.poison_ticks * 25000));
  body.contact_cooldown = rules_.timing.ticks_ceil(Microseconds(body.contact_cooldown * 25000));
  const auto id = add_entity(view, body);
  auto& head = *entities_.get(id);
  head.home_position = head.view.position;
  head.immovable = definition.ai == catalog::MobAI::stationary ||
                   definition.ai == catalog::MobAI::spawner;
  entities_.get(id)->view.heading_rad =
      std::fmod((id.slot + 1) * 2.399963229728653, 2 * std::numbers::pi);
  entities_.get(id)->action_ready =
      tick_ + seconds(rules_, definition.ai == catalog::MobAI::spawner ? 0 : .5);
  if (definition.segments) {
    head.chain_kind = kind;
    // Start with the tail pointing inward so an edge spawn has room for its links.
    if (head.view.position != Vec2{}) {
      head.view.heading_rad = std::atan2(head.view.position.y, head.view.position.x);
    }
    const double gap = segment_gap(kind, 2 * body.radius);
    const auto segment = std::ranges::find_if(rules_.catalog->mobs, [&](const auto& m) {
      return m.client_id == definition.segment_client_id && m.rarity == rarity;
    });
    auto previous = id;
    view.radius = body.radius;
    for (unsigned i = 0; i < definition.segments; ++i) {
      view.mob = segment->kind;
      view.group = Group::segment;
      const auto& parent = entities_.get(previous)->view;
      const Vec2 forward{std::cos(parent.heading_rad), std::sin(parent.heading_rad)};
      place_spawn_segment(view, parent, forward, gap, rules_.arena_radius);
      auto segment_body = segment->body;
      segment_body.radius = body.radius;
      segment_body.speed_per_second = body.speed_per_second;
      segment_body.health = kind == Mob::leech ? body.health : segment_body.health * strength;
      segment_body.contact_damage *= strength;
      segment_body.poison_per_tick *= scale;
      segment_body.poison_ticks =
          rules_.timing.ticks_ceil(Microseconds(segment_body.poison_ticks * 25000));
      segment_body.contact_cooldown =
          rules_.timing.ticks_ceil(Microseconds(segment_body.contact_cooldown * 25000));
      const auto child = add_entity(view, segment_body);
      entities_.get(child)->root = id;
      entities_.get(child)->view.predecessor = previous;
      entities_.get(child)->chain_kind = kind;
      previous = child;
    }
  }
  return id;
}

Vec2 Match::mob_direction(detail::Entity& entity) {
  if (!rules_.catalog || !entity.view.mob) {
    return {};
  }
  const auto& definition =
      *rules_.catalog->mob(entity.chain_kind.value_or(*entity.view.mob), entity.view.rarity);
  if (entity.view.predecessor || definition.ai == catalog::MobAI::stationary ||
      definition.ai == catalog::MobAI::spawner) {
    return {};
  }
  const bool owned = entity.view.owner.has_value();
  bool aggressive =
      owned || entity.provoked ||
      (definition.ai != catalog::MobAI::passive && definition.ai != catalog::MobAI::neutral);
  if (definition.ai == catalog::MobAI::sandstorm && !owned) {
    aggressive = false;
  }
  if (definition.ai == catalog::MobAI::digger && entity.view.health < entity.view.max_health * .3) {
    entity.target.reset();
    const auto distance = entity.view.position.length();
    return distance >= rules_.arena_radius - entity.view.radius - 1 ? Vec2{}
           : distance > 0 ? entity.view.position * (1 / distance)
                          : Vec2{1, 0};
  }
  const double alert_range = *entity.view.mob == Mob::soldier_ant ? 60
                             : *entity.view.mob == Mob::queen_ant ? 80
                                                                  : 120;
  const auto* nest = entity.root ? entities_.get(*entity.root) : nullptr;
  const auto home = nest ? nest->view.position : entity.home_position;
  const bool queen = entity.view.mob == Mob::queen_ant;
  const auto* prior = entity.target ? entities_.get(*entity.target) : nullptr;
  if (prior && prior->view.group == Group::petal && prior->view.anchor) {
    entity.target = prior->view.anchor;
    prior = entities_.get(*entity.target);
  }
  if (!aggressive || !prior || prior->view.faction == entity.view.faction ||
      prior->view.health <= 0 ||
      (prior->view.position - entity.view.position).length() > alert_range * 1.5 ||
      (queen && (entity.view.position - home).length() > alert_range * 1.5)) {
    if (queen && entity.target) {
      entity.returning = true;
    }
    entity.target.reset();
  }
  if (entity.returning) {
    const auto delta = home - entity.view.position;
    if (delta.length() > 10) {
      return delta * (1 / delta.length());
    }
    entity.returning = false;
  }
  if (aggressive && !entity.target) {
    double nearest = alert_range;
    for (const auto slot : entities_.active()) {
      const auto& target = entities_.at(slot).view;
      if (target.faction == entity.view.faction || target.group == Group::petal ||
          target.health <= 0) {
        continue;
      }
      const double distance = (target.position - entity.view.position).length();
      if (distance <= nearest) {
        nearest = distance;
        entity.target = target.id;
      }
    }
  }
  if (entity.target) {
    entity.wander_heading.reset();
    const auto delta = entities_.get(*entity.target)->view.position - entity.view.position;
    const double distance = delta.length();
    if (distance == 0) {
      return {};
    }
    const auto direction = delta * (1 / distance);
    if (definition.ai == catalog::MobAI::ranged && distance < 100) {
      return Vec2{-direction.y, direction.x} * .17;
    }
    return direction;
  }
  if (owned) {
    const auto* owner = player(entity.view.owner->player);
    if (owner && owner->view.body) {
      const auto delta = entities_.get(*owner->view.body)->view.position - entity.view.position;
      if (delta.length() > 35) {
        return delta * (1 / delta.length());
      }
    }
  }
  if (entity.root && *entity.view.mob == Mob::queen_ant) {
    if (const auto* nest = entities_.get(*entity.root)) {
      const auto delta = nest->view.position - entity.view.position;
      if (delta.length() > 35) {
        return delta * (1 / delta.length());
      }
    }
  }
  const double time =
      std::chrono::duration<double>(rules_.timing.step).count() * (tick_ - entity.born_tick);
  if (entity.chain_kind == Mob::centipede || entity.chain_kind == Mob::evil_centipede) {
    // The engine's Centipede profile adds a slow sine to its base heading.
    const bool evil = entity.chain_kind == Mob::evil_centipede;
    const double step = std::chrono::duration<double>(rules_.timing.step).count();
    const double turn = entity.view.id.slot % 2 == 0 ? .006 : -.006;
    double base = entity.wander_heading.value_or(entity.view.heading_rad) + turn * step;
    const double wobble = std::sin(time * .1) * (evil ? .16 : .6);
    const double angle = base + wobble;
    Vec2 direction{std::cos(angle), std::sin(angle)};
    const double distance = entity.view.position.length();
    if (distance > 0 && distance >= rules_.arena_radius - entity.view.radius - 2) {
      const auto normal = entity.view.position * (1 / distance);
      const double outward = normal.x * direction.x + normal.y * direction.y;
      if (outward > 0) {
        direction = direction - normal * (2 * outward);
        base = std::atan2(direction.y, direction.x) - wobble;
      }
    }
    entity.wander_heading = std::remainder(base, 2 * std::numbers::pi);
    return direction * (evil ? .32 : .4);
  }
  const double angle =
      entity.view.heading_rad + .3 * std::chrono::duration<double>(rules_.timing.step).count();
  const double pulse = .15 + .25 * (1 + std::cos(time * 2));
  return Vec2{std::cos(angle), std::sin(angle)} * pulse;
}

void Match::update_mob_actions() {
  if (!rules_.catalog) {
    return;
  }
  std::vector<EntityId> active;
  for (const auto slot : entities_.active()) {
    active.push_back(entities_.at(slot).view.id);
  }
  for (const auto id : active) {
    auto* e = entities_.get(id);
    if (!e || !e->view.mob || e->projectile || e->view.health <= 0) {
      continue;
    }
    const auto& definition = *rules_.catalog->mob(*e->view.mob, e->view.rarity);
    if (e->view.predecessor) {
      continue;
    }
    if (definition.ai == catalog::MobAI::starfish) {
      const auto self = damage_source(*e);
      (void)apply_health(id, self, HealthKind::heal,
                         e->view.max_health * .02 *
                             std::chrono::duration<double>(rules_.timing.step).count());
    }
    if (definition.ai == catalog::MobAI::digger) {
      const auto self = damage_source(*e);
      (void)apply_health(id, self, HealthKind::heal,
                         e->view.max_health * .01 *
                             std::chrono::duration<double>(rules_.timing.step).count());
    }
    if (e->summon_origin == Petal::stick) {
      const double impulse = 80 * std::chrono::duration<double>(rules_.timing.step).count();
      const auto& p = *rules_.catalog->petal(Petal::stick, e->view.rarity);
      for (const auto slot : entities_.active()) {
        auto& other = entities_.at(slot);
        if (other.view.faction == e->view.faction || other.view.group == Group::petal ||
            other.immovable || other.view.predecessor) {
          continue;
        }
        const auto delta = other.view.position - e->view.position;
        if (delta.length() > 0 && delta.length() < p.area_radius) {
          other.knockback += Vec2{-delta.y, delta.x} * (impulse / delta.length());
        }
      }
    }
    if (tick_ < e->action_ready) {
      continue;
    }
    double attack_scale = 1;
    for (const auto& slow : e->slows) {
      if (slow.until > tick_ && slow.slows_attacks) {
        attack_scale *= slow.multiplier;
      }
    }
    const auto source = damage_source(*e);
    const auto position = e->view.position;
    const auto rarity = e->view.rarity;
    if (definition.ai == catalog::MobAI::ranged && e->target) {
      const auto* target = entities_.get(*e->target);
      if (!target) {
        continue;
      }
      auto delta = target->view.position - position;
      // The world PvP predictor is used for a deterministic one-in-five variant.
      if (id.slot % 5 == 0) {
        delta += target->view.velocity * (delta.length() / 100);
      }
      const auto distance = delta.length();
      if (distance <= 0) {
        continue;
      }
      e->action_ready = tick_ + seconds(rules_, 2 / attack_scale);
      EntityView bullet;
      bullet.group = Group::petal;
      bullet.petal = Petal::missile;
      bullet.faction = e->view.faction;
      bullet.owner = e->view.owner;
      bullet.damage_origin = id;
      bullet.rarity = rarity;
      // The older engine uses an 11-unit stinger and a 0.4-unit/ms recoil.
      // Convert from client units, then grow the shot with its Hornet's tier.
      const double missile_radius = (11. / 5) * e->view.radius /
                                    mob_radius(Mob::hornet, Rarity::common);
      const auto forward = delta * (1 / distance);
      bullet.heading_rad = std::atan2(delta.y, delta.x);
      e->view.heading_rad = bullet.heading_rad;
      bullet.position = position + forward * (e->view.radius + missile_radius);
      bullet.damage_mob = source.mob;
      e->recoil += forward * (-.4 * 1000 / 5);
      const auto shot = add_entity(bullet, {.radius = missile_radius,
                                            .health = definition.missile_health,
                                            .contact_damage = definition.missile_damage,
                                            .contact_cooldown = 8});
      launch_projectile(*entities_.get(shot), bullet.heading_rad, std::chrono::seconds(2));
    } else if (definition.ai == catalog::MobAI::jellyfish && e->target) {
      e->action_ready = tick_ + seconds(rules_, 2 / attack_scale);
      if ((entities_.get(*e->target)->view.position - position).length() <= 40) {
        chain_attack(*e->target, source, definition.lightning_damage, definition.lightning_bounces,
                     40);
      }
    } else if (*e->view.mob == Mob::spider && rarity >= Rarity::legendary) {
      e->action_ready = tick_ + seconds(rules_, 2 / attack_scale);
      EntityView web;
      web.group = Group::petal;
      web.petal = Petal::web;
      web.rarity = rarity;
      web.faction = e->view.faction;
      web.position = position;
      web.owner = e->view.owner;
      web.ground_web = true;
      (void)add_entity(
          web, {.radius = rules_.catalog->petal(Petal::web, rarity)->area_radius, .health = 1});
    }
  }
}

void Match::constrain_segments() {
  // Follow the links in chain order, independent of recycled entity slots.
  std::map<std::uint32_t, detail::Entity*> successors;
  for (const auto slot : entities_.active()) {
    auto& entity = entities_.at(slot);
    if (entity.view.predecessor) {
      successors.emplace(entity.view.predecessor->slot, &entity);
    }
  }
  for (const auto slot : entities_.active()) {
    const auto& root = entities_.at(slot);
    if (!root.chain_kind || root.view.predecessor) {
      continue;
    }
    auto previous = &root.view;
    for (auto next = successors.find(previous->id.slot); next != successors.end();
         next = successors.find(previous->id.slot)) {
      auto& body = next->second->view;
      const auto delta = previous->position - body.position;
      const auto distance = delta.length();
      const double gap = segment_gap(*root.chain_kind, previous->radius + body.radius);
      // As in engine/src/sim/movement.cpp, a link limits extension only.
      // A compressed link can stay put as its predecessor moves into a turn.
      if (distance > gap) {
        body.position = previous->position - delta * (gap / distance);
      }
      body.position = clamp_center(body.position, rules_.arena_radius, body.radius);
      const auto facing = previous->position - body.position;
      if (facing != Vec2{}) {
        body.heading_rad = std::atan2(facing.y, facing.x);
      }
      previous = &body;
    }
  }
}

void Match::update_nests() {
  if (!rules_.catalog) {
    return;
  }
  std::vector<EntityId> active;
  for (const auto slot : entities_.active()) {
    active.push_back(entities_.at(slot).view.id);
  }
  for (const auto id : active) {
    auto* e = entities_.get(id);
    if (!e || !e->view.mob) {
      continue;
    }
    const auto& definition = *rules_.catalog->mob(*e->view.mob, e->view.rarity);
    if (definition.ai != catalog::MobAI::spawner) {
      continue;
    }
    if (e->view.health > 0 && tick_ < e->action_ready) {
      continue;
    }
    const auto position = e->view.position;
    const auto rarity = e->view.rarity;
    double attack_scale = 1;
    for (const auto& slow : e->slows) {
      if (slow.until > tick_ && slow.slows_attacks) {
        attack_scale *= slow.multiplier;
      }
    }
    const bool fire = e->view.mob == Mob::fire_ant_burrow;
    const bool entrance = rarity >= Rarity::rare;
    const bool nearby = std::ranges::any_of(entities_.active(), [&](auto slot) {
      const auto& p = entities_.at(slot).view;
      return p.group == Group::player && (p.position - position).length() < 35;
    });
    if ((fire || entrance) && !nearby && !e->spawn_count) {
      continue;
    }
    if (!fire && !entrance && !e->provoked) {
      continue;
    }
    const unsigned total = fire ? (entrance ? 50 : 30) : 40;
    if (e->spawn_count >= total) {
      const bool alive = std::ranges::any_of(entities_.active(), [&](auto slot) {
        const auto& child = entities_.at(slot);
        return child.root == id && child.view.faction == Faction::garden && child.view.health > 0;
      });
      if (!alive && entrance) {
        e->view.health = 0;
        e->fatal_hit = damage_source(*e);
      }
      continue;
    }
    const unsigned desired =
        fire || entrance || e->view.health <= e->view.max_health / 3
            ? total
            : static_cast<unsigned>((1 - e->view.health / e->view.max_health) * (total - 1)) + 1;
    const unsigned count = desired > e->spawn_count ? desired - e->spawn_count : 0;
    const auto first = e->spawn_count;
    const auto life = e->view.owner;
    const auto target = e->target;
    const auto radius = e->view.radius;
    e->spawn_count += count;
    e->action_ready = tick_ + seconds(rules_, .25 / attack_scale);
    for (unsigned n = first; n < first + count; ++n) {
      const auto kind = fire             ? Mob::fire_ant
                        : n == total - 1 ? Mob::queen_ant
                        : n < 5          ? Mob::baby_ant
                        : n < 13         ? Mob::worker_ant
                                         : Mob::soldier_ant;
      auto tier = entrance && kind != Mob::queen_ant ? Rarity::rare : rarity;
      if (fire && entrance && rarity >= Rarity::epic && n < 6u - static_cast<unsigned>(rarity)) {
        tier = rarity;
      }
      const auto offset = Vec2{std::cos(n * 2.4), std::sin(n * 2.4)} * (radius + 7 + n * .5);
      const auto child = spawn_mob(kind, tier, position + offset, Group::summon, life);
      entities_.get(child)->root = id;
      entities_.get(child)->provoked = true;
      entities_.get(child)->target = target;
    }
    if (!entrance && fire) {
      auto& burrow = *entities_.get(id);
      burrow.view.health = 0;
      burrow.fatal_hit = damage_source(burrow);
    }
    // W3 runs nest encounters in this arena; W5 owns interior transfers.
  }
}

void Match::resolve_cleared_nests() {
  std::erase_if(fallen_ant_holes_, [&](const FallenAntHole& hole) {
    const bool defended = std::ranges::any_of(entities_.active(), [&](auto slot) {
      const auto& child = entities_.at(slot);
      return child.root == hole.id && child.view.faction == Faction::garden;
    });
    if (defended) {
      return false;
    }
    if (choose(100, DrawPurpose::digger_spawn) < 2) {
      (void)spawn_mob(Mob::digger, hole.rarity, hole.position, Group::summon);
    }
    return true;
  });
}

}  // namespace wave::sim
