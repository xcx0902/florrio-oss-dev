#pragma once
#include "engine/model/player_state.hpp"
#include <map>

namespace engine {
/** Stable addresses and ascending-ID phase order. Structural mutation is
 * rejected inside for_each; hosts join/leave only at tick boundaries. */
class PlayerRegistry {
 public:
  [[nodiscard]] PlayerId create(std::string name = {});
  [[nodiscard]] bool erase(PlayerId id);
  void clear();
  [[nodiscard]] PlayerState* get(PlayerId id);
  [[nodiscard]] const PlayerState* get(PlayerId id) const;
  [[nodiscard]] PlayerState* by_body(EntityHandle body);
  [[nodiscard]] const PlayerState* by_body(EntityHandle body) const;
  [[nodiscard]] bool bind_body(PlayerId id, EntityHandle body);
  void unbind_body(EntityHandle body);
  [[nodiscard]] bool at_boundary() const { return iteration_depth_ == 0; }
  [[nodiscard]] std::size_t size() const { return players_.size(); }
  template <class F>
  void for_each(F&& visit) {
    ++iteration_depth_;
    for (auto& [id, player] : players_) {
      (void)id;
      visit(player);
    }
    --iteration_depth_;
  }
  template <class F>
  void for_each(F&& visit) const {
    ++iteration_depth_;
    for (const auto& [id, player] : players_) {
      (void)id;
      visit(player);
    }
    --iteration_depth_;
  }

 private:
  std::map<PlayerId, PlayerState> players_;
  std::map<std::uint32_t, PlayerId> bodies_;
  std::uint64_t next_id_ = 1;
  mutable unsigned iteration_depth_ = 0;
};
}  // namespace engine
