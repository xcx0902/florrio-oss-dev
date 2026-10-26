#include "engine/sim/collision_filter.hpp"

namespace engine {

namespace {

struct LayerSpec {
  std::uint8_t flag_byte;
  std::uint8_t mask;
  std::uint8_t threshold;
  std::int8_t side;
};

// Order follows the recovered 30-layer table. Threshold and side indices are
// domain-local; the original memory offsets live only in the probe report.
constexpr std::array<LayerSpec, kCollisionLayerCount> kLayers{{
  {0, 1, 0, 0}, {0, 2, 1, 1}, {0, 4, 2, -1}, {0, 8, 3, -1},
  {0, 16, 4, 2}, {0, 32, 5, 3}, {0, 64, 6, 4}, {0, 128, 7, 5},
  {1, 1, 8, -1}, {1, 2, 9, 6}, {1, 4, 10, -1}, {1, 8, 11, -1},
  {1, 16, 12, -1}, {1, 32, 13, 7}, {1, 64, 14, 8}, {1, 128, 15, 9},
  {2, 1, 16, -1}, {2, 2, 17, -1}, {2, 4, 18, 10}, {2, 8, 19, 11},
  {2, 16, 20, 12}, {2, 32, 21, 13}, {2, 64, 22, -1}, {2, 128, 23, -1},
  {3, 1, 24, 14}, {3, 2, 25, 15}, {3, 4, 26, 16}, {3, 8, 27, 17},
  {3, 16, 28, -1}, {3, 32, 29, 18},
}};

} // namespace

std::size_t count_matching_layers(const Entity& owner, std::uint32_t probe,
                                  bool ignore_ranges, std::uint8_t side_selector) {
  std::size_t matched = 0;
  for (const LayerSpec& layer : kLayers) {
    const std::uint8_t flags = owner.layer_flags[layer.flag_byte];
    if ((flags & layer.mask) == 0U) continue;
    if (!ignore_ranges) {
      if (owner.layer_thresholds[layer.threshold] <= probe) continue;
      if (layer.side >= 0) {
        const std::size_t side_index = static_cast<std::size_t>(layer.side);
        const bool alternate = ((side_selector >> 4) & 4U) != 0U;
        const std::uint32_t side = alternate ? owner.layer_sides_alt[side_index]
                                             : owner.layer_sides[side_index];
        if (side > probe) continue;
      }
    }
    ++matched;
  }
  return matched;
}

bool layers_collide(const Entity& first, const Entity& second) {
  bool first_has_layers = false;
  bool second_has_layers = false;
  for (const std::uint8_t flags : first.layer_flags) first_has_layers |= flags != 0U;
  for (const std::uint8_t flags : second.layer_flags) second_has_layers |= flags != 0U;
  if (!first_has_layers || !second_has_layers) return true;
  if (count_matching_layers(first, second.layer_probe, first.layer_ignore_ranges,
                            first.layer_side_selector) > 0) return true;
  return count_matching_layers(second, first.layer_probe, second.layer_ignore_ranges,
                               second.layer_side_selector) > 0;
}

} // namespace engine
