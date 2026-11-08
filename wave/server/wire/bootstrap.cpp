#include "wire/bootstrap.hpp"

#include <bit>
#include <cmath>

#include <algorithm>
#include <array>
#include <initializer_list>
#include <limits>
#include <utility>

namespace wave::wire {
namespace {

constexpr std::string_view build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
constexpr std::array<std::uint8_t, 256> payload_key{
    0x13, 0x19, 0x77, 0x9d, 0x77, 0x21, 0xfe, 0x7a, 0xcd, 0x95, 0xe9, 0x93, 0xe0, 0x3a, 0xee, 0xed,
    0xc0, 0xac, 0xaa, 0xd5, 0xee, 0x16, 0x9d, 0xc9, 0x78, 0xde, 0xf5, 0x04, 0xdd, 0x8b, 0x32, 0x81,
    0x39, 0x68, 0x34, 0x28, 0x9c, 0x1d, 0x89, 0xd8, 0x89, 0x08, 0xd2, 0x31, 0xe8, 0x36, 0xa1, 0x0c,
    0xde, 0x93, 0x9b, 0x67, 0x00, 0x86, 0x04, 0xc4, 0x19, 0xf2, 0x85, 0x63, 0x78, 0x2f, 0x00, 0xa8,
    0x4a, 0xbd, 0xcd, 0xdc, 0x89, 0x15, 0x02, 0x38, 0x53, 0x1c, 0x97, 0x0a, 0x12, 0x0d, 0x6c, 0xf3,
    0xca, 0xbf, 0x0b, 0x4d, 0xb5, 0x6e, 0xea, 0x80, 0x8a, 0xfa, 0x30, 0xce, 0xa1, 0x3b, 0x50, 0x42,
    0x72, 0x3b, 0x0d, 0x45, 0x2c, 0x1a, 0x89, 0xb4, 0xf7, 0x1d, 0x97, 0xa5, 0x1d, 0xa9, 0xcc, 0xc3,
    0x8f, 0x9f, 0x1a, 0xe0, 0xa6, 0x10, 0x7b, 0xff, 0xb3, 0x0e, 0x33, 0x6e, 0x1e, 0xe0, 0x49, 0xc0,
    0xe3, 0x9a, 0xc9, 0xe2, 0x59, 0x41, 0xe0, 0x4e, 0xa0, 0xe1, 0xe8, 0x40, 0x47, 0x34, 0x68, 0x89,
    0x25, 0x28, 0x48, 0x7e, 0xfb, 0x13, 0x01, 0x00, 0x00, 0x37, 0xed, 0x4e, 0x8b, 0xbf, 0xa1, 0x6e,
    0x00, 0x92, 0x91, 0x4b, 0xc0, 0x56, 0xca, 0x29, 0x8e, 0x09, 0xc1, 0x88, 0x9b, 0xbb, 0x2c, 0x96,
    0xa5, 0x96, 0x12, 0x12, 0xb8, 0x6b, 0x0d, 0xe6, 0x30, 0x5f, 0x48, 0x09, 0x3e, 0x2b, 0x6d, 0x64,
    0x31, 0xc8, 0xb7, 0xfe, 0xb6, 0x4d, 0xd5, 0x9f, 0x15, 0xef, 0x87, 0x28, 0x83, 0x06, 0x0b, 0xc5,
    0x78, 0x9b, 0xf7, 0x5a, 0xc6, 0x96, 0x35, 0xce, 0x00, 0xf8, 0x82, 0x51, 0x64, 0xd1, 0xab, 0xf3,
    0x4f, 0xa6, 0x5f, 0x59, 0xc8, 0xb1, 0xe6, 0x5a, 0x98, 0x52, 0xf1, 0x59, 0x7d, 0xa4, 0x07, 0x1b,
    0xee, 0xd8, 0xfa, 0x45, 0xa4, 0x7a, 0x67, 0x0a, 0x9a, 0xae, 0x80, 0x8c, 0xda, 0xab, 0x70, 0x13,
};

constexpr std::uint32_t next(std::uint32_t state) {
  return static_cast<std::uint32_t>((std::uint64_t{state} * 83875 + 1323) % 2147171462);
}

using Permutation = std::array<std::uint8_t, 100>;

constexpr Permutation permutation(std::uint32_t state, std::initializer_list<int> fixed) {
  Permutation values{};
  for (std::size_t i = 0; i < values.size(); ++i) {
    values[i] = static_cast<std::uint8_t>(i);
  }
  for (std::size_t i = values.size() - 1; i != 0; --i) {
    state = next(state);
    std::swap(values[i], values[state % (i + 1)]);
  }
  for (const int value : fixed) {
    std::swap(values[value], *std::ranges::find(values, value));
  }
  return values;
}

constexpr Permutation invert(Permutation values) {
  Permutation inverse{};
  for (std::size_t i = 0; i < values.size(); ++i) {
    inverse[values[i]] = static_cast<std::uint8_t>(i);
  }
  return inverse;
}

constexpr auto client_inverse = invert(permutation(249858013, {3, 66, 64, 65, 48}));
constexpr auto server_permutation = permutation(3056761215, {0, 64, 4});

void transform(Bytes& bytes, const Permutation& table, std::uint32_t& state, std::uint32_t rounds) {
  while (rounds-- != 0) {
    bytes.front() = table[bytes.front()];
  }
  std::array<std::uint8_t, 22> key{};
  for (auto& byte : key) {
    state = next(state);
    byte = static_cast<std::uint8_t>(state);
  }
  for (std::size_t i = 1; i < bytes.size(); ++i) {
    bytes[i] ^= key[i % key.size()];
  }
}

void mask_payload(std::span<std::uint8_t> bytes) {
  for (std::size_t i = 0; i < bytes.size(); ++i) {
    bytes[i] ^= payload_key[i % payload_key.size()];
  }
}

void append_varint(Bytes& bytes, std::uint32_t value) {
  while (value >= 128) {
    bytes.push_back(static_cast<std::uint8_t>((value & 127) | 128));
    value >>= 7;
  }
  bytes.push_back(static_cast<std::uint8_t>(value));
}

std::optional<std::uint32_t> read_varint(std::span<const std::uint8_t>& bytes) {
  std::uint32_t value = 0;
  for (unsigned shift = 0; shift <= 28 && !bytes.empty(); shift += 7) {
    const auto byte = bytes.front();
    bytes = bytes.subspan(1);
    if (shift == 28 && byte > 15) {
      break;
    }
    value |= std::uint32_t{byte & 127u} << shift;
    if (byte < 128) {
      if (shift != 0 && byte == 0) {
        break;
      }
      return value;
    }
  }
  return std::nullopt;
}

std::optional<std::string> read_string(std::span<const std::uint8_t>& bytes, std::size_t maximum) {
  const auto end = std::ranges::find(bytes.first(std::min(bytes.size(), maximum + 1)), 0);
  const auto length = static_cast<std::size_t>(end - bytes.begin());
  if (length > maximum || length == bytes.size()) {
    return std::nullopt;
  }
  std::string value(bytes.begin(), end);
  bytes = bytes.subspan(length + 1);
  return value;
}

std::optional<float> read_float(std::span<const std::uint8_t>& bytes) {
  if (bytes.size() < 4) {
    return std::nullopt;
  }
  std::uint32_t bits = 0;
  for (unsigned i = 0; i < 4; ++i) {
    bits |= std::uint32_t{bytes[i]} << (i * 8);
  }
  bytes = bytes.subspan(4);
  const auto value = std::bit_cast<float>(bits);
  return std::isfinite(value) ? std::optional{value} : std::nullopt;
}

std::optional<Command> read_startup(std::span<const std::uint8_t> bytes) {
  const auto first = read_varint(bytes);
  if (!first || *first == 0) {
    return std::nullopt;
  }
  auto sequence = *first;
  std::vector<ReliableRequest> requests;
  for (;;) {
    ReliableAction action;
    const auto opcode = read_varint(bytes).value_or(0);
    switch (opcode) {
      case 5: {
        if (bytes.empty() || bytes.front() > 1) {
          return std::nullopt;
        }
        const bool all = bytes.front();
        bytes = bytes.subspan(1);
        const auto keep = read_varint(bytes);
        const auto kind = read_varint(bytes);
        if (!keep || !kind || *kind == 0 || *kind > 45 || bytes.empty() || bytes.front() > 5) {
          return std::nullopt;
        }
        const auto rarity = bytes.front();
        bytes = bytes.subspan(1);
        action = Craft{all, *keep, *kind, rarity};
        break;
      }
      case 12: {
        Equip equip;
        for (auto& [kind, rarity] : equip.slots) {
          const auto value = read_varint(bytes);
          if (!value || *value > 45) {
            return std::nullopt;
          }
          kind = *value;
          if (kind) {
            if (bytes.empty() || bytes.front() > 5) {
              return std::nullopt;
            }
            rarity = bytes.front();
            bytes = bytes.subspan(1);
          }
        }
        action = equip;
        break;
      }
      case 28: {
        Swap swap{};
        for (auto [slot, item] : {std::pair{&swap.first, &swap.first_item},
                                  std::pair{&swap.second, &swap.second_item}}) {
          if (bytes.empty() || bytes.front() >= 16) {
            return std::nullopt;
          }
          *slot = bytes.front();
          bytes = bytes.subspan(1);
          const auto kind = read_varint(bytes);
          if (!kind || *kind > 45) {
            return std::nullopt;
          }
          item->first = *kind;
          if (*kind) {
            if (bytes.empty() || bytes.front() > 5) {
              return std::nullopt;
            }
            item->second = bytes.front();
            bytes = bytes.subspan(1);
          }
        }
        if (swap.first == swap.second) {
          return std::nullopt;
        }
        action = swap;
        break;
      }
      case 25:
      case 34:  // $456: no-argument completion of the optional pre-roll ad attempt.
        break;
      case 11:  // Original live-game Exit.
      case 21:  // Original death-screen Continue / Enter.
      case 38:  // Original squad panel close / Leave squad.
        action = Leave{};
        break;
      case 13: {
        if (bytes.empty() || bytes.front() != 1) {
          return std::nullopt;
        }
        bytes = bytes.subspan(1);
        auto agent = read_string(bytes, 512);
        auto token = read_string(bytes, 1024);
        auto guest = read_string(bytes, 64);
        if (!agent || !token || !guest) {
          return std::nullopt;
        }
        action = Identify{std::move(*agent), std::move(*token), std::move(*guest)};
        break;
      }
      case 30: {
        auto value = read_string(bytes, 64);
        if (!value) {
          return std::nullopt;
        }
        action = Nickname{std::move(*value)};
        break;
      }
      case 4: {
        // Original invitation navigation: opcode 4, boolean 1, room code.
        if (bytes.empty() || bytes.front() != 1) {
          return std::nullopt;
        }
        bytes = bytes.subspan(1);
        auto code = read_string(bytes, 32);
        if (!code || code->empty()) {
          return std::nullopt;
        }
        action = JoinSquad{std::move(*code)};
        break;
      }
      case 27:
      case 7: {
        if (bytes.empty() || bytes.front() > 1) {
          return std::nullopt;
        }
        const bool value = bytes.front() != 0;
        bytes = bytes.subspan(1);
        if (opcode == 27) {
          action = CreateSquad{value};
        } else {
          action = Ready{value};
        }
        break;
      }
      case 9: {
        const auto buttons = read_varint(bytes);
        const auto angle = read_float(bytes);
        const auto strength = read_float(bytes);
        if (!buttons || !angle || !strength || *strength < 0) {
          return std::nullopt;
        }
        action = Move{*buttons, *angle, *strength};
        break;
      }
      case 6: {
        const auto size = read_varint(bytes);
        if (!size || *size == 0 || *size > bytes.size()) {
          return std::nullopt;
        }
        bytes = bytes.subspan(*size);
        break;
      }
      default:
        return std::nullopt;
    }
    requests.push_back({sequence, std::move(action)});
    if (bytes.empty()) {
      return Startup{*first, sequence, std::move(requests)};
    }
    const auto next_sequence = read_varint(bytes);
    if (!next_sequence || sequence == std::numeric_limits<std::uint32_t>::max() ||
        *next_sequence != sequence + 1) {
      return std::nullopt;
    }
    sequence = *next_sequence;
  }
}

Bytes seal(Bytes bytes, std::uint32_t& state, std::size_t masked_offset) {
  mask_payload(std::span(bytes).subspan(masked_offset));
  state = next(state);
  transform(bytes, server_permutation, state, state % 12 + 1);
  return bytes;
}

}  // namespace

bool is_hello(std::span<const std::uint8_t> bytes) {
  return hello_guest(bytes).has_value();
}

std::optional<std::string> hello_guest(std::span<const std::uint8_t> bytes) {
  if (bytes.size() < build.size() + 3 || bytes.size() > build.size() + 131 || bytes.front() != 48 ||
      !std::ranges::equal(bytes.subspan(1, build.size()), build)) {
    return std::nullopt;
  }
  bytes = bytes.subspan(1 + build.size());
  const auto account = read_string(bytes, 0);
  const auto guest = read_string(bytes, 128);
  if (!account || !guest || !bytes.empty()) {
    return std::nullopt;
  }
  return guest;
}

std::optional<Command> Bootstrap::receive(Bytes bytes) {
  if (bytes.empty() || bytes.size() > max_frame_bytes || bytes.front() >= client_inverse.size()) {
    return std::nullopt;
  }
  switch (bytes.front()) {
    case 3:
    case 48:
    case 64:
    case 65:
    case 66:
      return std::nullopt;
    default:
      break;
  }

  client_state_ = next(client_state_);
  transform(bytes, client_inverse, client_state_, (client_state_ & 15) + 1);
  std::span payload = std::span(bytes).subspan(1);
  std::span<const std::uint8_t> header = payload;
  if (read_varint(header) != 0) {
    return std::nullopt;
  }
  payload = payload.last(header.size());

  if (bytes.front() == 2) {
    if (const auto tick = read_varint(header); tick && header.empty()) {
      return WorldAck{*tick};
    }
    return std::nullopt;
  }
  if (bytes.front() != 1) {
    return std::nullopt;
  }

  mask_payload(payload);
  return read_startup(payload);
}

Bytes Bootstrap::guest_id(std::string_view id) {
  Bytes bytes{5, 0, 0, 14};
  bytes.insert(bytes.end(), id.begin(), id.end());
  bytes.push_back(0);
  return seal(std::move(bytes), server_state_, 2);
}

Bytes Bootstrap::world(std::uint32_t tick, std::uint32_t acknowledged_request,
                       bool initial_profile) {
  Bytes bytes{1, 0};
  append_varint(bytes, tick);
  const auto offset = bytes.size();
  append_varint(bytes, acknowledged_request);
  bytes.insert(bytes.end(), 4, 0);
  if (initial_profile) {
    // Entity 8193 uses the full form with the local profile component.
    constexpr std::array<std::uint8_t, 8> profile{1, 32, 0, 0, 0xcc, 0, 0x80, 0};
    bytes.insert(bytes.end(), profile.begin(), profile.end());
    // Match $140's level-one guest default, not an invalid level-zero flower.
    bytes.push_back(1);
    bytes.insert(bytes.end(), 606, 0);
  }
  // End the entity list and the bundled command section.
  bytes.insert(bytes.end(), 5, 0);
  return seal(std::move(bytes), server_state_, offset);
}

Bytes Bootstrap::snapshot(std::uint32_t tick, std::uint32_t acknowledged_request,
                          std::span<const std::uint8_t> records,
                          std::span<const std::uint32_t> removed,
                          std::span<const std::uint8_t> commands) {
  Bytes bytes{1, 0};
  append_varint(bytes, tick);
  const auto offset = bytes.size();
  append_varint(bytes, acknowledged_request);
  // The client skips this length-delimited removal section on repeated ticks.
  append_varint(bytes, static_cast<std::uint32_t>(removed.size() * 4 + 2));
  append_varint(bytes, static_cast<std::uint32_t>(removed.size()));
  bytes.push_back(0);
  for (const auto handle : removed) {
    for (unsigned i = 0; i < 4; ++i) {
      bytes.push_back(static_cast<std::uint8_t>(handle >> (i * 8)));
    }
  }
  bytes.push_back(0);
  bytes.insert(bytes.end(), records.begin(), records.end());
  // $601 skips a byte after the u32 entity terminator before reading commands.
  bytes.insert(bytes.end(), 5, 0);
  bytes.insert(bytes.end(), commands.begin(), commands.end());
  bytes.push_back(0);
  return seal(std::move(bytes), server_state_, offset);
}

Bytes Bootstrap::disconnect() {
  return {0, 0};
}

}  // namespace wave::wire
