#include "engine/sim/player_commands.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/sim/petals.hpp"
#include <cmath>
#include <limits>

namespace engine {
namespace {
PlayerState* living_player(World& world, PlayerId id, LifeEpoch life) {
  auto* state = world.players().get(id);
  if (state == nullptr || state->life_epoch != life) return nullptr;
  const auto* body = world.entities().get(state->player());
  return body != nullptr && body->health.value > 0.0F ? state : nullptr;
}
void clear_input(World& world, PlayerState& state) {
  state.clear_input();
  if (auto* body = world.entities().get(state.player())) {
    body->player_expression = static_cast<std::uint8_t>(body->player_expression & 0xFCU);
  }
}
}
PlayerId register_player(World& world, std::string name) {
  return world.players().create(std::move(name));
}
bool can_spawn_player(const World& world, const PlayerState& state) {
  return world.initialized() && world.players().at_boundary() && world.players().get(state.id()) == &state
    && !state.player().valid() && world.tick() >= state.next_spawn_tick
    && state.life_epoch != std::numeric_limits<LifeEpoch>::max()
    && world.tick() <= UINT64_MAX - kSpawnCooldownTicks;
}
EntityHandle spawn_registered_player(World& world, PlayerId id, LifeEpoch life,
    std::string_view name, bool allow_rare_starter) {
  auto* state = world.players().get(id);
  if (state == nullptr || state->life_epoch != life || !can_spawn_player(world, *state)) return {};
  const bool fresh = state->life_epoch == 0;
  const auto profile = fresh ? make_default_profile() : make_respawn_profile(*state);
  const auto handle = spawn_player_default(world, *state, name, profile, allow_rare_starter);
  if (handle.valid()) (void)spawn_loadout_petals(world, *state);
  return handle;
}
bool World::apply_input(PlayerId id, LifeEpoch life, std::uint32_t buttons,
    f32 angle, f32 strength, std::uint64_t ttl_ticks) {
  auto* state = players_.get(id);
  if (state == nullptr || state->life_epoch != life || ttl_ticks == 0
      || !std::isfinite(angle.value) || !std::isfinite(strength.value)) return false;
  // Offline v1 also stores menu input; the next spawn always clears it.
  if (ttl_ticks != kOfflineInputTtl && living_player(*this, id, life) == nullptr) return false;
  if (ttl_ticks != kOfflineInputTtl && tick_ > UINT64_MAX - ttl_ticks) return false;
  PlayerInput input;
  input.buttons = buttons;
  input.angle = angle;
  input.strength = f32(std::max(strength.value, 0.0F));
  input.normalized_angle = f32(std::fmod(static_cast<double>(angle.value), kInputAngleModulus));
  input.direction = pack_direction(input.normalized_angle);
  state->store_input(input);
  state->last_applied_input_tick = tick_;
  state->input_valid_until_tick = ttl_ticks == kOfflineInputTtl ? UINT64_MAX : tick_ + ttl_ticks;
  if (auto* body = entities_.get(state->player())) {
    body->player_look = static_cast<std::uint8_t>(input.direction);
    body->player_expression = static_cast<std::uint8_t>((body->player_expression & 0xFCU) | (buttons & 3U));
  }
  return true;
}
bool apply_player_input(World& world, PlayerId id, LifeEpoch life,
    std::uint32_t buttons, f32 angle, f32 strength, std::uint64_t ttl_ticks) {
  return world.apply_input(id, life, buttons, angle, strength, ttl_ticks);
}
bool discard_player_slot(World& world, PlayerId id, LifeEpoch life,
    std::uint8_t slot, std::uint16_t expected_type) {
  auto* state = living_player(world, id, life);
  if (state == nullptr) return false;
  if (!state->loadout().discard(world, *state, state->profile(), slot, expected_type)) return false;
  remove_slot_petals(world, *state, slot);
  return true;
}
bool swap_player_slots(World& world, PlayerId id, LifeEpoch life,
    std::uint8_t first, std::uint16_t first_type, std::uint8_t second,
    std::uint16_t second_type) {
  auto* state = living_player(world, id, life);
  return state != nullptr && state->loadout().swap(world, *state, state->profile(),
      first, first_type, second, second_type);
}
bool leave_player(World& world, PlayerId id) {
  if (!world.players().at_boundary()) return false;
  auto* state = world.players().get(id);
  if (state == nullptr) return false;
  // Retire room-owned entities before removing the identity record.
  std::vector<EntityHandle> owned;
  const auto body = state->player();
  if (body.valid()) for (const auto& entity : world.entities().active_entities())
    if (controlling_root(world, entity.handle) == body && entity.handle != body)
      owned.push_back(entity.handle);
  for (auto handle : owned) (void)world.destroy(handle);
  if (body.valid()) (void)world.destroy(body);
  return world.players().erase(id);
}
void prepare_players(World& world) {
  world.players().for_each([&](PlayerState& state) {
    if (!state.player().valid() && state.life_epoch != 0 && world.tick() >= state.next_spawn_tick)
      state.life = PlayerLife::kRespawnable;
    if (world.tick() >= state.input_valid_until_tick) clear_input(world, state);
  });
}
void apply_all_player_controls(World& world, double delta_milliseconds) {
  world.players().for_each([&](PlayerState& state) {
    apply_player_controls(world, state, delta_milliseconds);
  });
}
} // namespace engine
