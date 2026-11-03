#pragma once
#include "engine/core/byte_reader.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <string_view>

namespace engine::net {
// Wire primitives are shared by the generated codecs, never by native layout.
bool normalize_text(std::string& value, std::size_t bytes, std::size_t points,
                    std::string_view kind);

class WireWriter {
 public:
  void fail() { ok_ = false; }
  void u8(std::uint8_t v, double min = 0, double max = 255) {
    check(v, min, max);
    out_.write_u8(v);
  }
  void u16(std::uint16_t v, double min = 0, double max = 65535) {
    check(v, min, max);
    out_.write_u16_le(v);
  }
  void u32(std::uint32_t v, double min = 0, double max = 4294967295.0) {
    check(v, min, max);
    out_.write_u32_le(v);
  }
  void f32(float v, double min = -INFINITY, double max = INFINITY) {
    check(v, min, max);
    out_.write_f32_le(v);
  }
  void f64(double v, double min = -INFINITY, double max = INFINITY) {
    check(v, min, max);
    out_.write_f64_le(v);
  }
  void boolean(bool v) { out_.write_u8(v ? 1 : 0); }
  void length(std::size_t n, std::size_t fixed, std::size_t max, bool prefix) {
    if (n > max || (fixed && n != fixed)) {
      fail();
    }
    if (prefix) {
      out_.write_varint32(static_cast<std::uint32_t>(n));
    }
  }
  template <class T>
  void bytes(const T& v, std::size_t fixed, std::size_t max) {
    length(v.size(), fixed, max, !fixed);
    if (ok_) {
      out_.write_bytes(v);
    }
  }
  void text(std::string v, std::size_t max, std::size_t points, std::string_view kind) {
    if (!normalize_text(v, max, points, kind)) {
      fail();
      return;
    }
    out_.write_varint32(static_cast<std::uint32_t>(v.size()));
    out_.write_bytes({reinterpret_cast<const std::uint8_t*>(v.data()), v.size()});
  }
  [[nodiscard]] std::optional<std::vector<std::uint8_t>>
  frame(std::uint8_t type, std::uint32_t epoch, std::size_t max) const;
  [[nodiscard]] const std::vector<std::uint8_t>& payload() const { return out_.bytes(); }

 private:
  void check(double v, double min, double max) {
    if (!std::isfinite(v) || v < min || v > max) {
      fail();
    }
  }
  ByteWriter out_;
  bool ok_ = true;
};

class WireReader {
 public:
  explicit WireReader(std::span<const std::uint8_t> bytes) : in_(bytes) {}
  void fail() { ok_ = false; }
  std::uint8_t u8(double min = 0, double max = 255) { return number(in_.read_u8(), min, max); }
  std::uint16_t u16(double min = 0, double max = 65535) {
    return number(in_.read_u16_le(), min, max);
  }
  std::uint32_t u32(double min = 0, double max = 4294967295.0) {
    return number(in_.read_u32_le(), min, max);
  }
  float f32(double min = -INFINITY, double max = INFINITY) {
    return number(in_.read_f32_le(), min, max);
  }
  double f64(double min = -INFINITY, double max = INFINITY) {
    return number(in_.read_f64_le(), min, max);
  }
  bool boolean() { return u8(0, 1) != 0; }
  std::uint32_t varint();
  std::size_t length(std::size_t fixed, std::size_t max, bool prefix) {
    const auto n = prefix ? varint() : fixed;
    // Every element in the schema consumes at least one byte. Reject before allocation.
    if (!ok_ || n > max || n > in_.remaining()) {
      fail();
      return 0;
    }
    return n;
  }
  template <class T>
  void bytes(T& value, std::size_t fixed, std::size_t max) {
    const auto n = length(fixed, max, !fixed);
    const auto data = in_.read_bytes(n);
    if constexpr (requires { value.resize(n); }) {
      value.assign(data.begin(), data.end());
    } else if (n == value.size()) {
      std::copy(data.begin(), data.end(), value.begin());
    } else {
      fail();
    }
  }
  std::string text(std::size_t max, std::size_t points, std::string_view kind) {
    const auto n = length(0, max, true);
    const auto bytes = in_.read_bytes(n);
    std::string value(bytes.begin(), bytes.end());
    if (!normalize_text(value, max, points, kind)) {
      fail();
    }
    return value;
  }
  [[nodiscard]] bool done() const {
    return ok_ && in_.error() == ParseError::kNone && in_.remaining() == 0;
  }

 private:
  template <class T>
  T number(std::optional<T> v, double min, double max) {
    if (!v || !std::isfinite(static_cast<double>(*v)) || *v < min || *v > max) {
      fail();
      return {};
    }
    return *v;
  }
  ByteReader in_;
  bool ok_ = true;
};
struct FrameHeader {
  std::uint8_t type;
  std::uint32_t sessionEpoch;
};
[[nodiscard]] std::optional<FrameHeader> unframe(std::span<const std::uint8_t> bytes,
                                                 std::size_t max);
[[nodiscard]] bool validate_public_entity(std::span<const std::uint8_t> bytes,
                                          std::uint32_t handle);
}  // namespace engine::net
