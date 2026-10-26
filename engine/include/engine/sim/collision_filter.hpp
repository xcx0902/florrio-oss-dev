#pragma once
#include "engine/model/entity.hpp"

namespace engine {

/** Recovered collision-layer filter (original function 394). The owner record
 * carries four flag bytes; each set bit enables one layer. A layer matches when
 * its threshold is greater than the probe and, when it has a side slot, the
 * selected side threshold is not greater than the probe. With
 * `ignore_ranges`, every set layer flag counts. */
[[nodiscard]] std::size_t count_matching_layers(const Entity& owner, std::uint32_t probe,
                                                bool ignore_ranges, std::uint8_t side_selector);

/** Two bodies may collide when either has no layer flags or at least one layer
 * matches the other body's probe. */
[[nodiscard]] bool layers_collide(const Entity& first, const Entity& second);

} // namespace engine
