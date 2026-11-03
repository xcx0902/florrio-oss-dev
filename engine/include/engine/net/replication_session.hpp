#pragma once
#include "engine/net/tick_changes.hpp"
#include <map>

namespace engine::net {
using RoomEpoch = std::array<std::uint8_t, 16>;
struct ViewerContext {
  PlayerId player;
  RoomEpoch roomEpoch;
  std::uint32_t sessionEpoch = 0;
  bool dense = true;
};
struct ReplicationSession {
  RoomEpoch roomEpoch{};
  PlayerId player{};
  std::uint32_t sessionEpoch = 0, baselineId = 0, snapshotSeq = 0;
  std::uint32_t controlledHandle = 0;
  std::uint32_t receivedInputSeq = 0;
  std::uint32_t eventTick = 0, eventOrdinal = 0;
  bool initialized = false, needsFull = true;
  Vec2 viewerPosition;
  f32 viewerScale{0.9F};
  // Wire handle includes generation; no cache can survive a slot's reuse.
  std::map<std::uint32_t, std::vector<std::uint8_t>> published;
  void request_full() { needsFull = true; }
};
struct Publication {
  std::vector<std::uint8_t> bytes;
  Snapshot snapshot;
  std::vector<std::uint8_t> leaderboardBytes;
};
/** Transactional: failure changes neither World nor session. Bytes own their memory. */
[[nodiscard]] std::optional<Publication> publish(const World& world, const TickChanges& changes,
                                                 const ViewerContext& viewer,
                                                 ReplicationSession& session);

/** Account active + pending owned buffers. Overflow requires teardown, never dropping a delta. */
class SnapshotWriteQueue {
 public:
  bool enqueue(std::vector<std::uint8_t> bytes) {
    if (closed_ || bytes.size() > kMaxQueuedWriteBytes - queued_) {
      closed_ = true;
      return false;
    }
    queued_ += bytes.size();
    queue_.push_back(std::move(bytes));
    return true;
  }
  const std::vector<std::uint8_t>* front() const {
    return queue_.empty() ? nullptr : &queue_.front();
  }
  void complete_write() {
    if (!queue_.empty()) {
      queued_ -= queue_.front().size();
      queue_.pop_front();
    }
  }
  std::size_t bytes() const { return queued_; }
  bool closed() const { return closed_; }
  std::optional<ErrorCode> close_reason() const {
    return closed_ ? std::optional{ErrorCode::SlowConsumer} : std::nullopt;
  }

 private:
  std::deque<std::vector<std::uint8_t>> queue_;
  std::size_t queued_ = 0;
  bool closed_ = false;
};
}  // namespace engine::net
