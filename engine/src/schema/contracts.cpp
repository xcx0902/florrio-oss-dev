// Compile the schema layout contracts in every engine_core build.
// These are schema consistency checks, not runtime claims about omitted fields.
#include "engine/schema/generated.hpp"
#include "engine/core/f32.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/hit_message.hpp"
#include "engine/model/simulation_frame.hpp"
#include <climits>
#include <limits>
#include <type_traits>

namespace engine::schema {

static_assert(CHAR_BIT == 8, "schema addresses use eight-bit bytes");
static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559,
              "schema f32 requires IEEE-754 binary32");
static_assert(sizeof(double) == 8 && std::numeric_limits<double>::is_iec559,
              "schema f64 requires IEEE-754 binary64");
static_assert(sizeof(engine::f32) == sizeof(float), "domain scalar stores one schema f32");
static_assert(sizeof(engine::EntityHandle) == sizeof(EntitySlot::handle),
              "domain handles preserve the schema's 32-bit handle width");
static_assert(std::extent_v<decltype(World::entities)> == engine::kEntitySlotCount,
              "schema entity capacity matches the domain handle index space");
static_assert(std::extent_v<decltype(World::entityRevisionTableA)> == engine::kEntitySlotCount);
static_assert(std::extent_v<decltype(World::entityRevisionTableB)> == engine::kEntitySlotCount);
static_assert(std::extent_v<decltype(World::entityRevisionTableC)> == engine::kEntitySlotCount);
static_assert(std::extent_v<decltype(World::serializationCache)> == engine::kEntitySlotCount);

// The assertions in generated.hpp check all declared sizes and offsets,
// including the low-confidence spatial hypothesis. Compilation does not
// promote that hypothesis to independently observed oracle evidence.

} // namespace engine::schema
