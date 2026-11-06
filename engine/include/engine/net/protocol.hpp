#pragma once
#include "engine/core/byte_reader.hpp"
#include "engine/net/generated_protocol.hpp"
#include <cstddef>
#include <cstdint>
#include <deque>
#include <span>
#include <vector>

namespace engine {

inline constexpr std::size_t kMaxInputPacketBytes = protocol::kMaxInputPacketBytes;
inline constexpr std::size_t kOutputQueueCapacity = protocol::kOutputQueueCapacity;
inline constexpr std::size_t kPacketXorKeyBytes = protocol::kInputXorKeyBytes;

struct OutputPacket {
  std::vector<std::uint8_t> payload;
};

/** Bounded output queue holding at most kOutputQueueCapacity packets. Enqueue
 * fails once full; drain() hands every queued packet to the caller, which owns
 * the final-response framing. */
class OutputQueue {
 public:
  [[nodiscard]] bool enqueue(OutputPacket packet) {
    if (packets_.size() >= kOutputQueueCapacity) {
      return false;
    }
    packets_.push_back(std::move(packet));
    return true;
  }

  [[nodiscard]] bool full() const { return packets_.size() >= kOutputQueueCapacity; }
  [[nodiscard]] std::size_t size() const { return packets_.size(); }
  [[nodiscard]] bool empty() const { return packets_.empty(); }

  /** Move all queued packets out; the caller owns the final-response framing. */
  [[nodiscard]] std::deque<OutputPacket> drain() {
    std::deque<OutputPacket> result = std::move(packets_);
    packets_.clear();
    return result;
  }
  void clear() { packets_.clear(); }

 private:
  std::deque<OutputPacket> packets_;
};

/** In-place rolling XOR used by both the input and snapshot paths. */
inline void apply_packet_xor(std::span<std::uint8_t> bytes, std::span<const std::uint8_t> key) {
  xor_in_place(bytes, key);
}

}  // namespace engine
