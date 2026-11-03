#include "engine/net/tick_changes.hpp"
namespace engine::net {
std::optional<TickChanges> freeze_tick_changes(const World& world,
                                               std::span<const ChatRecord> chats) {
  if (world.tick() >= kCounterDrainAt) {
    return {};
  }
  TickChanges result{static_cast<std::uint32_t>(world.tick()), world.destroyed(), {}};
  for (const auto& hit : world.hit_events()) {
    if (hit.source.player.raw > UINT32_MAX) {
      return {};
    }
    TickEvent event;
    event.kind = EventKind::Hit;
    event.target = hit.target.to_wire();
    event.actorHandle = hit.attacker.to_wire();
    event.actorPlayerId = static_cast<std::uint32_t>(hit.source.player.raw);
    event.amount = hit.amount.value;
    result.events.push_back(std::move(event));
  }
  bool valid = true;
  world.players().for_each([&](const PlayerState& player) {
    if (player.id().raw > UINT32_MAX) {
      valid = false;
      return;
    }
    for (const auto& transfer : player.loadout().pickup_transfers()) {
      TickEvent event;
      event.kind = EventKind::Pickup;
      event.target = transfer.drop.to_wire();
      event.actorPlayerId = static_cast<std::uint32_t>(player.id().raw);
      event.actorHandle = player.player().to_wire();
      event.slot = transfer.slot;
      result.events.push_back(std::move(event));
    }
  });
  for (const auto& chat : chats) {
    if (chat.sender.raw > UINT32_MAX) {
      return {};
    }
    TickEvent event;
    event.kind = EventKind::Chat;
    event.actorPlayerId = static_cast<std::uint32_t>(chat.sender.raw);
    event.text = chat.text;
    result.events.push_back(std::move(event));
  }
  if (!valid || result.events.size() > kMaxSnapshotEvents) {
    return {};
  }
  std::uint32_t ordinal = 0;
  for (auto& event : result.events) {
    event.tick = result.serverTick;
    event.ordinal = ++ordinal;
  }
  return result;
}
void finish_tick_changes(World& world) {
  world.clear_destroyed();
  world.clear_hit_events();
  world.players().for_each([](PlayerState& player) { player.loadout().clear_pickup_transfers(); });
}
}  // namespace engine::net
