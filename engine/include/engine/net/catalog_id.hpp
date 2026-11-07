#pragma once
#include "engine/model/entity.hpp"

namespace engine::net {

/** Encode the two catalog namespaces into the shared legacy wire field.
 * Projectiles can originate from either a petal or a species. */
[[nodiscard]] inline std::uint16_t catalog_type_id(const Entity& entity) {
  return entity.petal_id != catalog::PetalId::kNone ? static_cast<std::uint16_t>(entity.petal_id)
                                                    : static_cast<std::uint16_t>(entity.species_id);
}

}  // namespace engine::net
