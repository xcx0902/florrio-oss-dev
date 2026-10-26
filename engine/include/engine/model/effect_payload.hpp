#pragma once
#include "engine/model/entity.hpp"
#include <cstdint>

namespace engine {

/** Shared timed-effect payload. The original allocates one effect object and
 * transfers unique ownership into an area; every tracked target's effect
 * vector holds the same pointer. Reference counting is explicit so a payload
 * can outlive the area while targets still reference it. */
struct EffectPayload {
  virtual ~EffectPayload() = default;

  EffectType type = EffectType::kPoison;
  EntityHandle source{};
  double remaining_ms = 0.0;
  f32 intensity = f32(0.0F);
  bool active = true;
  std::uint32_t refcount = 1;
  std::uint32_t id = 0;

  [[nodiscard]] bool expired() const { return !active || remaining_ms < 0.0; }
};

} // namespace engine
