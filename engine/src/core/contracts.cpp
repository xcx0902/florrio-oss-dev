// Product ABI invariants that every engine_core build must satisfy.
//
// These checks describe the current domain types and the generated wire
// protocol. They intentionally do not mention the retired original memory
// layout, EntitySlot, or probe output: a successful compilation here proves the
// product's own byte-width and handle rules, not equivalence with the archive.
#include "engine/core/f32.hpp"
#include "engine/model/entity.hpp"
#include "engine/net/generated_protocol.hpp"
#include <climits>
#include <cstdint>
#include <limits>
#include <type_traits>

namespace engine {

static_assert(CHAR_BIT == 8, "product wire and storage assume eight-bit bytes");
static_assert(sizeof(float) == 4 && std::numeric_limits<float>::is_iec559,
              "product f32 requires IEEE-754 binary32");
static_assert(sizeof(double) == 8 && std::numeric_limits<double>::is_iec559,
              "product f64 requires IEEE-754 binary64");
static_assert(sizeof(engine::f32) == sizeof(float),
              "domain scalar stores exactly one product f32");
static_assert(std::is_trivially_copyable_v<engine::f32>);

static_assert(sizeof(engine::EntityHandle) == sizeof(std::uint32_t),
              "entity handles are one 32-bit product word");
static_assert(std::is_trivially_copyable_v<engine::EntityHandle>);
static_assert(std::is_standard_layout_v<engine::EntityHandle>);
static_assert(engine::kEntityIndexBits == engine::protocol::kEntityGenerationShift,
              "handle index width matches the generated protocol rotation");
static_assert(engine::kEntityIndexMask == engine::protocol::kEntityIndexMask,
              "handle index mask matches the generated protocol");
static_assert(engine::kEntityGenerationShift == engine::protocol::kEntityGenerationShift,
              "handle generation shift matches the generated protocol");
static_assert(engine::kEntitySlotCount == engine::protocol::kEntityIndexMask + 1U,
              "entity capacity covers exactly the generated handle index space");
static_assert((1U << (32U - engine::kEntityGenerationShift)) - 1U == 0x3FFFFU,
              "generation field leaves 18 bits in the 32-bit handle");

constexpr engine::EntityHandle kWireHandleCheck =
  engine::EntityHandle::from_parts(0x1234U, 0x2ABCU);
static_assert(kWireHandleCheck.index() == 0x1234U);
static_assert(kWireHandleCheck.generation() == 0x2ABCU);
static_assert(engine::EntityHandle::from_wire(kWireHandleCheck.to_wire()) == kWireHandleCheck,
              "generated handle rotation is reversible");
static_assert(engine::protocol::kSparseFieldCount == 63U,
              "the product domain packet declares 63 sparse fields");
static_assert(engine::protocol::kComponentCount == 30U,
              "the product domain packet declares 30 components");

} // namespace engine
