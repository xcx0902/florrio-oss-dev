#pragma once
#include "engine/core/byte_reader.hpp"
#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <vector>

namespace engine {

inline constexpr std::size_t kMaxInputPacketBytes = 65536;
inline constexpr std::size_t kOutputQueueCapacity = 16;
inline constexpr std::size_t kPacketHeaderBytes = 16;
inline constexpr std::size_t kInlinePayloadBytes = 4096;
inline constexpr std::size_t kPacketXorKeyBytes = 256;

struct WorkerRequest {
  std::string func_name;
  std::int32_t callback_id = -1;
  std::vector<std::uint8_t> data;
};

struct WorkerResponse {
  std::int32_t callback_id = -1;
  bool final_response = false;
  std::vector<std::uint8_t> data;
};

struct OutputPacket {
  std::vector<std::uint8_t> payload;
};

/** Output queue with the original capacity and final-response contract. */
class OutputQueue {
 public:
  [[nodiscard]] bool enqueue(OutputPacket packet) {
    if (packets_.size() >= kOutputQueueCapacity) return false;
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

} // namespace engine
