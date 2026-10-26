#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Link `child` into `parent`'s intrusive attached-child list. Duplicate links
 * are ignored. The child's owner is not changed here. */
void attach_child(World& world, EntityHandle parent, EntityHandle child);

/** Remove `child` from `parent`'s attached-child list. */
void detach_child(World& world, EntityHandle parent, EntityHandle child);

/** Mark an entity's cached collision rectangle dirty and propagate to owners.
 * Original 167 memoizes the union of the body circle and every attached child;
 * any transform/radius change invalidates the chain. */
void invalidate_bounds(World& world, EntityHandle handle);

/** Memoized collision rectangle including attached children (original 167).
 * The returned rectangle is expressed as min/max and stays binary32. */
[[nodiscard]] EntityBounds collision_bounds(World& world, EntityHandle handle);

} // namespace engine
