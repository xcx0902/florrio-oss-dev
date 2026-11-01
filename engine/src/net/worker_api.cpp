#include "engine/net/worker_api.hpp"
#include "engine/model/world_config.hpp"
#include "engine/net/angle.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/petals.hpp"
#include "engine/net/input.hpp"
#include "engine/net/snapshot_codec.hpp"

#include "engine/net/dense_fields.hpp"
#include "engine/sim/tick.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/combat.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>

namespace engine {
namespace {
void reserve_spawn_placeholder(World& world) {
  const EntityHandle placeholder = world.entities().allocate().value_or(EntityHandle{});
  if (placeholder.valid()) (void)world.entities().release(placeholder);
}
}
void WorkerApi::init(bool populate) {
  // The offline API historically keeps its independent death-shuffle stream
  // across init() on the same object. A new native World uses config's seed.
  initialize_world(world_, WorldConfig{.populate = populate,
      .death_shuffle_seed = world_.death_shuffle_random().state()});
  output_.clear();
  last_sequence_ = 0;
  local_player_id_ = register_player(world_, {});
  publisher_.reset(populate);
}

bool WorkerApi::send(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key) {
  if (!world_.initialized() || packet.empty() || packet.size() > kMaxInputPacketBytes) return false;
  std::vector<InputMessage> messages;
  if (decode_input_packet(packet, key, messages) != Status::kOk) return false;
  auto* state = world_.players().get(local_player_id_);
  if (state == nullptr) return false;
  // All input-driven destruction reaches World::destroy and its notification queue.
  for (const auto& message : messages) {
    // The original applies the sequence gate per message, not per buffer.
    if (!accept_input_sequence(last_sequence_, message.sequence)) continue;
    const InputCommand& command = message.command;
    const bool has_player = state->player().valid()
      && world_.entities().get(state->player()) != nullptr;
    if (command.opcode == 5U) {
      publisher_.emit_chat(command.text);
      continue;
    }
    if ((command.opcode == 4U || command.opcode == 6U) && !has_player
        && can_spawn_player(world_, *state)) {
      reserve_spawn_placeholder(world_);
      (void)spawn_registered_player(world_, local_player_id_, state->life_epoch, command.text);
      continue;
    }
    if (command.opcode == 3U && state->player().valid()) {
      if (command.argument == 0U) {
        if (Entity* player = world_.entities().get(state->player()))
          (void)damage_entity(world_, player->handle, player->health, EntityHandle{});
      }
      continue;
    }
    if (command.opcode == 8U && state->player().valid()) {
      const std::uint8_t slot = static_cast<std::uint8_t>(command.slot_a);
      if (state->loadout().discard(world_, *state, state->profile(), slot,
                                   static_cast<std::uint16_t>(command.value_a)))
        remove_slot_petals(world_, *state, slot);
      continue;
    }
    if (command.opcode == 10U && state->player().valid()) {
      const std::uint8_t first = static_cast<std::uint8_t>(command.slot_a);
      const std::uint8_t second = static_cast<std::uint8_t>(command.slot_b);
      (void)state->loadout().swap(world_, *state, state->profile(), first,
                                  static_cast<std::uint16_t>(command.value_a), second,
                                  static_cast<std::uint16_t>(command.value_b));
      continue;
    }
    if (command.opcode != 12U) continue;
    // Original 655 stores both angle and strength on the player record; the
    // next applyPlayerControls tick consumes the latest values.
    world_.apply_input(local_player_id_, state->life_epoch, command.buttons, f32(command.angle), f32(command.strength), kOfflineInputTtl);
  }
  return true;
}

void WorkerApi::think() {
  advance_world(world_);
}

std::deque<OutputPacket> WorkerApi::flush() { return output_.drain(); }

void WorkerApi::enqueue_domain_snapshot(std::uint32_t sequence) {
  (void)output_.enqueue(OutputPacket{domain_snapshot_bytes(sequence)});
}

EntityHandle WorkerApi::spawn(EntityKind kind, std::uint16_t type_id, Vec2 position) {
  return spawn_entity_from_defaults(world_, kind, type_id, position);
}

bool WorkerApi::occupied(Vec2 position) const {
  return SpatialQuery::from_world(world_).occupied({position.x, position.y});
}


bool WorkerApi::despawn(EntityHandle handle) { return world_.destroy(handle); }

std::vector<std::uint8_t> WorkerApi::domain_snapshot_bytes(std::uint32_t sequence, std::uint32_t ack) { return publisher_.publish(world_, local_player_id_, sequence, ack); }

} // namespace engine
