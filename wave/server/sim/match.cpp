#include "sim/match.hpp"

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
        !std::ranges::all_of(wave.eligible, [&catalog](Mob kind) {
          return std::ranges::find(catalog, kind) != catalog.end();
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

Match::Match(MatchId id, std::uint32_t seed, Rules rules)
    : id_(id), seed_(seed), rules_(std::move(rules)), entities_(id), rng_(seed) {
  if (id.value == 0) {
    throw std::invalid_argument("Wave match identity must be nonzero");
  }
  validate(rules_);
}

Match::Player* Match::player(PlayerId id) {
  const auto it = std::ranges::find_if(players_, [id](const Player& p) { return p.view.id == id; });
  return it == players_.end() ? nullptr : &*it;
}

bool Match::add_player(PlayerId id, Vec2 start, std::vector<Petal> loadout) {
  if (tick_ != 0 || id.value == 0 || player(id) || !start.finite() ||
      !std::ranges::all_of(loadout, [this](Petal kind) {
        return static_cast<std::size_t>(kind) < rules_.petals.size();
      })) {
    return false;
  }
  Player entry;
  entry.view.id = id;
  entry.view.life = {id_, id, 0};
  entry.view.petals.resize(loadout.size());
  entry.petal_ready.resize(loadout.size());
  entry.view.loadout = std::move(loadout);
  entry.spawn = clamp_center(start, rules_.arena_radius, rules_.player.radius);
  players_.push_back(std::move(entry));
  return true;
}

bool Match::queue(Input input) {
  auto* entry = player(input.life.player);
  if (phase_ == Phase::ended || input.life.match != id_ || !entry ||
      entry->view.life != input.life || entry->view.state != LifeState::alive ||
      !input.move.finite() || std::abs(input.move.x) > 1 || std::abs(input.move.y) > 1) {
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
      }
    } else {
      const auto& connection = std::get<Connection>(command);
      auto& entry = *player(connection.player);
      if (entry.view.connected != connection.connected) {
        entry.view.connected = connection.connected;
        entry.move = {};
      }
    }
  }
  commands_.clear();
}

EntityId Match::add_entity(EntityView view, BodyRules body) {
  view.position = clamp_center(view.position, rules_.arena_radius, body.radius);
  view.radius = body.radius;
  view.health = view.max_health = body.health;
  detail::Entity entity;
  entity.view = std::move(view);
  entity.rules = body;
  return entities_.insert(std::move(entity));
}

void Match::spawn_player(Player& entry) {
  ++entry.view.life.generation;
  EntityView body;
  body.group = Group::player;
  body.faction = Faction::team;
  body.owner = entry.view.life;
  body.position = entry.spawn;
  entry.view.body = add_entity(body, rules_.player);
  entry.view.state = LifeState::alive;
  std::ranges::fill(entry.petal_ready, tick_);
  emit(LifeChange{entry.view.life, entry.view.body, LifeState::alive});
}

void Match::refresh_petals() {
  for (auto& entry : players_) {
    if (entry.view.state != LifeState::alive) {
      continue;
    }
    for (std::size_t index = 0; index < entry.view.petals.size(); ++index) {
      auto& slot = entry.view.petals[index];
      slot.reload_ticks = entry.petal_ready[index] > tick_ ? entry.petal_ready[index] - tick_ : 0;
      if (slot.entity || slot.reload_ticks != 0) {
        continue;
      }
      EntityView petal;
      petal.group = Group::petal;
      petal.faction = Faction::team;
      petal.petal = entry.view.loadout[index];
      petal.owner = entry.view.life;
      petal.anchor = entry.view.body;
      petal.position = entities_.get(*entry.view.body)->view.position;
      slot.entity = add_entity(petal, rules_.petals[static_cast<std::size_t>(*petal.petal)]);
      entities_.get(*slot.entity)->orbit_offset =
          2 * std::numbers::pi * index / entry.view.petals.size();
    }
  }
}

void Match::reap_player(Player& entry, LifeState state) {
  const auto old_body = entry.view.body;
  if (old_body) {
    entities_.erase(*old_body);
  }
  for (auto& petal : entry.view.petals) {
    if (petal.entity) {
      entities_.erase(*petal.entity);
    }
    petal = {};
  }
  entry.view.body.reset();
  entry.move = {};
  entry.view.state = state;
  emit(LifeChange{entry.view.life, old_body, state});
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
      open_wave(0, tick_);
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
  spawn_due();
  move_entities();
  update_orbits();
  resolve_contacts();
  apply_impacts();
  reap_deaths();
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
      .phase = phase_,
      .wave = wave_,
      .previous_wave = previous_wave_,
      .players = {},
      .entities = {},
  };
  for (const auto& entry : players_) {
    view.players.push_back(entry.view);
  }
  for (const auto slot : entities_.active()) {
    const auto& entity = entities_.at(slot).view;
    view.entities.push_back(entity);
    ++view.population[static_cast<std::size_t>(entity.group)];
  }
  return view;
}

}  // namespace wave::sim
