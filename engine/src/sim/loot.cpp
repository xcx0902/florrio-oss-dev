#include "engine/sim/loot.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <cmath>

namespace engine {

namespace {

/** libc++ std::shuffle with minstd_rand + independent_bits_engine, as recovered
 * from the death path. `state` is the independent engine's Park-Miller state. */
void shuffle_petals(std::uint16_t* data, std::size_t count, ServerRng& rng) {
  if (count < 2) return;
  for (std::size_t position = 0; position + 1 < count; ++position) {
    const std::size_t range = count - position;
    std::size_t choice = 0;
    if (range > 1) {
      const std::uint32_t bits = static_cast<std::uint32_t>(std::ceil(std::log2(static_cast<double>(range))));
      const std::uint32_t mask = (1U << bits) - 1U;
      const std::uint32_t ceiling = static_cast<std::uint32_t>(
        std::floor(2147483646.0 / static_cast<double>(1U << bits))) << bits;
      std::uint32_t sample = 0;
      do {
        do { sample = rng.next() - 1U; } while (sample >= ceiling);
        choice = sample & mask;
      } while (choice >= range);
    }
    if (choice != 0) std::swap(data[position], data[position + choice]);
  }
}

std::uint32_t rarity_of(std::uint16_t petal_type) {
  const auto* combat = Catalog::instance().petal_combat(petal_type);
  return combat == nullptr ? 0U : combat->rarityIndex;
}

} // namespace

double loot_lifetime_ms(std::uint16_t petal_type) {
  const std::uint32_t rarity = rarity_of(petal_type);
  if (rarity >= 2U && rarity <= 5U) {
    static constexpr double kDurations[4]{42000.0, 52000.0, 62000.0, 62000.0};
    return kDurations[rarity - 2U];
  }
  return 32000.0;
}

std::vector<std::uint16_t> roll_entity_loot(ServerRng& rng, std::uint16_t type_id, bool compact) {
  std::vector<std::uint16_t> result;
  const auto* table = Catalog::instance().drop_table(type_id);
  if (table == nullptr || table->drops == nullptr) return result;
  const f32 base(compact ? 1.0F : 3.0F);
  for (std::uint8_t index = 0; index < table->dropCount; ++index) {
    const auto& drop = table->drops[index];
    const f32 threshold = base * f32(drop.chance);
    if (rng.next_fraction() < threshold) result.push_back(drop.petalTypeId);
  }
  return result;
}

LootResult retain_player_loot(PlayerProfile& profile, ServerRng& rng, ServerRng& shuffle_rng) {
  LootResult result;
  std::array<std::vector<std::uint16_t>, 6> groups;
  const std::uint8_t size = profile.inventory_size();
  std::uint8_t occupied = 0;
  for (std::uint8_t slot = 0; slot < size; ++slot) {
    const std::uint16_t petal = profile.inventory(slot);
    if (petal == 0) continue;
    ++occupied;
    groups[std::min<std::uint32_t>(rarity_of(petal), 5U)].push_back(petal);
  }
  const std::uint8_t limit = size > occupied ? static_cast<std::uint8_t>(size - occupied) : 0U;
  const std::uint8_t bag_count = profile.backpack_count();
  const std::uint8_t bag_start = bag_count < limit
    ? 0U : static_cast<std::uint8_t>(bag_count - limit);
  for (std::uint8_t index = bag_start; index < bag_count; ++index) {
    const std::uint16_t petal = profile.backpack()[index];
    if (petal != 0) groups[std::min<std::uint32_t>(rarity_of(petal), 5U)].push_back(petal);
  }
  std::uint32_t retained = 0;
  std::uint32_t lost = 0;
  for (int tier = 5; tier >= 0; --tier) {
    auto& group = groups[static_cast<std::size_t>(tier)];
    if (group.empty()) continue;
    shuffle_petals(group.data(), group.size(), shuffle_rng);
    for (const std::uint16_t petal : group) {
      if (petal == 1) continue;
      if (rng.next_fraction() < f32(0.1F)) continue;
      if (retained < 3U) result.retained[retained++] = petal;
      else if (lost <= 9U) result.lost[lost++] = petal;
    }
  }
  result.retained_count = static_cast<std::uint8_t>(retained);
  result.lost_count = static_cast<std::uint8_t>(lost);
  for (std::uint32_t index = 0; index < retained; ++index) {
    if (rarity_of(result.retained[index]) >= 2U && rng.next_fraction() < f32(0.01F))
      result.retained[index] = 19;
  }
  profile.set_lost_items(result.lost_count, result.lost);
  profile.clear_inventory();
  for (std::uint8_t index = 0; index < result.retained_count; ++index)
    profile.set_inventory(index, result.retained[index]);
  profile.set_inventory_count(result.retained_count);
  profile.clear_backpack();
  return result;
}

EntityHandle spawn_loot_drop(World& world, std::uint16_t petal_type, Vec2 position, Vec2 impulse,
                             Vec2d base_velocity) {
  // Loot is a fixed-size card (original 70 px world tile), independent of the
  // petal's combat draw radius. Using drawRadius made Mythic drops enormous.
  const f32 draw_radius = f32(35.0F);
  const EntityHandle handle = spawn_entity(world, EntityKind::kDrop, petal_type, position, draw_radius);
  if (!handle.valid()) return handle;
  Entity* drop = world.entities().get(handle);
  drop->collision_radius = f32(35.0F);
  // Original spawnLoot copies the dying transform's velocity (+40/+48) plus
  // its per-tick impulse accumulator (+56/+64), then adds the radial spread.
  drop->velocity = Vec2d(base_velocity.x + static_cast<double>(impulse.x.value),
                         base_velocity.y + static_cast<double>(impulse.y.value));
  drop->lifetime_remaining_ms = loot_lifetime_ms(petal_type);
  drop->pickup_transfer_deadline_ms = world.time_ms() + drop->lifetime_remaining_ms;
  drop->behavior_cooldown_ms = world.time_ms() + 500.0;
  world.register_pickup(handle);
  return handle;
}

bool legendary_exists(const World& world, EntityHandle dead, std::uint16_t petal_type) {
  if (rarity_of(petal_type) != 5U) return false;
  if (world.player().valid() && world.player() != dead) {
    for (const auto& slot : world.loadout().slots())
      if (slot.count != 0 && slot.type_id == petal_type) return true;
  }
  // Original legendaryExists scans the world's pickup intrusive list.
  for (const EntityHandle handle : world.pickups()) {
    const Entity* entity = world.entities().get(handle);
    if (entity != nullptr && entity->active && entity->type_id == petal_type) return true;
  }
  return false;
}

std::vector<EntityHandle> spawn_loot_drops(World& world, const std::vector<std::uint16_t>& petals,
                                           Vec2 position, EntityHandle dead) {
  std::vector<EntityHandle> spawned;
  spawned.reserve(petals.size());
  Vec2d base_velocity;
  if (const Entity* source = world.entities().get(dead)) {
    base_velocity.x = source->velocity.x + source->acceleration.x;
    base_velocity.y = source->velocity.y + source->acceleration.y;
  }
  const double count = static_cast<double>(petals.size());
  for (std::size_t index = 0; index < petals.size(); ++index) {
    if (legendary_exists(world, dead, petals[index])) continue;
    Vec2 impulse;
    if (petals.size() >= 2) {
      // Original 43 demotes the angle, calls float cos/sin, then multiplies
      // each float result by the binary32 spread constant.
      const f32 angle = f32::from_double(static_cast<double>(index) * (2.0 * 3.14159265358979323846) / count);
      const f32 cosine = f32::from_double(std::cos(static_cast<double>(angle.value)));
      const f32 sine = f32::from_double(std::sin(static_cast<double>(angle.value)));
      impulse = Vec2(cosine * f32(0.6F), sine * f32(0.6F));
    }
    const EntityHandle handle = spawn_loot_drop(world, petals[index], position, impulse, base_velocity);
    if (handle.valid()) spawned.push_back(handle);
  }
  return spawned;
}

} // namespace engine
