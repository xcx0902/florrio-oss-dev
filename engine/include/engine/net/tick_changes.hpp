#pragma once
#include "engine/model/world.hpp"
#include "engine/net/generated_multiplayer.hpp"

namespace engine::net {
struct ChatRecord { PlayerId sender; std::string text; };
/** Room freezes once after simulation. Every publisher reads the same owned value. */
struct TickChanges {
  std::uint32_t serverTick = 0;
  std::vector<EntityHandle> destroyed;
  std::vector<TickEvent> events;
};
[[nodiscard]] std::optional<TickChanges> freeze_tick_changes(const World& world,
    std::span<const ChatRecord> chats = {});
/** Sole post-publication cleanup, including ticks with no connected observers. */
void finish_tick_changes(World& world);
} // namespace engine::net
