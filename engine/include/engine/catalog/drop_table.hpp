#pragma once
#include <array>
#include <cstdint>
#include <vector>

namespace engine {

/** Original entity-definition petal drop ids, one row per type id. */
struct DropTableEntry {
  std::uint16_t type_id;
  std::vector<std::uint16_t> petal_type_ids;
};

inline const std::array<DropTableEntry, 23>& drop_table() {
  static const std::array<DropTableEntry, 23> table{{
  { 0U, {} },
  { 1U, {2, 3, 4} },
  { 2U, {3, 4, 26} },
  { 3U, {7, 10, 13, 21, 33} },
  { 4U, {2, 6, 16, 9, 18} },
  { 5U, {6, 18, 24, 15} },
  { 6U, {2, 7, 16, 9, 18, 31} },
  { 7U, {2, 32, 16, 17, 37} },
  { 8U, {2, 32, 16, 17, 38} },
  { 9U, {16, 8, 9, 14, 17} },
  { 10U, {16, 9, 14, 17, 22, 27} },
  { 11U, {8, 9, 22} },
  { 12U, {8, 9, 36, 17} },
  { 13U, {8, 9, 17, 23} },
  { 14U, {10, 9, 31, 18, 20, 25} },
  { 15U, {2, 32, 16, 11, 12, 17} },
  { 16U, {} },
  { 17U, {8, 12, 34, 17} },
  { 18U, {} },
  { 19U, {5} },
  { 20U, {15, 24, 9, 18, 17, 28} },
  { 21U, {6, 24, 16, 9, 18, 17} },
  { 22U, {8, 7, 14, 29, 30} },
  }};
  return table;
}

} // namespace engine
