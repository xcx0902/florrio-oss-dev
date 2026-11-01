#include "engine/model/player_registry.hpp"

namespace engine {
PlayerId PlayerRegistry::create(std::string name) {
  if (iteration_depth_ != 0 || next_id_ == 0) return {};
  const PlayerId id{next_id_++};
  auto& player = players_.try_emplace(id).first->second;
  player.id_ = id;
  player.set_player_name(std::move(name));
  return id;
}
bool PlayerRegistry::erase(PlayerId id) {
  if (iteration_depth_ != 0) return false;
  auto* player = get(id);
  // A live body must be destroyed through World first.
  if (player == nullptr || player->player().valid()) return false;
  players_.erase(id);
  return true;
}
void PlayerRegistry::clear() {
  if (iteration_depth_ != 0) return;
  bodies_.clear(); players_.clear(); next_id_ = 1;
}
PlayerState* PlayerRegistry::get(PlayerId id) {
  const auto it = players_.find(id);
  return it == players_.end() ? nullptr : &it->second;
}
const PlayerState* PlayerRegistry::get(PlayerId id) const {
  const auto it = players_.find(id);
  return it == players_.end() ? nullptr : &it->second;
}
const PlayerState* PlayerRegistry::by_body(EntityHandle body) const {
  const auto it = bodies_.find(body.raw);
  if (it == bodies_.end()) return nullptr;
  const auto* player = get(it->second);
  return player != nullptr && player->player() == body ? player : nullptr;
}
PlayerState* PlayerRegistry::by_body(EntityHandle body) {
  return const_cast<PlayerState*>(static_cast<const PlayerRegistry&>(*this).by_body(body));
}
bool PlayerRegistry::bind_body(PlayerId id, EntityHandle body) {
  auto* player = get(id);
  if (player == nullptr || !body.valid() || player->player().valid() || bodies_.contains(body.raw)) return false;
  bodies_.emplace(body.raw, id); player->body_ = body;
  return true;
}
void PlayerRegistry::unbind_body(EntityHandle body) {
  auto* player = by_body(body);
  if (player == nullptr) return;
  player->body_ = {};
  bodies_.erase(body.raw);
}
} // namespace engine
