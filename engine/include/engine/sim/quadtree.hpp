#pragma once

#include "engine/core/vec2.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace engine {

/** Axis-aligned box used by the spatial index. */
struct Aabb {
  f32 min_x;
  f32 min_y;
  f32 max_x;
  f32 max_y;

  [[nodiscard]] bool intersects(const Aabb& other) const {
    return min_x <= other.max_x && max_x >= other.min_x &&
           min_y <= other.max_y && max_y >= other.min_y;
  }
};

/** Deterministic quadtree over a fixed world box.
 *
 * Bodies are stored once in the deepest node whose bounds contain the body
 * box. Query returns candidate ids; callers still run the exact original
 * collision predicate, so this index cannot change gameplay results.
 */
class QuadTree {
 public:
  explicit QuadTree(Aabb bounds, std::size_t capacity = 8, unsigned max_depth = 6);

  void clear();
  void insert(std::size_t id, const Aabb& box);
  /** Remove one id from its node (swap-remove, preserving the archived order). */
  void remove(std::size_t id);
  /** Replace one id's box; reinsert only when the containing node changed. */
  void update(std::size_t id, const Aabb& box);
  /** Remove ids that are no longer present in the current tick. */
  void remove_missing(const std::vector<bool>& present);
  /** Original163: collapse four leaf children when the total is <= capacity,
   * appending their items in child index order after the parent items. */
  void compact();
  void query(const Aabb& area, std::vector<std::size_t>& out) const;
  [[nodiscard]] std::size_t size() const { return size_; }
  [[nodiscard]] std::size_t node_count() const { return nodes_.size() - free_nodes_.size(); }

 private:
  struct Item {
    std::size_t id;
    Aabb box;
  };
  struct Node {
    Aabb bounds;
    std::array<int, 4> children{{-1, -1, -1, -1}};
    std::vector<Item> items;
    unsigned depth = 0;
    [[nodiscard]] bool leaf() const { return children[0] < 0; }
  };

  [[nodiscard]] int path_for(const Aabb& box) const;
  [[nodiscard]] int containing_child(std::size_t node_index, const Aabb& box) const;
  void insert_at(std::size_t node_index, std::size_t id, const Aabb& box);
  void split_at(std::size_t node_index);
  void query_at(std::size_t node_index, const Aabb& area, std::vector<std::size_t>& out) const;
  void compact_at(std::size_t node_index);
  void set_location(std::size_t id, int node_index);

  std::vector<Node> nodes_;
  std::vector<int> free_nodes_;
  std::vector<int> location_;
  Aabb bounds_;
  std::size_t capacity_;
  unsigned max_depth_;
  std::size_t size_ = 0;
};

} // namespace engine
