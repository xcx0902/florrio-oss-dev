#include "engine/net/input.hpp"
#include "engine/net/protocol.hpp"
#include <cstring>

namespace engine {

namespace {

/** Original readString: scan to NUL or end-of-buffer, never fail. */
std::string read_lossy_cstring(engine::ByteReader& reader) {
  std::string value;
  while (!reader.eof()) {
    const auto byte = reader.read_u8();
    if (!byte || *byte == 0U) {
      break;
    }
    value.push_back(static_cast<char>(*byte));
  }
  return value;
}

/** Original readSanitizedFloat: the bit test maps subnormals, NaN and
 * infinities to zero. */
float sanitized_float(std::uint32_t bits) {
  if (((bits + 8388608U) & 2130706432U) == 0U) {
    return 0.0F;
  }
  float value;
  std::memcpy(&value, &bits, sizeof(value));
  return value;
}

/** Original readByte: an out-of-bounds read yields zero instead of aborting the
 * whole packet. */
std::uint8_t read_byte_or_zero(ByteReader& reader) {
  const auto value = reader.read_u8();
  return value ? *value : 0U;
}

/** Original readVarUint: an out-of-bounds read yields the partial value, and a
 * truncated multi-byte varint keeps the bits it did read. */
std::uint32_t read_varint_or_zero(ByteReader& reader) {
  const auto value = reader.read_varint32();
  return value ? *value : 0U;
}

std::uint32_t read_u32_or_zero(ByteReader& reader) {
  const auto value = reader.read_u32_le();
  return value ? *value : 0U;
}

}  // namespace

Status decode_input_packet(std::span<const std::uint8_t> packet, std::span<const std::uint8_t> key,
                           std::vector<InputMessage>& messages) {
  // The original sp_server_send accepts an empty packet (the loop breaks on the
  // cursor check) and rejects only packets above 65536 bytes by setting the
  // connection error flag.
  if (packet.size() > kMaxInputPacketBytes) {
    return Status::kInvalidArgument;
  }
  if (packet.empty()) {
    return Status::kOk;
  }
  std::vector<std::uint8_t> decoded(packet.begin(), packet.end());
  apply_packet_xor(decoded, key);
  ByteReader reader(decoded);
  while (!reader.eof()) {
    const std::uint32_t sequence = read_varint_or_zero(reader);
    // The original reads the opcode even when the sequence was the last byte;
    // an end-of-buffer opcode read yields zero and dispatches the empty
    // handshake, which is how the restart packet `02 04 03 06 00` terminates.
    const std::uint32_t opcode = read_varint_or_zero(reader);
    InputCommand command;
    command.opcode = opcode;
    const auto input_opcode = static_cast<protocol::InputOpcode>(opcode);
    switch (input_opcode) {
      case protocol::InputOpcode::kSuicide:
      case protocol::InputOpcode::kDisconnect: {
        command.argument = read_varint_or_zero(reader);
        break;
      }
      case protocol::InputOpcode::kDiscardPetal: {
        command.slot_a = read_byte_or_zero(reader);
        command.value_a = read_byte_or_zero(reader);
        break;
      }
      case protocol::InputOpcode::kSwapPetals: {
        command.slot_a = read_byte_or_zero(reader);
        command.value_a = read_byte_or_zero(reader);
        command.slot_b = read_byte_or_zero(reader);
        command.value_b = read_byte_or_zero(reader);
        break;
      }
      case protocol::InputOpcode::kInputButtonsAngleStrength: {
        command.buttons = read_varint_or_zero(reader);
        command.angle = sanitized_float(read_u32_or_zero(reader));
        command.strength = sanitized_float(read_u32_or_zero(reader));
        break;
      }
      case protocol::InputOpcode::kHandshakeString:
      case protocol::InputOpcode::kHandshakeStringAlt: {
        command.value_a = read_byte_or_zero(reader);
        const int count = input_opcode == protocol::InputOpcode::kHandshakeString ? 3 : 2;
        for (int index = 0; index < count; ++index) {
          command.texts.push_back(read_lossy_cstring(reader));
        }
        if (!command.texts.empty()) {
          command.text = command.texts.front();
        }
        break;
      }
      case protocol::InputOpcode::kString: {
        command.text = read_lossy_cstring(reader);
        command.texts.push_back(command.text);
        break;
      }
      case protocol::InputOpcode::kPlayerSpawnAndName: {
        command.text = read_lossy_cstring(reader);
        command.texts.push_back(command.text);
        break;
      }
      case protocol::InputOpcode::kRestart:
      case protocol::InputOpcode::kBenchCycle:
        break;
      default: {
        // Reserved opcodes 1/9/11 and unknown commands keep the remaining bytes
        // opaque, matching the original switch default (no operand reads).
        const std::size_t remaining = reader.remaining();
        const auto payload = reader.read_bytes(remaining);
        command.payload.assign(payload.begin(), payload.end());
        break;
      }
    }
    messages.push_back(InputMessage{sequence, std::move(command)});
  }
  return Status::kOk;
}

}  // namespace engine
