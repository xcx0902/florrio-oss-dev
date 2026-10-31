#pragma once
#include "engine/model/entity.hpp"
namespace engine {
class World;
/** Resolve at most 16 ownership links; missing handles retain the last root. */
EntityHandle controlling_root(const World&, EntityHandle);
/** Find a player in at most 16 ownership links; invalid/cyclic chains return none. */
EntityHandle owning_player(const World&, EntityHandle);
}
