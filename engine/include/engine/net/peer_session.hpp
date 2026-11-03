#pragma once
#include "engine/net/replication_session.hpp"
#include "engine/sim/player_commands.hpp"

namespace engine::net {
[[nodiscard]] std::optional<ErrorCode> validate_hello(const Hello& hello);
/** Connection binding owns sequence windows; messages never select another player. */
class PeerSession {
 public:
  explicit PeerSession(World& world, ViewerContext identity);
  void invalidate() {
    active_ = false;
    future_.clear();
    commands_.clear();
  }
  [[nodiscard]] const ViewerContext& identity() const { return identity_; }
  [[nodiscard]] std::uint32_t last_received_input_seq() const { return receivedInput_; }
  [[nodiscard]] ResultCode receive_input(const World& world, const Input& input,
                                         std::uint32_t epoch);
  /** Called before the world's next player phase. Only adoption renews the lease. */
  void prepare_tick(World& world);
  /** Ok with no result means queued; duplicates return their cached result. */
  struct CommandReceipt {
    ResultCode code;
    std::optional<CommandResult> result;
  };
  [[nodiscard]] CommandReceipt queue_command(const World& world, const Command& command,
                                             std::uint32_t epoch);
  [[nodiscard]] std::vector<CommandResult> execute_commands(World& world,
                                                            std::vector<ChatRecord>& chats);
  /** Leave is a host lifecycle request; grace cleanup must not run as a command. */
  [[nodiscard]] bool leave_requested() const { return leaveRequested_; }
  [[nodiscard]] bool accept_resync(const ResyncRequest& request, std::uint32_t epoch);
  ReplicationSession replication;

 private:
  bool bound(std::uint32_t epoch) const {
    return active_ && epoch == identity_.sessionEpoch && epoch > 0 && epoch < kCounterDrainAt;
  }
  bool owns(const World& world) const;
  bool active_ = false;
  bool leaveRequested_ = false;
  const World* boundWorld_ = nullptr;
  ViewerContext identity_;
  std::uint32_t receivedInput_ = 0, receivedCommand_ = 0;
  std::map<std::uint32_t, Input> future_;
  std::deque<Command> commands_;
  std::map<std::uint32_t, CommandResult> results_;
};
}  // namespace engine::net
