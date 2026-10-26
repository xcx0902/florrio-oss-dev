#pragma once
#include "engine/model/entity.hpp"

namespace engine {

/** Apply damage and clamp health at zero. Returns the remaining health. */
f32 apply_damage(Entity& entity, f32 amount);

} // namespace engine
