#include "sim/match.hpp"
#include "catalog/catalog.hpp"

#include <iterator>

namespace wave::sim {

std::uint32_t Match::draw(DrawPurpose purpose) {
  const auto value = static_cast<std::uint32_t>(rng_());
  emit(RandomDraw{purpose, value});
  return value;
}

std::size_t Match::choose(std::size_t size, DrawPurpose purpose) {
  constexpr std::uint64_t range = std::uint64_t{1} + std::mt19937::max();
  const std::uint64_t limit = range - range % size;
  std::uint32_t value;
  do {
    value = draw(purpose);
  } while (value >= limit);
  return value % size;
}

void Match::open_wave(std::size_t index, Tick start) {
  const bool opening = !previous_wave_;
  wave_index_ = index;
  const auto definition = wave_rules_at(rules_, index);
  wave_ = {};
  wave_.number = definition.number;
  wave_.rules_version = rules_.version;
  wave_.start_tick = start;
  wave_.deadline_tick = start + definition.deadline;
  wave_.eligible = definition.eligible;

  if (rules_.special_chance > 0 && (!opening || rules_.special_on_opening_wave)) {
    std::vector<std::vector<Mob>> eligible_groups;
    for (const auto& group : rules_.special_groups) {
      std::vector<Mob> eligible;
      std::ranges::copy_if(group, std::back_inserter(eligible), [&definition](Mob kind) {
        return std::ranges::find(definition.eligible, kind) != definition.eligible.end();
      });
      if (!eligible.empty()) {
        eligible_groups.push_back(std::move(eligible));
      }
    }
    constexpr double range = 4294967296.0;
    if (!eligible_groups.empty() &&
        draw(DrawPurpose::special_roll) / range < rules_.special_chance) {
      wave_.special = true;
      wave_.eligible =
          std::move(eligible_groups[choose(eligible_groups.size(), DrawPurpose::special_group)]);
    }
  }

  wave_.plan.reserve(definition.budget);
  auto pool = wave_.eligible;
  if (rules_.progressive_waves && !wave_.special && definition.number > 3) {
    const auto weight = std::min(4u, definition.number / 5);
    for (const auto kind : rules_.dangerous_mobs) {
      if (std::ranges::find(wave_.eligible, kind) != wave_.eligible.end()) {
        pool.insert(pool.end(), weight, kind);
      }
    }
  }
  for (std::size_t batch = 0; batch < definition.batches.size(); ++batch) {
    const auto& spec = definition.batches[batch];
    const auto count =
        spec.count +
        (wave_.special && rules_.progressive_waves && definition.number > 3 ? spec.count / 2 : 0);
    for (std::uint32_t n = 0; n < count; ++n) {
      const auto kind = pool[choose(pool.size(), DrawPurpose::mob_kind)];
      const auto rarity =
          rules_.progressive_waves
              ? wave_rarity(definition.number, draw(DrawPurpose::mob_rarity) / 4294967296.0)
              : definition.rarity;
      wave_.plan.push_back({.due_tick = start + spec.offset,
                            .batch = batch,
                            .mob = kind,
                            .rarity = rarity,
                            .actual_tick = std::nullopt,
                            .entity = std::nullopt});
    }
  }
  wave_.counts.planned = wave_.counts.pending = wave_.plan.size();
}

std::optional<Vec2> Match::spawn_point(double radius) {
  const auto start = choose(rules_.spawn_points.size(), DrawPurpose::spawn_point);
  for (std::size_t offset = 0; offset < rules_.spawn_points.size(); ++offset) {
    const auto candidate =
        clamp_center(rules_.spawn_points[(start + offset) % rules_.spawn_points.size()],
                     rules_.arena_radius, radius);
    const bool blocked = std::ranges::any_of(entities_.active(), [&](std::uint32_t slot) {
      const auto& body = entities_.at(slot).view;
      return body.group != Group::petal && overlaps(candidate, radius, body.position, body.radius);
    });
    if (!blocked) {
      return candidate;
    }
  }
  return std::nullopt;
}

void Match::spawn_due() {
  if (phase_ != Phase::spawning) {
    return;
  }
  for (std::size_t index = 0; index < wave_.plan.size(); ++index) {
    auto& slot = wave_.plan[index];
    if (slot.due_tick > tick_) {
      break;
    }
    if (slot.state != SpawnState::pending) {
      continue;
    }
    ++slot.attempts;
    const auto position = spawn_point(mob_radius(slot.mob, slot.rarity));
    SpawnOutcome outcome = SpawnOutcome::blocked;
    std::optional<SpawnFailure> failure;
    if (position) {
      slot.entity = spawn_mob(slot.mob, slot.rarity, *position, Group::main_mob, {}, wave_.number);
      slot.state = SpawnState::spawned;
      slot.actual_tick = tick_;
      --wave_.counts.pending;
      ++wave_.counts.spawned;
      ++wave_.counts.alive;
      outcome = SpawnOutcome::spawned;
    } else if (slot.attempts == rules_.spawn_attempts || tick_ == wave_.deadline_tick) {
      failure = tick_ == wave_.deadline_tick ? SpawnFailure::deadline : SpawnFailure::attempt_limit;
      slot.state = SpawnState::exhausted;
      --wave_.counts.pending;
      ++wave_.counts.exhausted;
      outcome = SpawnOutcome::exhausted;
    } else {
      failure = SpawnFailure::occupied;
    }
    emit(SpawnEvent{wave_.number, index, slot.due_tick, slot.attempts, outcome, failure,
                    slot.entity, position});
  }
  if (wave_.counts.pending == 0) {
    wave_.spawn_complete_tick = tick_;
    phase_ = Phase::clearing;
  }
}

void Match::settle_wave(bool advancing) {
  for (std::size_t index = 0; index < wave_.plan.size(); ++index) {
    auto& slot = wave_.plan[index];
    if (slot.state == SpawnState::pending) {
      slot.state = SpawnState::cancelled;
      --wave_.counts.pending;
      ++wave_.counts.cancelled;
      emit(SpawnEvent{wave_.number, index, slot.due_tick, slot.attempts, SpawnOutcome::cancelled,
                      std::nullopt, std::nullopt, std::nullopt});
    }
  }
  if (!advancing) {
    return;
  }
  for (const auto& slot : wave_.plan) {
    if (!slot.entity) {
      continue;
    }
    auto* entity = entities_.get(*slot.entity);
    if (!entity) {
      continue;
    }
    --wave_.counts.alive;
    if (rules_.residual == ResidualPolicy::keep) {
      entity->view.group = Group::residual;
      ++wave_.counts.carried;
    } else {
      const auto root = entity->view.id;
      const auto active = entities_.active();
      for (const auto child : active) {
        if (entities_.at(child).root == root) {
          entities_.erase(entities_.at(child).view.id);
        }
      }
      entities_.erase(root);
      ++wave_.counts.discarded;
    }
  }
}

void Match::transition(TransitionReason reason, bool advancing) {
  settle_wave(advancing);
  if (advancing) {
    const auto next = wave_rules_at(rules_, wave_index_ + 1).number;
    emit(Transition{wave_.number, next, reason});
    previous_wave_ = std::move(wave_);
    open_wave(wave_index_ + 1, tick_ + 1);
    arrival_ = reason;
    phase_ = Phase::waiting;
  } else {
    emit(Transition{wave_.number, std::nullopt, reason});
    for (auto& entry : players_) {
      reap_player(entry, LifeState::ended);
    }
    phase_ = Phase::ended;
  }
}

void Match::adjudicate() {
  const bool connected =
      std::ranges::any_of(players_, [](const Player& entry) { return entry.view.connected; });
  const bool survivor = std::ranges::any_of(players_, [](const Player& entry) {
    return entry.view.connected && entry.view.state == LifeState::alive;
  });
  if (connected && !survivor && rules_.lifecycle.end_on_team_wipe) {
    transition(TransitionReason::team_wipe, false);
  } else if (!connected && rules_.lifecycle.end_on_last_disconnect) {
    transition(TransitionReason::last_disconnect, false);
  } else if (phase_ == Phase::clearing) {
    const bool next = wave_index_ + 1 < rules_.waves.size() ||
                      (rules_.progressive_waves && wave_.number < max_wave_number);
    auto remaining = wave_.counts.alive;
    if (rules_.progressive_waves) {
      remaining = std::ranges::count_if(entities_.active(), [this](auto slot) {
        const auto& mob = entities_.at(slot).view;
        return mob.faction == Faction::hostile &&
               (mob.group == Group::main_mob || mob.group == Group::residual);
      });
    }
    if (remaining <= rules_.remaining_threshold) {
      transition(TransitionReason::threshold, next);
    } else if (rules_.advance_on_deadline && tick_ >= wave_.deadline_tick) {
      transition(TransitionReason::deadline, next);
    }
  }
}

}  // namespace wave::sim
