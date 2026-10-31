#include "engine/net/worker_api.hpp"
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
  world_.initialize();
  world_.set_auto_populate(populate);
  if (populate) {
    // spServerInit draws one 32-bit value through original 102 (a two-draw
    // acceptance path for the shipped seed) before original 400 fills the
    // population bands. Keep the same RNG position so the first species and
    // every subsequent spawn match the reference world.
    (void)world_.random().next();
    (void)world_.random().next();
    (void)populate_world(world_, SpawnTable::from_catalog());
  }
  output_.clear();
  last_sequence_ = 0;
  next_spawn_time_ms_ = 0.0;
  publisher_.reset(populate);
}

bool WorkerApi::send(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key) {
  if (!world_.initialized() || packet.empty() || packet.size() > kMaxInputPacketBytes) return false;
  std::vector<InputMessage> messages;
  if (decode_input_packet(packet, key, messages) != Status::kOk) return false;
  // All input-driven destruction reaches World::destroy and its notification queue.
  for (const auto& message : messages) {
    // The original applies the sequence gate per message, not per buffer.
    if (!accept_input_sequence(last_sequence_, message.sequence)) continue;
    const InputCommand& command = message.command;
    const bool has_player = world_.player().valid()
      && world_.entities().get(world_.player()) != nullptr;
    if (command.opcode == 5U) {
      publisher_.emit_chat(command.text);
      continue;
    }
    if (command.opcode == 4U && !has_player && world_.time_ms() >= next_spawn_time_ms_) {
      // Compatibility entry point for local restart. Original opcode4 itself
      // schedules a transport/game restart; use the same spawn state and gate
      // as opcode6 instead of preserving the previous life.
      const bool fresh = world_.profile().level() == 0
        && world_.profile().inventory_count() == 0;
      const PlayerProfile profile = fresh ? make_default_profile() : make_respawn_profile(world_);
      reserve_spawn_placeholder(world_);
      (void)spawn_player_default(world_, command.text, profile);
      (void)spawn_loadout_petals(world_);
      if (world_.player().valid()) next_spawn_time_ms_ = world_.time_ms() + 2500.0;
      continue;
    }
    if (command.opcode == 6U && !has_player && world_.time_ms() >= next_spawn_time_ms_) {
      reserve_spawn_placeholder(world_);
      {
        const bool fresh = world_.profile().level() == 0
          && world_.profile().inventory_count() == 0;
        const PlayerProfile profile = fresh ? make_default_profile() : make_respawn_profile(world_);
        (void)spawn_player_default(world_, command.text, profile);
      }
      (void)spawn_loadout_petals(world_);
      if (world_.player().valid()) next_spawn_time_ms_ = world_.time_ms() + 2500.0;
      continue;
    }
    if (command.opcode == 3U && world_.player().valid()) {
      if (command.argument == 0U) {
        if (Entity* player = world_.entities().get(world_.player()))
          (void)damage_entity(world_, player->handle, player->health, EntityHandle{});
      }
      continue;
    }
    if (command.opcode == 8U && world_.player().valid()) {
      const std::uint8_t slot = static_cast<std::uint8_t>(command.slot_a);
      if (world_.loadout().discard(world_, world_.profile(), slot,
                                   static_cast<std::uint16_t>(command.value_a)))
        remove_slot_petals(world_, slot);
      continue;
    }
    if (command.opcode == 10U && world_.player().valid()) {
      const std::uint8_t first = static_cast<std::uint8_t>(command.slot_a);
      const std::uint8_t second = static_cast<std::uint8_t>(command.slot_b);
      (void)world_.loadout().swap(world_, world_.profile(), first,
                                  static_cast<std::uint16_t>(command.value_a), second,
                                  static_cast<std::uint16_t>(command.value_b));
      continue;
    }
    if (command.opcode != 12U) continue;
    // Original 655 stores both angle and strength on the player record; the
    // next applyPlayerControls tick consumes the latest values.
    world_.apply_input(command.buttons, f32(command.angle), f32(command.strength));
  }
  return true;
}

void WorkerApi::think() {
  if (!world_.initialized()) return;
  tick(world_, static_cast<double>(kTickMilliseconds));
  // Original 654 appends six random bytes (six original-102 calls) while
  // building the per-tick snapshot seed. They do not affect simulation state,
  // but they advance the shared RNG and therefore every later spawn roll.
  for (int index = 0; index < 6; ++index) (void)world_.random().next();
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

std::vector<std::uint8_t> WorkerApi::domain_snapshot_bytes(std::uint32_t sequence, std::uint32_t ack) { return publisher_.publish(world_, sequence, ack); }

} // namespace engine
