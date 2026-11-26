#include "sim/match.hpp"
#include "catalog/catalog.hpp"
#include "scenario_defaults.hpp"

#include <numbers>

namespace wave::sim {

double Match::area_radius(std::uint32_t area) const {
  const auto hole = std::ranges::find(ant_holes_, area, &AntHoleView::area);
  return hole == ant_holes_.end() ? arena_radius_ : hole->radius;
}

Faction Match::player_faction(PlayerId id) const {
  return rules_.mode == Mode::pvp ? static_cast<Faction>(id.value + 2) : Faction::team;
}

bool Match::main_paused() const {
  if (!rules_.pause_when_all_inside || ant_holes_.empty()) {
    return false;
  }
  bool inside = false;
  for (const auto& p : players_) {
    if (p.view.connected && p.view.state == LifeState::alive) {
      if (!p.view.area) {
        return false;
      }
      inside = true;
    }
  }
  return inside;
}

void Match::transfer_player(Player& p, std::uint32_t area, Vec2 at) {
  if (!p.view.body) {
    p.view.area = area;
    return;
  }
  auto& body = entities_.get(*p.view.body)->view;
  const auto delta = at - body.position;
  const auto old_life = p.view.life;
  // A new control generation rejects inputs acknowledged before the transfer.
  ++p.view.life.generation;
  p.view.area = area;
  p.move = {};
  p.attack = p.defend = false;
  p.portal_ready = tick_ + rules_.timing.ticks_ceil(std::chrono::seconds(1));
  for (const auto slot : entities_.active()) {
    auto& e = entities_.at(slot);
    if (e.view.owner != old_life) {
      continue;
    }
    e.view.owner = p.view.life;
    e.view.area = area;
    e.view.position = clamp_center(e.view.position + delta, area_radius(area), e.view.radius);
    e.home_position = e.view.position;
    e.flight_start = e.view.position;
    e.view.velocity = {};
    e.knockback = e.recoil = {};
    e.target.reset();
    e.healing.reset();
  }
}

void Match::close_ant_hole(std::uint32_t area) {
  const auto found = std::ranges::find(ant_holes_, area, &AntHoleView::area);
  if (found == ant_holes_.end()) {
    return;
  }
  const auto hole = *found;
  const auto return_at =
      clamp_center(hole.position + Vec2{25, 0}, arena_radius_, rules_.player.radius);
  for (auto& p : players_) {
    if (p.view.area == area) {
      transfer_player(p, 0, return_at);
    }
  }
  for (const auto slot : entities_.active()) {
    auto& e = entities_.at(slot);
    if (e.view.area != area) {
      continue;
    }
    e.view.area = 0;
    e.view.position = clamp_center(hole.position + e.view.position, arena_radius_, e.view.radius);
    e.home_position = e.view.position;
    e.flight_start = e.view.position;
    e.target.reset();
    if (e.view.group == Group::main_mob) {
      e.view.group = Group::residual;
    }
  }
  // Reap through the normal wave counter. The economy recognizes a closed
  // entrance and rolls its own catalog loot once, separately from its guards.
  if (auto* entrance = entities_.get(hole.entrance)) {
    entrance->view.health = 0;
    entrance->fatal_hit = damage_source(*entrance);
  }
  std::erase_if(ant_holes_, [area](const auto& h) { return h.area == area; });
  emit(AreaClosed{area, hole.position});
  reap_deaths();
}

void Match::update_ant_holes() {
  // Only main-field, Rare+ entrances have interiors. Small burrows keep their native releases.
  std::vector<EntityId> portals;
  for (const auto slot : entities_.active()) {
    const auto& e = entities_.at(slot).view;
    if (!e.area && e.rarity >= Rarity::rare &&
        (e.mob == Mob::ant_hole || e.mob == Mob::fire_ant_burrow)) {
      portals.push_back(e.id);
    }
  }
  for (auto& p : players_) {
    if (!p.view.connected || p.view.state != LifeState::alive || p.view.area || !p.view.body ||
        tick_ < p.portal_ready) {
      continue;
    }
    const auto at = entities_.get(*p.view.body)->view.position;
    for (const auto id : portals) {
      const auto* entrance = entities_.get(id);
      if (!entrance ||
          !overlaps(at, rules_.player.radius, entrance->view.position, entrance->view.radius)) {
        continue;
      }
      auto h = std::ranges::find(ant_holes_, id, &AntHoleView::entrance);
      if (h == ant_holes_.end()) {
        const auto e = entrance->view;
        AntHoleView hole{++next_area_,
                         id,
                         *e.mob,
                         e.rarity,
                         e.position,
                         rules_.ant_hole_radius,
                         tick_ + rules_.timing.ticks_ceil(rules_.ant_hole_duration),
                         tick_};
        ant_holes_.push_back(hole);
        const bool fire = e.mob == Mob::fire_ant_burrow;
        const unsigned baby_end = detail::w5_ant_baby_count;
        const unsigned worker_end = baby_end + detail::w5_ant_worker_count;
        const unsigned soldier_end = worker_end + detail::w5_ant_soldier_count;
        const unsigned total =
            fire ? detail::w5_fire_count : soldier_end + detail::w5_ant_queen_count;
        for (unsigned n = 0; n < total; ++n) {
          const auto kind = fire               ? Mob::fire_ant
                            : n >= soldier_end ? Mob::queen_ant
                            : n < baby_end     ? Mob::baby_ant
                            : n < worker_end   ? Mob::worker_ant
                                               : Mob::soldier_ant;
          auto rarity = kind == Mob::queen_ant ? e.rarity : Rarity::rare;
          if (fire && e.rarity >= Rarity::epic && n < 6u - static_cast<unsigned>(e.rarity)) {
            rarity = e.rarity;
          }
          // Fixed-seed uniform disc; the exact spawn distribution is a remake parameter.
          const double angle = draw(DrawPurpose::spawn_point) / 4294967296. * 2 * std::numbers::pi;
          const double radius =
              std::sqrt(draw(DrawPurpose::spawn_point) / 4294967296.) * (hole.radius - 30);
          (void)spawn_mob(kind, rarity, {radius * std::cos(angle), radius * std::sin(angle)},
                          Group::main_mob, {}, 0, hole.area);
        }
        if (choose(100, DrawPurpose::digger_spawn) < detail::w5_digger_percent) {
          (void)spawn_mob(Mob::digger, e.rarity, {}, Group::summon, {}, 0, hole.area);
        }
        h = std::ranges::find(ant_holes_, id, &AntHoleView::entrance);
      }
      // Random interior entry is corroborated for fire burrows; shared here as a remake setting.
      const double angle = draw(DrawPurpose::spawn_point) / 4294967296. * 2 * std::numbers::pi;
      transfer_player(p, h->area, Vec2{std::cos(angle), std::sin(angle)} * (h->radius - 20));
      break;
    }
  }
  std::vector<std::uint32_t> closed;
  for (const auto& h : ant_holes_) {
    const bool defended = std::ranges::any_of(entities_.active(), [&](auto slot) {
      const auto& e = entities_.at(slot).view;
      return e.area == h.area && e.faction == Faction::hostile && e.mob && e.health > 0;
    });
    if (!defended || tick_ >= h.deadline_tick) {
      closed.push_back(h.area);
    }
  }
  for (const auto area : closed) {
    close_ant_hole(area);
  }
}

void Match::update_pvp() {
  const auto population = std::ranges::count_if(players_, [](const Player& p) {
    return p.view.connected && p.view.state == LifeState::alive;
  });
  const auto target = pvp_arena_radius(population);
  const auto change = rules_.pvp_arena_resize_speed_per_second *
                      std::chrono::duration<double>(rules_.timing.step).count();
  // Keep boundary motion independent of player movement and tick frequency.
  // A population change reverses direction from the current radius without a snap.
  arena_radius_ += std::clamp(target - arena_radius_, -change, change);
  for (const auto slot : entities_.active()) {
    auto& e = entities_.at(slot);
    e.view.position = clamp_center(e.view.position, area_radius(e.view.area), e.view.radius);
  }
  if (tick_ < pvp_spawn_ready_) {
    return;
  }
  pvp_spawn_ready_ = tick_ + rules_.timing.ticks_ceil(rules_.pvp_spawn_interval);
  const auto mobs = std::ranges::count_if(entities_.active(), [&](auto slot) {
    const auto& e = entities_.at(slot).view;
    return !e.area && e.faction == Faction::hostile && e.group == Group::main_mob;
  });
  if (static_cast<std::size_t>(mobs) >= rules_.pvp_mob_limit) {
    return;
  }
  const auto& pool = detail::w5_pvp_mob_pool;
  const auto kind = pool[choose(pool.size(), DrawPurpose::mob_kind)];
  const auto rarity =
      wave_rarity(detail::w5_pvp_wave_equivalent, draw(DrawPurpose::mob_rarity) / 4294967296.);
  if (const auto at = spawn_point(mob_radius(kind, rarity))) {
    (void)spawn_mob(kind, rarity, *at, Group::main_mob);
  }
}

}  // namespace wave::sim
