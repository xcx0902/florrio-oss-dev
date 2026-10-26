#pragma once
#include "engine/core/vec2.hpp"

namespace engine {

/** Circle overlap in squared-distance form, preserving f32 arithmetic. */
[[nodiscard]] bool circles_overlap(Vec2 a, f32 radius_a, Vec2 b, f32 radius_b);

} // namespace engine
