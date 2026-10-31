#include "engine/core/perf.hpp"
#include "engine/sim/quadtree.hpp"
#include <algorithm>

namespace engine {

QuadTree::QuadTree(Aabb bounds, std::size_t capacity, unsigned max_depth)
    : bounds_(bounds), capacity_(capacity), max_depth_(max_depth) {
  nodes_.push_back(Node{bounds_, {{-1, -1, -1, -1}}, {}, 0});
}

void QuadTree::clear() {
  nodes_.clear();
  free_nodes_.clear();
  location_.clear();
  size_ = 0;
  nodes_.push_back(Node{bounds_, {{-1, -1, -1, -1}}, {}, 0});
}

void QuadTree::set_location(std::size_t id, int node_index) {
  if (location_.size() <= id) location_.resize(id + 1, -1);
  location_[id] = node_index;
}

void QuadTree::insert(std::size_t id, const Aabb& box) {
  PERF_ADD(inserts, 1);
  if (id < location_.size() && location_[id] >= 0) remove(id);
  insert_at(0, id, box);
  ++size_;
}

int QuadTree::containing_child(std::size_t node_index, const Aabb& box) const {
  const Node& node = nodes_[node_index];
  int found = -1;
  for (const int child : node.children) {
    if (child < 0) continue;
    const Aabb& bounds = nodes_[static_cast<std::size_t>(child)].bounds;
    if (box.min_x >= bounds.min_x && box.max_x <= bounds.max_x
        && box.min_y >= bounds.min_y && box.max_y <= bounds.max_y) {
      if (found >= 0) return -1;
      found = child;
    }
  }
  return found;
}

int QuadTree::path_for(const Aabb& box) const {
  int node_index = 0;
  while (!nodes_[static_cast<std::size_t>(node_index)].leaf()) {
    const int child = containing_child(static_cast<std::size_t>(node_index), box);
    if (child < 0) return node_index;
    node_index = child;
  }
  return node_index;
}

void QuadTree::insert_at(std::size_t node_index, std::size_t id, const Aabb& box) {
  if (nodes_[node_index].leaf() &&
      (nodes_[node_index].items.size() < capacity_ || nodes_[node_index].depth >= max_depth_)) {
    nodes_[node_index].items.push_back(Item{id, box});
    set_location(id, static_cast<int>(node_index));
    return;
  }
  if (nodes_[node_index].leaf()) split_at(node_index);
  const int intersecting = containing_child(node_index, box);
  if (intersecting >= 0) {
    insert_at(static_cast<std::size_t>(intersecting), id, box);
    return;
  }
  // A box outside every child can only happen for malformed input; keep it at
  // this node so it is never lost.
  nodes_[node_index].items.push_back(Item{id, box});
  set_location(id, static_cast<int>(node_index));
}

void QuadTree::split_at(std::size_t node_index) {
  const Aabb bounds = nodes_[node_index].bounds;
  const unsigned depth = nodes_[node_index].depth;
  const f32 mid_x = (bounds.min_x + bounds.max_x) * f32(0.5F);
  const f32 mid_y = (bounds.min_y + bounds.max_y) * f32(0.5F);
  const Aabb child_bounds[4] = {
    {bounds.min_x, bounds.min_y, mid_x, mid_y},
    {mid_x, bounds.min_y, bounds.max_x, mid_y},
    {bounds.min_x, mid_y, mid_x, bounds.max_y},
    {mid_x, mid_y, bounds.max_x, bounds.max_y},
  };
  std::array<int, 4> children{};
  for (int index = 0; index < 4; ++index) {
    if (free_nodes_.empty()) {
      children[static_cast<std::size_t>(index)] = static_cast<int>(nodes_.size());
      nodes_.push_back(Node{child_bounds[index], {{-1, -1, -1, -1}}, {}, depth + 1});
    } else {
      const int child = free_nodes_.back();
      free_nodes_.pop_back();
      children[static_cast<std::size_t>(index)] = child;
      nodes_[static_cast<std::size_t>(child)] = Node{child_bounds[index], {{-1, -1, -1, -1}}, {}, depth + 1};
    }
  }
  std::vector<Item> old = std::move(nodes_[node_index].items);
  nodes_[node_index] = Node{bounds, children, {}, depth};
  for (const auto& item : old) insert_at(node_index, item.id, item.box);
}

void QuadTree::remove(std::size_t id) {
  if (id >= location_.size() || location_[id] < 0) return;
  Node& node = nodes_[static_cast<std::size_t>(location_[id])];
  const auto found = std::find_if(node.items.begin(), node.items.end(),
                                  [id](const Item& item) { return item.id == id; });
  if (found == node.items.end()) return;
  const std::size_t index = static_cast<std::size_t>(found - node.items.begin());
  const Item moved = node.items.back();
  node.items[index] = moved;
  node.items.pop_back();
  set_location(moved.id, location_[id]);
  location_[id] = -1;
  --size_;
}

void QuadTree::update(std::size_t id, const Aabb& box) {
  PERF_ADD(updates, 1);
  if (id < location_.size() && location_[id] >= 0) {
    Node& node = nodes_[static_cast<std::size_t>(location_[id])];
    if (path_for(box) == location_[id]) {
      for (Item& item : node.items) {
        if (item.id == id) {
          item.box = box;
          return;
        }
      }
    }
  }
  remove(id);
  insert(id, box);
}

void QuadTree::remove_missing(const std::vector<bool>& present) {
  for (std::size_t id = 0; id < location_.size(); ++id) {
    if (location_[id] < 0) continue;
    if (id < present.size() && present[id]) continue;
    remove(id);
  }
}

void QuadTree::compact() { compact_at(0); }

void QuadTree::compact_at(std::size_t node_index) {
  const auto children = nodes_[node_index].children;
  if (children[0] < 0) return;
  for (const int child : children) compact_at(static_cast<std::size_t>(child));
  std::size_t count = nodes_[node_index].items.size();
  for (const int child : children) {
    const Node& node = nodes_[static_cast<std::size_t>(child)];
    if (!node.leaf()) return;
    count += node.items.size();
  }
  if (count > capacity_) return;
  // Original163 uses 0,1,2,3 for merging, independently of query order0,2,1,3.
  for (const int child : children) {
    Node& node = nodes_[static_cast<std::size_t>(child)];
    for (const Item& item : node.items) {
      nodes_[node_index].items.push_back(item);
      set_location(item.id, static_cast<int>(node_index));
    }
    node.items.clear();
    free_nodes_.push_back(child);
  }
  nodes_[node_index].children = {{-1, -1, -1, -1}};
}

void QuadTree::query(const Aabb& area, std::vector<std::size_t>& out) const {
  PERF_ADD(queries, 1);
  out.clear();
  query_at(0, area, out);
  PERF_ADD(candidates, out.size());
}

void QuadTree::query_at(std::size_t node_index, const Aabb& area,
                        std::vector<std::size_t>& out) const {
  const Node& node = nodes_[node_index];
  if (!node.bounds.intersects(area)) return;
  for (const auto& item : node.items)
    if (item.box.intersects(area)) out.push_back(item.id);
  if (node.leaf()) return;
  // Original walk order: NW, SW, NE, SE (indices 0, 2, 1, 3). The first two
  // quadrants are recursive calls and the last is a tail jump, but the visit
  // order is identical.
  static constexpr std::array<std::size_t, 4> kOrder{{0, 2, 1, 3}};
  for (const std::size_t index : kOrder) {
    const int child = node.children[index];
    if (child >= 0) query_at(static_cast<std::size_t>(child), area, out);
  }
}

} // namespace engine
