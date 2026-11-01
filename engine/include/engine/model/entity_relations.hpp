#pragma once
#include "engine/model/entity.hpp"
namespace engine {
class World;
/** Resolve at most 16 ownership links; missing handles retain the last root. */
EntityHandle controlling_root(const World&, EntityHandle);
/** Find a player in at most 16 ownership links; invalid/cyclic chains return none. */
EntityHandle owning_player(const World&, EntityHandle);
/** Persistent gameplay owner, independent of physical reparenting. */
PlayerId owning_player_id(const World&, EntityHandle);
DamageSource damage_source(const World&, EntityHandle);
/** Called only by authoritative entity creation, never with a client PlayerId. */
void inherit_entity_owner(World&, EntityHandle child, EntityHandle parent);
}
