#pragma once
#include <cstdint>
#include <cstring>
#include <optional>
#include <span>
#include <string>
#include <vector>

namespace engine {

enum class ParseError {
  kNone,
  kOutOfBounds,
  kVarintOverflow,
  kInvalidUtf8,
};

/** Little-endian, bounds-checked reader for worker packets. */
class ByteReader {
 public:
  explicit ByteReader(std::span<const std::uint8_t> bytes) : bytes_(bytes) {}

  [[nodiscard]] bool eof() const { return cursor_ >= bytes_.size(); }
  [[nodiscard]] std::size_t remaining() const { return bytes_.size() - cursor_; }
  [[nodiscard]] std::size_t cursor() const { return cursor_; }
  [[nodiscard]] ParseError error() const { return error_; }

  [[nodiscard]] std::optional<std::uint8_t> read_u8() {
    if (cursor_ + 1 > bytes_.size()) { error_ = ParseError::kOutOfBounds; return std::nullopt; }
    return bytes_[cursor_++];
  }

  [[nodiscard]] std::optional<std::uint32_t> read_u32_le() {
    if (cursor_ + 4 > bytes_.size()) { error_ = ParseError::kOutOfBounds; return std::nullopt; }
    const std::uint32_t value = static_cast<std::uint32_t>(bytes_[cursor_]) |
      (static_cast<std::uint32_t>(bytes_[cursor_ + 1]) << 8U) |
      (static_cast<std::uint32_t>(bytes_[cursor_ + 2]) << 16U) |
      (static_cast<std::uint32_t>(bytes_[cursor_ + 3]) << 24U);
    cursor_ += 4;
    return value;
  }

  [[nodiscard]] std::optional<std::uint16_t> read_u16_le() {
    const auto low = read_u8();
    if (!low) return std::nullopt;
    const auto high = read_u8();
    if (!high) return std::nullopt;
    return static_cast<std::uint16_t>(low.value() | (high.value() << 8U));
  }

  [[nodiscard]] std::optional<double> read_f64_le() {
    std::uint64_t bits = 0;
    for (std::uint32_t index = 0; index < 8; ++index) {
      const auto byte = read_u8();
      if (!byte) return std::nullopt;
      bits |= static_cast<std::uint64_t>(byte.value()) << (index * 8U);
    }
    double value;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
  }

  [[nodiscard]] std::optional<float> read_f32_le() {
    const auto bits = read_u32_le();
    if (!bits) return std::nullopt;
    float value;
    std::uint32_t raw = *bits;
    static_assert(sizeof(float) == sizeof(raw));
    std::memcpy(&value, &raw, sizeof(value));
    return value;
  }

  /** Unsigned LEB128, at most five bytes (matching the original reader). */
  [[nodiscard]] std::optional<std::uint32_t> read_varint32() {
    std::uint32_t value = 0;
    for (unsigned index = 0; index < 5; ++index) {
      const auto byte = read_u8();
      if (!byte) return std::nullopt;
      value |= static_cast<std::uint32_t>(*byte & 0x7FU) << (7U * index);
      if ((*byte & 0x80U) == 0U) return value;
    }
    error_ = ParseError::kVarintOverflow;
    return std::nullopt;
  }

  [[nodiscard]] std::optional<std::string> read_cstring(std::size_t limit = 65536) {
    std::string value;
    while (cursor_ < bytes_.size() && value.size() < limit) {
      const std::uint8_t byte = bytes_[cursor_++];
      if (byte == 0) return value;
      value.push_back(static_cast<char>(byte));
    }
    error_ = ParseError::kOutOfBounds;
    return std::nullopt;
  }

  [[nodiscard]] std::span<const std::uint8_t> read_bytes(std::size_t count) {
    if (cursor_ + count > bytes_.size()) { error_ = ParseError::kOutOfBounds; return {}; }
    const auto view = bytes_.subspan(cursor_, count);
    cursor_ += count;
    return view;
  }

 private:
  std::span<const std::uint8_t> bytes_;
  std::size_t cursor_ = 0;
  ParseError error_ = ParseError::kNone;
};

/** Little-endian writer used by the output queue and tests. */
class ByteWriter {
 public:
  void write_u8(std::uint8_t value) { bytes_.push_back(value); }
  void write_u32_le(std::uint32_t value) {
    bytes_.push_back(static_cast<std::uint8_t>(value & 0xFFU));
    bytes_.push_back(static_cast<std::uint8_t>((value >> 8U) & 0xFFU));
    bytes_.push_back(static_cast<std::uint8_t>((value >> 16U) & 0xFFU));
    bytes_.push_back(static_cast<std::uint8_t>((value >> 24U) & 0xFFU));
  }
  void write_u16_le(std::uint16_t value) {
    write_u8(static_cast<std::uint8_t>(value & 0xFFU));
    write_u8(static_cast<std::uint8_t>((value >> 8U) & 0xFFU));
  }
  void write_f64_le(double value) {
    std::uint64_t bits;
    std::memcpy(&bits, &value, sizeof(bits));
    for (std::uint32_t index = 0; index < 8; ++index)
      write_u8(static_cast<std::uint8_t>((bits >> (index * 8U)) & 0xFFU));
  }
  void write_f32_le(float value) {
    std::uint32_t raw;
    std::memcpy(&raw, &value, sizeof(raw));
    write_u32_le(raw);
  }
  void write_varint32(std::uint32_t value) {
    do {
      std::uint8_t byte = static_cast<std::uint8_t>(value & 0x7FU);
      value >>= 7U;
      if (value != 0U) byte |= 0x80U;
      bytes_.push_back(byte);
    } while (value != 0U);
  }
  void write_bytes(std::span<const std::uint8_t> bytes) { bytes_.insert(bytes_.end(), bytes.begin(), bytes.end()); }
  [[nodiscard]] const std::vector<std::uint8_t>& bytes() const { return bytes_; }
  [[nodiscard]] std::vector<std::uint8_t>& bytes() { return bytes_; }

 private:
  std::vector<std::uint8_t> bytes_;
};

inline void xor_in_place(std::span<std::uint8_t> bytes, std::span<const std::uint8_t> key) {
  if (key.empty()) return;
  for (std::size_t index = 0; index < bytes.size(); ++index) bytes[index] ^= key[index % key.size()];
}

} // namespace engine
