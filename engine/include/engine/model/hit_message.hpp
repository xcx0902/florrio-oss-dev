#pragma once
#include <array>
#include <cstdint>

namespace engine {

/** Archived attribution message object. The original allocates a 4124-byte
 * polymorphic object (vtable + payload); the domain keeps the same fixed size
 * so epoch/refcount and the virtual-destructor ownership path can be tested
 * without guessing the remaining field offsets. */
#pragma pack(push, 4)
class HitMessage {
 public:
  virtual ~HitMessage() = default;

  [[nodiscard]] std::uint32_t epoch() const { return read_u32(0); }
  void set_epoch(std::uint32_t value) { write_u32(0, value); }
  [[nodiscard]] std::uint32_t refcount() const { return read_u32(4); }
  void set_refcount(std::uint32_t value) { write_u32(4, value); }
  [[nodiscard]] std::uint32_t target() const { return read_u32(8); }
  void set_target(std::uint32_t value) { write_u32(8, value); }
  [[nodiscard]] std::uint32_t attacker() const { return read_u32(12); }
  void set_attacker(std::uint32_t value) { write_u32(12, value); }

 private:
  [[nodiscard]] std::uint32_t read_u32(std::size_t offset) const {
    return static_cast<std::uint32_t>(payload_[offset])
         | (static_cast<std::uint32_t>(payload_[offset + 1]) << 8U)
         | (static_cast<std::uint32_t>(payload_[offset + 2]) << 16U)
         | (static_cast<std::uint32_t>(payload_[offset + 3]) << 24U);
  }
  void write_u32(std::size_t offset, std::uint32_t value) {
    payload_[offset] = static_cast<std::uint8_t>(value & 0xFFU);
    payload_[offset + 1] = static_cast<std::uint8_t>((value >> 8U) & 0xFFU);
    payload_[offset + 2] = static_cast<std::uint8_t>((value >> 16U) & 0xFFU);
    payload_[offset + 3] = static_cast<std::uint8_t>((value >> 24U) & 0xFFU);
  }

#if UINTPTR_MAX == 0xFFFFFFFFu
  // wasm32/32-bit: the vptr is 4 bytes, so the payload is 4120 bytes.
  std::array<std::uint8_t, 4120> payload_{};
#else
  // 64-bit native: the vptr is 8 bytes, so the payload is 4116 bytes.
  std::array<std::uint8_t, 4116> payload_{};
#endif
};
#pragma pack(pop)

static_assert(sizeof(HitMessage) == 4124, "archived HitMessage is 4124 bytes");

} // namespace engine
