#pragma once
#include "engine/core/byte_reader.hpp"
#include "engine/core/error.hpp"
#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace engine {

struct InputCommand {
  std::uint32_t opcode = 0;
  std::uint32_t buttons = 0;
  std::uint32_t argument = 0;
  std::uint32_t slot_a = 0;
  std::uint32_t slot_b = 0;
  std::uint32_t value_a = 0;
  std::uint32_t value_b = 0;
  float angle = 0.0F;
  float strength = 0.0F;
  std::string text;
  std::vector<std::string> texts;
  std::vector<std::uint8_t> payload;
};

/** Original sequence gate: sequence 0 is always accepted; otherwise the value
 * must be strictly greater than the last accepted sequence. */
[[nodiscard]] inline bool accept_input_sequence(std::uint32_t& last, std::uint32_t sequence) {
  if (sequence == 0U) return true;
  if (sequence <= last) return false;
  last = sequence;
  return true;
}

/** One worker message inside a send buffer. The original sp_server_send loops
 * over (sequence, command) pairs until the buffer is exhausted, so one send can
 * carry several messages with independent sequence numbers. */
struct InputMessage {
  std::uint32_t sequence = 0;
  InputCommand command;
};

/** Decode a worker input packet: rolling XOR with the 256-byte key, then
 * repeated (sequence varint, opcode varint, payload) messages. */
[[nodiscard]] Status decode_input_packet(std::span<const std::uint8_t> packet,
                                         std::span<const std::uint8_t> key,
                                         std::vector<InputMessage>& messages);

} // namespace engine
