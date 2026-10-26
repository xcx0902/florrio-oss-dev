#pragma once
#include <array>
#include <cstdint>

namespace engine {

/** Archived 1152-byte simulation scratch frame. The original reuses one frame
 * buffer across spServerThink; the domain models the fixed size and exposes
 * the tick/time words plus raw scratch so residue can be inspected without
 * claiming byte equality with the shipped allocator. */
struct SimulationFrame {
  static constexpr std::size_t kBytes = 1152;
  std::array<std::uint8_t, kBytes> bytes{};

  [[nodiscard]] std::uint64_t tick() const { return read_u64(0); }
  void set_tick(std::uint64_t value) { write_u64(0, value); }
  [[nodiscard]] double time_ms() const { return read_f64(8); }
  void set_time_ms(double value) { write_f64(8, value); }
  [[nodiscard]] std::uint8_t scratch(std::size_t offset) const {
    return offset < kBytes ? bytes[offset] : 0U;
  }
  void set_scratch(std::size_t offset, std::uint8_t value) {
    if (offset < kBytes) bytes[offset] = value;
  }

 private:
  [[nodiscard]] std::uint64_t read_u64(std::size_t offset) const {
    std::uint64_t value = 0;
    for (std::size_t index = 0; index < 8; ++index)
      value |= static_cast<std::uint64_t>(bytes[offset + index]) << (index * 8U);
    return value;
  }
  void write_u64(std::size_t offset, std::uint64_t value) {
    for (std::size_t index = 0; index < 8; ++index)
      bytes[offset + index] = static_cast<std::uint8_t>((value >> (index * 8U)) & 0xFFU);
  }
  [[nodiscard]] double read_f64(std::size_t offset) const {
    std::uint64_t bits = read_u64(offset);
    double value = 0.0;
    static_assert(sizeof(value) == sizeof(bits));
    __builtin_memcpy(&value, &bits, sizeof(value));
    return value;
  }
  void write_f64(std::size_t offset, double value) {
    std::uint64_t bits = 0;
    static_assert(sizeof(value) == sizeof(bits));
    __builtin_memcpy(&bits, &value, sizeof(bits));
    write_u64(offset, bits);
  }
};

static_assert(sizeof(SimulationFrame) == 1152, "archived simulation frame is 1152 bytes");

} // namespace engine
