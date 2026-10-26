#include "engine/sim/damage.hpp"

namespace engine {

f32 apply_damage(Entity& entity, f32 amount) {
  if (amount.value < 0.0F) return entity.health;
  entity.health = entity.health - amount;
  if (entity.health.value < 0.0F) entity.health = f32(0.0F);
  return entity.health;
}

} // namespace engine
