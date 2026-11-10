#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <numbers>

namespace wave::sim {
namespace {

bool nonnegative(double value) {
  return std::isfinite(value) && value >= 0;
}

bool valid_body(const BodyRules& body) {
  return std::isfinite(body.radius) && body.radius > 0 && std::isfinite(body.health) &&
         body.health > 0 && nonnegative(body.speed_per_second) &&
         nonnegative(body.contact_damage) && nonnegative(body.contact_heal) &&
         nonnegative(body.poison_per_tick) && body.contact_cooldown > 0;
}

void validate(const Rules& rules) {
  if (rules.version.empty() || rules.timing.step.count() <= 0 ||
      rules.timing.broadcast_interval.count() <= 0 || !nonnegative(rules.arena_radius) ||
      rules.arena_radius == 0 || !valid_body(rules.player) ||
      !std::ranges::all_of(rules.petals, valid_body) || rules.petal_reload == 0 ||
      !nonnegative(rules.orbit_radius) || !nonnegative(rules.orbit_rad_per_second) ||
      !nonnegative(rules.attack_orbit_multiplier) || !nonnegative(rules.defend_orbit_multiplier) ||
      !nonnegative(rules.knockback_retention) || rules.knockback_retention > 1 ||
      !nonnegative(rules.contact_knockback_speed) || !nonnegative(rules.special_chance) ||
      rules.special_chance > 1 || rules.waves.empty() || rules.spawn_attempts == 0 ||
      rules.spawn_points.empty() || rules.spawn_points.size() > std::mt19937::max() ||
      !std::ranges::all_of(rules.spawn_points, &Vec2::finite)) {
    throw std::invalid_argument("invalid Wave scenario settings");
  }

  std::vector<Mob> catalog;
  for (const auto& entry : rules.mobs) {
    if (!valid_body(entry.body) || std::ranges::find(catalog, entry.kind) != catalog.end()) {
      throw std::invalid_argument("invalid Wave mob catalog");
    }
    catalog.push_back(entry.kind);
  }

  std::uint32_t last_number = 0;
  for (const auto& wave : rules.waves) {
    if (wave.number <= last_number || wave.deadline == 0 || wave.eligible.empty() ||
        !std::ranges::all_of(wave.eligible, [&catalog, &rules, &wave](Mob kind) {
          return std::ranges::find(catalog, kind) != catalog.end() &&
                 (!rules.catalog || rules.catalog->mob(kind, wave.rarity));
        })) {
      throw std::invalid_argument("invalid Wave schedule");
    }
    std::uint64_t budget = 0;
    Tick last_batch = 0;
    for (const auto& batch : wave.batches) {
      if (batch.offset < last_batch || batch.offset > wave.deadline || batch.count == 0) {
        throw std::invalid_argument("invalid Wave spawn batch");
      }
      budget += batch.count;
      last_batch = batch.offset;
    }
    if (budget != wave.budget) {
      throw std::invalid_argument("Wave spawn batches do not match the wave budget");
    }
    last_number = wave.number;
  }
}

}  // namespace

Match::Match(MatchId id, std::uint32_t seed, Rules rules, std::size_t opening_index)
    : id_(id), seed_(seed), rules_(std::move(rules)), entities_(id), rng_(seed),
      wave_index_(opening_index) {
  if (id.value == 0) {
    throw std::invalid_argument("Wave match identity must be nonzero");
  }
  validate(rules_);
  (void)wave_rules_at(rules_, wave_index_);
}

Match::Player* Match::player(PlayerId id) {
  const auto it = std::ranges::find_if(players_, [id](const Player& p) { return p.view.id == id; });
  return it == players_.end() ? nullptr : &*it;
}

bool Match::valid_loadout(const std::vector<Petal>& loadout,
                          const std::vector<Rarity>& rarities) const {
  if (loadout.size() > 8 || (!rarities.empty() && rarities.size() != loadout.size())) {
    return false;
  }
  for (std::size_t i = 0; i < loadout.size(); ++i) {
    const auto rarity = rarities.empty() ? Rarity::common : rarities[i];
    if (static_cast<unsigned>(rarity) >= 6) {
      return false;
    }
    if (rules_.catalog) {
      if (!rules_.catalog->can_equip(loadout[i], rarity)) {
        return false;
      }
    } else if (static_cast<std::size_t>(loadout[i]) >= rules_.petals.size()) {
      return false;
    }
  }
  return true;
}

BodyRules Match::petal_body(Petal kind, Rarity rarity) const {
  if (!rules_.catalog) {
    return rules_.petals.at(static_cast<std::size_t>(kind));
  }
  auto body = rules_.catalog->petal(kind, rarity)->body;
  const double scale = std::chrono::duration<double>(rules_.timing.step).count() / .025;
  body.poison_per_tick *= scale;
  body.poison_ticks = rules_.timing.ticks_ceil(Microseconds(body.poison_ticks * 25000));
  body.contact_cooldown = rules_.timing.ticks_ceil(Microseconds(body.contact_cooldown * 25000));
  return body;
}

Tick Match::reload_ticks(Petal kind, Rarity rarity) const {
  if (rules_.catalog && kind == Petal::none) {
    return 0;
  }
  if (!rules_.catalog) {
    return rules_.petal_reload;
  }
  return rules_.timing.ticks_ceil(Microseconds(static_cast<Microseconds::rep>(
      rules_.catalog->petal(kind, rarity)->reload_seconds * 1000000)));
}

bool Match::add_player(PlayerId id, Vec2 start, std::vector<Petal> loadout,
                       std::vector<Rarity> rarities) {
  if (tick_ != 0 || id.value == 0 || player(id) || !start.finite() ||
      !valid_loadout(loadout, rarities)) {
    return false;
  }
  Player entry;
  entry.view.id = id;
  entry.view.life = {id_, id, 0};
  entry.view.petals.resize(loadout.size());
  entry.petal_ready.resize(loadout.size());
  entry.view.loadout = std::move(loadout);
  if (rarities.empty()) {
    rarities.resize(entry.view.loadout.size(), Rarity::common);
  }
  entry.view.loadout_rarities = std::move(rarities);
  entry.spawn = clamp_center(start, rules_.arena_radius, rules_.player.radius);
  players_.push_back(std::move(entry));
  return true;
}

bool Match::equip(PlayerId id, std::vector<Petal> loadout, std::vector<Rarity> rarities) {
  auto* entry = player(id);
  if (!entry || phase_ == Phase::ended || !valid_loadout(loadout, rarities)) {
    return false;
  }
  if (rarities.empty()) {
    rarities.resize(loadout.size(), Rarity::common);
  }
  replace_loadout(*entry, std::move(loadout), std::move(rarities));
  return true;
}

bool Match::equip(PlayerId id, std::size_t slot, Petal kind, Rarity rarity) {
  auto* entry = player(id);
  if (!entry || slot >= entry->view.loadout.size()) {
    return false;
  }
  auto loadout = entry->view.loadout;
  auto rarities = entry->view.loadout_rarities;
  loadout[slot] = kind;
  rarities[slot] = rarity;
  return equip(id, std::move(loadout), std::move(rarities));
}

void Match::replace_loadout(Player& entry, std::vector<Petal> loadout,
                            std::vector<Rarity> rarities) {
  // Preserve unchanged slots, including partially broken multi-particle slots.
  const auto old_count = entry.view.loadout.size();
  for (std::size_t i = 0; i < old_count; ++i) {
    if (i < loadout.size() && entry.view.loadout[i] == loadout[i] &&
        entry.view.loadout_rarities[i] == rarities[i]) {
      continue;
    }
    for (const auto id : entry.view.petals[i].entities) {
      flush_sponge(id);
      entities_.erase(id);
    }
    entry.view.petals[i] = {};
  }
  auto health_bonus = [this](const auto& kinds, const auto& tiers) {
    double bonus = 0;
    if (rules_.catalog) {
      for (std::size_t i = 0; i < kinds.size(); ++i) {
        if (const auto* rule = rules_.catalog->petal(kinds[i], tiers[i])) {
          bonus += rule->health_bonus;
        }
      }
    }
    return bonus;
  };
  const double delta = health_bonus(loadout, rarities) -
                       health_bonus(entry.view.loadout, entry.view.loadout_rarities);
  entry.view.petals.resize(loadout.size());
  entry.petal_ready.resize(loadout.size());
  for (std::size_t i = 0; i < loadout.size(); ++i) {
    if (i < old_count && entry.view.loadout[i] == loadout[i] &&
        entry.view.loadout_rarities[i] == rarities[i]) {
      continue;
    }
    const auto reload = reload_ticks(loadout[i], rarities[i]);
    entry.petal_ready[i] = tick_ + reload;
    entry.view.petals[i].reload_ticks = reload;
    entry.view.petals[i].reload_total_ticks = reload;
  }
  entry.view.loadout = std::move(loadout);
  entry.view.loadout_rarities = std::move(rarities);
  for (std::size_t i = 0; i < entry.view.petals.size(); ++i) {
    for (const auto id : entry.view.petals[i].entities) {
      auto& entity = *entities_.get(id);
      entity.orbit_offset = 2 * std::numbers::pi * i / entry.view.petals.size();
      const auto count =
          rules_.catalog
              ? rules_.catalog->petal(entry.view.loadout[i], entry.view.loadout_rarities[i])
                    ->particles
              : 1;
      if (count > 1) {
        entity.orbit_offset += (double(entity.particle_index) - (count - 1) / 2.0) * .12;
      }
    }
  }
  if (entry.view.body) {
    auto& body = entities_.get(*entry.view.body)->view;
    body.max_health += delta;
    body.health = std::min(body.health, body.max_health);
  }
}

bool Match::queue(Equip command) {
  const auto* entry = player(command.life.player);
  if (!entry || phase_ == Phase::ended || entry->view.life != command.life ||
      entry->view.state != LifeState::alive || !entry->view.connected ||
      !valid_loadout(command.loadout, command.rarities)) {
    return false;
  }
  commands_.emplace_back(std::move(command));
  return true;
}

bool Match::queue(Input input) {
  auto* entry = player(input.life.player);
  if (phase_ == Phase::ended || input.life.match != id_ || !entry ||
      entry->view.life != input.life || entry->view.state != LifeState::alive ||
      !input.move.finite() || std::abs(input.move.x) > 1 || std::abs(input.move.y) > 1 ||
      (input.aim_angle && !std::isfinite(*input.aim_angle)) || !nonnegative(input.aim_distance)) {
    return false;
  }
  commands_.emplace_back(input);
  return true;
}

bool Match::queue(Connection connection) {
  if (phase_ == Phase::ended || !player(connection.player)) {
    return false;
  }
  commands_.emplace_back(connection);
  return true;
}

void Match::apply_commands() {
  for (const auto& command : commands_) {
    if (const auto* input = std::get_if<Input>(&command)) {
      auto& entry = *player(input->life.player);
      if (entry.view.connected && entry.view.life == input->life &&
          entry.view.state == LifeState::alive) {
        const double length = input->move.length();
        entry.move = length > 1 ? input->move * (1 / length) : input->move;
        entry.attack = input->attack;
        entry.defend = input->defend;
        if (input->aim_angle) {
          entry.aim_angle = *input->aim_angle;
        } else if (length > 0) {
          entry.aim_angle = std::atan2(input->move.y, input->move.x);
        }
        entry.aim_distance = std::min(input->aim_distance, 40.0);
      }
    } else if (const auto* equip = std::get_if<Equip>(&command)) {
      auto& entry = *player(equip->life.player);
      if (entry.view.connected && entry.view.life == equip->life &&
          entry.view.state == LifeState::alive) {
        auto rarities = equip->rarities;
        if (rarities.empty()) {
          rarities.resize(equip->loadout.size(), Rarity::common);
        }
        replace_loadout(entry, equip->loadout, std::move(rarities));
      }
    } else {
      const auto& connection = std::get<Connection>(command);
      auto& entry = *player(connection.player);
      if (entry.view.connected != connection.connected) {
        entry.view.connected = connection.connected;
        entry.move = {};
        entry.attack = entry.defend = false;
      }
    }
  }
  commands_.clear();
}

EntityId Match::add_entity(EntityView view, BodyRules body) {
  if (!view.ground_web) {
    view.position = clamp_center(view.position, rules_.arena_radius, body.radius);
  }
  view.radius = body.radius;
  view.health = view.max_health = body.health;
  detail::Entity entity;
  entity.view = std::move(view);
  entity.rules = body;
  entity.born_tick = tick_;
  return entities_.insert(std::move(entity));
}

void Match::spawn_player(Player& entry) {
  entry.attack = entry.defend = false;
  ++entry.view.life.generation;
  EntityView body;
  body.group = Group::player;
  body.faction = Faction::team;
  body.owner = entry.view.life;
  body.position = entry.spawn;
  auto player_body = rules_.player;
  if (rules_.catalog) {
    for (std::size_t i = 0; i < entry.view.loadout.size(); ++i) {
      if (const auto* rule =
              rules_.catalog->petal(entry.view.loadout[i], entry.view.loadout_rarities[i])) {
        player_body.health += rule->health_bonus;
      }
    }
  }
  entry.view.body = add_entity(body, player_body);
  entry.view.state = LifeState::alive;
  entry.view.death_position.reset();
  entry.view.killer.reset();
  std::ranges::fill(entry.petal_ready, tick_);
  emit(LifeChange{entry.view.life, entry.view.body, LifeState::alive,
                  entities_.get(*entry.view.body)->view.position});
}

void Match::refresh_petals() {
  for (auto& entry : players_) {
    if (entry.view.state != LifeState::alive) {
      continue;
    }
    for (std::size_t index = 0; index < entry.view.petals.size(); ++index) {
      if (rules_.catalog && entry.view.loadout[index] == Petal::none) {
        continue;
      }
      auto& slot = entry.view.petals[index];
      slot.reload_ticks = entry.petal_ready[index] > tick_ ? entry.petal_ready[index] - tick_ : 0;
      if (slot.reload_ticks != 0) {
        continue;
      }
      EntityView petal;
      petal.group = Group::petal;
      petal.faction = Faction::team;
      petal.petal = entry.view.loadout[index];
      petal.owner = entry.view.life;
      petal.anchor = entry.view.body;
      petal.position = entities_.get(*entry.view.body)->view.position;
      petal.rarity = entry.view.loadout_rarities[index];
      const auto* definition =
          rules_.catalog ? rules_.catalog->petal(*petal.petal, petal.rarity) : nullptr;
      const bool splits_on_launch = petal.petal == Petal::peas || petal.petal == Petal::grapes;
      const auto count = definition && !splits_on_launch ? definition->particles : 1;
      if (slot.entities.size() == count) {
        continue;
      }
      slot.reload_total_ticks = reload_ticks(*petal.petal, petal.rarity);
      for (unsigned particle = 0; particle < count; ++particle) {
        if (std::ranges::any_of(slot.entities, [&](EntityId id) {
              return entities_.get(id)->particle_index == particle;
            })) {
          continue;
        }
        auto body = petal_body(*petal.petal, petal.rarity);
        if (definition && splits_on_launch) {
          body.health *= definition->particles;
        }
        const auto id = add_entity(petal, body);
        slot.entities.push_back(id);
        entities_.get(id)->particle_index = particle;
        entities_.get(id)->orbit_offset = 2 * std::numbers::pi * index / entry.view.petals.size();
      }
      std::ranges::sort(slot.entities, {}, [this](EntityId id) {
        return entities_.get(id)->particle_index;
      });
      slot.entity = slot.entities.front();
    }
  }
}

void Match::reap_player(Player& entry, LifeState state) {
  const auto old_body = entry.view.body;
  std::optional<Vec2> position;
  if (old_body) {
    if (const auto* body = entities_.get(*old_body)) {
      position = body->view.position;
    }
    entities_.erase(*old_body);
  }
  for (auto& petal : entry.view.petals) {
    for (const auto id : petal.entities) {
      entities_.erase(id);
    }
    petal = {};
  }
  // Detached projectiles and summons cannot survive their owning life.
  const auto active = entities_.active();
  for (const auto slot : active) {
    const auto& entity = entities_.at(slot).view;
    if (entity.owner == entry.view.life) {
      entities_.erase(entity.id);
    }
  }
  entry.view.body.reset();
  entry.move = {};
  entry.attack = entry.defend = false;
  entry.view.state = state;
  emit(LifeChange{entry.view.life, old_body, state, position});
}

bool Match::step() {
  if (players_.empty() || phase_ == Phase::ended) {
    return false;
  }
  events_.clear();
  apply_commands();
  if (phase_ == Phase::waiting) {
    const bool opening = wave_.number == 0;
    if (opening) {
      open_wave(wave_index_, tick_);
    }
    const bool can_respawn =
        rules_.lifecycle.respawn_next_wave &&
        (arrival_ != TransitionReason::deadline || rules_.lifecycle.respawn_after_deadline);
    for (auto& entry : players_) {
      if (entry.view.connected && entry.view.state == LifeState::waiting &&
          (opening || can_respawn)) {
        spawn_player(entry);
      }
    }
    phase_ = Phase::spawning;
  }
  refresh_petals();
  refresh_passives();
  spawn_due();
  move_entities();
  constrain_segments();
  update_mob_actions();
  update_orbits();
  update_effects();
  update_special_effects();
  resolve_contacts();
  apply_impacts();
  update_nests();
  finish_projectiles();
  reap_deaths();
  constrain_segments();
  update_orbits();
  adjudicate();
  ++tick_;
  return true;
}

MatchView Match::view() const {
  MatchView view{
      .id = id_,
      .seed = seed_,
      .next_tick = tick_,
      .step = rules_.timing.step,
      .broadcast_interval = rules_.timing.broadcast_interval,
      .arena_radius = rules_.arena_radius,
      .biome = rules_.biome,
      .petal_reload = rules_.petal_reload,
      .phase = phase_,
      .wave = wave_,
      .previous_wave = previous_wave_,
      .players = {},
      .entities = {},
  };
  for (const auto& entry : players_) {
    view.players.push_back(entry.view);
  }
  if (rules_.catalog) {
    view.catalog_version = rules_.catalog->version;
    view.catalog_sha256 = rules_.catalog->sha256;
  }
  for (const auto slot : entities_.active()) {
    const auto& entity = entities_.at(slot).view;
    view.entities.push_back(entity);
    ++view.population[static_cast<std::size_t>(entity.group)];
  }
  return view;
}

}  // namespace wave::sim
