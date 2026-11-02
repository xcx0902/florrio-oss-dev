#include "engine/net/peer_session.hpp"
#include "engine/sim/combat.hpp"
namespace engine::net {
namespace {
bool advances(std::uint32_t sequence, std::uint32_t previous) {
  return sequence > previous && sequence < kCounterDrainAt && sequence-previous <= kMaxSequenceAdvance;
}
bool life_command(CommandKind kind) { return kind != CommandKind::Chat && kind != CommandKind::Leave; }
bool valid_command(const Command& command) {
  WireWriter writer; writeCommand(writer,command);
  if (!writer.frame(4,1,kMaxClientFrameBytes)) return false;
  auto text = command.text;
  if (command.kind == CommandKind::Spawn) return normalize_text(text,128,32,"nickname");
  if (command.kind == CommandKind::Chat) return !text.empty();
  return text.empty();
}
}
std::optional<ErrorCode> validate_hello(const Hello& hello) {
  if (hello.protocolVersion != kProtocolVersion) return ErrorCode::Version;
  if (hello.catalogHash != kCatalogHash) return ErrorCode::Catalog;
  if (!encode_message(hello,0)) return ErrorCode::Protocol;
  return {};
}
PeerSession::PeerSession(World& world, ViewerContext identity) : identity_(identity) {
  auto* player = world.players().get(identity.player);
  if (!player || !identity.sessionEpoch || identity.sessionEpoch >= kCounterDrainAt || identity.player.raw >= kCounterDrainAt
      || std::all_of(identity.roomEpoch.begin(),identity.roomEpoch.end(),[](auto b){return b==0;})) return;
  player->clear_input(); player->last_applied_input_sequence = 0;
  player->input_session_epoch = identity.sessionEpoch; active_ = true; boundWorld_ = &world;
}
bool PeerSession::owns(const World& world) const {
  const auto* player = world.players().get(identity_.player);
  return active_ && boundWorld_ == &world && player && player->life_epoch < kCounterDrainAt
    && player->input_session_epoch == identity_.sessionEpoch && world.tick() < kCounterDrainAt;
}
ResultCode PeerSession::receive_input(const World& world, const Input& input, std::uint32_t epoch) {
  if (!bound(epoch) || !owns(world) || world.tick() >= kCounterDrainAt || !advances(input.inputSeq,receivedInput_)) return ResultCode::InvalidSequence;
  WireWriter writer; writeInput(writer,input);
  if (!writer.frame(3,epoch,kMaxClientFrameBytes)) return ResultCode::InvalidState;
  const auto* player = world.players().get(identity_.player);
  if (!player || player->life_epoch != input.lifeEpoch) return ResultCode::StaleLife;
  if (player->life != PlayerLife::kAlive) return ResultCode::InvalidState;
  const auto tick = world.tick();
  if (input.targetTick > tick+kMaxFutureInputTicks || static_cast<std::uint64_t>(input.targetTick)+kMaxPastInputTicks < tick)
    return ResultCode::InvalidState;
  // world.tick() names the next unsimulated player phase at this boundary.
  const auto target = static_cast<std::uint32_t>(std::max<std::uint64_t>(tick,input.targetTick));
  future_[target] = input;
  // One entry for the immediate phase plus at most two future phases.
  receivedInput_ = input.inputSeq;
  replication.receivedInputSeq = receivedInput_;
  return ResultCode::Ok;
}
void PeerSession::prepare_tick(World& world) {
  if (!owns(world)) { future_.clear(); return; }
  const auto* player = world.players().get(identity_.player);
  std::optional<Input> adopted;
  for (auto it = future_.begin(); it != future_.end();) {
    if (!player || it->second.lifeEpoch != player->life_epoch) { it = future_.erase(it); continue; }
    if (it->first > world.tick()) { ++it; continue; }
    if (!adopted || adopted->inputSeq < it->second.inputSeq) adopted = it->second;
    it = future_.erase(it);
  }
  if (!adopted) return;
  // A later-received immediate input supersedes an older buffered future input.
  auto* state = world.players().get(identity_.player);
  if (state && adopted->inputSeq > state->last_applied_input_sequence
      && apply_player_input(world,identity_.player,adopted->lifeEpoch,adopted->buttons,
        f32(adopted->angle),f32(adopted->strength),kInputTtlTicks)) state->input_sequence = adopted->inputSeq;
}
PeerSession::CommandReceipt PeerSession::queue_command(const World& world, const Command& command, std::uint32_t epoch) {
  if (!bound(epoch) || !owns(world) || !command.commandSeq || command.commandSeq >= kCounterDrainAt) return {ResultCode::InvalidSequence,{}};
  if (auto cached = results_.find(command.commandSeq); cached != results_.end()) return {ResultCode::Duplicate,cached->second};
  for (const auto& pending : commands_) if (pending.commandSeq == command.commandSeq) return {ResultCode::Duplicate,{}};
  if (!advances(command.commandSeq,receivedCommand_)) return {ResultCode::InvalidSequence,{}};
  if (!valid_command(command)) return {ResultCode::InvalidState,{}};
  const auto* player = world.players().get(identity_.player);
  if (!player || (life_command(command.kind) && command.lifeEpoch != player->life_epoch)) return {ResultCode::StaleLife,{}};
  if (commands_.size() >= kMaxQueuedCommands) return {ResultCode::QueueFull,{}};
  auto normalized = command;
  if (command.kind == CommandKind::Spawn) (void)normalize_text(normalized.text,128,32,"nickname");
  commands_.push_back(std::move(normalized)); receivedCommand_ = command.commandSeq; return {ResultCode::Ok,{}};
}
std::vector<CommandResult> PeerSession::execute_commands(World& world, std::vector<ChatRecord>& chats) {
  std::vector<CommandResult> output;
  if (!owns(world)) { commands_.clear(); return output; }
  for (unsigned i = 0; i < kMaxCommandsPerTick && !commands_.empty(); ++i) {
    const auto command = commands_.front(); commands_.pop_front();
    CommandResult result{command.commandSeq,ResultCode::InvalidState,{}};
    auto* state = world.players().get(identity_.player);
    if (!state || (life_command(command.kind) && command.lifeEpoch != state->life_epoch)) result.code = ResultCode::StaleLife;
    else {
      bool ok = false;
      switch(command.kind) {
        case CommandKind::Spawn:
          if (world.tick() < state->next_spawn_tick) { result.code = ResultCode::Cooldown; result.nextSpawnTick = static_cast<std::uint32_t>(state->next_spawn_tick); }
          else ok = spawn_registered_player(world,identity_.player,command.lifeEpoch,command.text).valid();
          break;
        case CommandKind::Swap: ok = swap_player_slots(world,identity_.player,command.lifeEpoch,command.slotA,command.typeA,command.slotB,command.typeB); break;
        case CommandKind::Discard: ok = discard_player_slot(world,identity_.player,command.lifeEpoch,command.slotA,command.typeA); break;
        case CommandKind::Suicide: {
          const auto* body = world.entities().get(state->player());
          if (body && body->health.value > 0) ok = damage_entity(world,body->handle,body->health,{}).died;
          break;
        }
        case CommandKind::Chat: chats.push_back({identity_.player,command.text}); ok = true; break;
        case CommandKind::Leave: leaveRequested_ = true; ok = true; break;
      }
      if (ok) result.code = ResultCode::Ok;
    }
    results_.emplace(result.commandSeq,result);
    while (results_.size() > kCommandResultWindow) results_.erase(results_.begin());
    output.push_back(result);
    if (leaveRequested_) { commands_.clear(); future_.clear(); break; }
  }
  return output;
}
bool PeerSession::accept_resync(const ResyncRequest& request, std::uint32_t epoch) {
  if (!bound(epoch) || !replication.initialized || request.baselineId != replication.baselineId
      || request.snapshotSeq > replication.snapshotSeq || !valid(request.reason)) return false;
  replication.request_full(); return true;
}
} // namespace engine::net
