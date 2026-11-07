#pragma once
#include "engine/model/world.hpp"

namespace engine::diagnostics {
[[nodiscard]] bool set_entity_field(World& world, EntityHandle handle, std::uint32_t field,
                                    double value);
[[nodiscard]] EntityHandle spawn_mob(World& world, catalog::SpeciesId type_id, Vec2 position);
[[nodiscard]] bool set_loadout_slot(World& world, PlayerId id, std::uint32_t slot,
                                    catalog::PetalId type_id);
}  // namespace engine::diagnostics
