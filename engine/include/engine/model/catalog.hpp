#pragma once
#include "engine/catalog/drop_chances.hpp"
#include "engine/catalog/entity_spawn_defaults.hpp"
#include "engine/catalog/petal_combat.hpp"
#include "engine/catalog/generated_catalog_data.hpp"
#include <array>
#include <cstdint>
#include <span>
#include <type_traits>
#include <unordered_map>

namespace engine {

/** Read-only view over the build-time catalog data generated from
 * schema/catalogs. Type ids are sparse keys backed by one-time indexes; no
 * lookup scans the rows. The schema caps publishable ids at 255 because the
 * current snapshot/loadout wire still carries one byte. Missing ids stay missing (nullptr), they are not
 * remapped to a neighboring dense slot. */
class Catalog {
 public:
  [[nodiscard]] static const Catalog& instance() {
    static const Catalog catalog;
    return catalog;
  }

  [[nodiscard]] std::span<const catalog::PetalCatalogEntry> petals() const { return catalog::kPetals; }
  [[nodiscard]] std::span<const catalog::EntityCatalogEntry> entities() const { return catalog::kEntities; }
  [[nodiscard]] std::span<const catalog::SpawnRuleCatalogEntry> spawn_rules() const { return catalog::kSpawnRules; }

  [[nodiscard]] const catalog::PetalCatalogEntry* petal(std::uint16_t type_id) const {
    return lookup(petals_by_id_, type_id);
  }
  [[nodiscard]] const catalog::EntityCatalogEntry* entity(std::uint16_t type_id) const {
    return lookup(entities_by_id_, type_id);
  }
  [[nodiscard]] const catalog::EntitySpawnDefaults* spawn_defaults(std::uint16_t type_id) const {
    return lookup(spawn_defaults_by_id_, type_id);
  }
  [[nodiscard]] const catalog::PetalCombat* petal_combat(std::uint16_t type_id) const {
    return lookup(petal_combat_by_id_, type_id);
  }
  [[nodiscard]] const catalog::EntityDropTable* drop_table(std::uint16_t type_id) const {
    return lookup(drop_tables_by_id_, type_id);
  }

 private:
  template <typename Rows>
  static auto index(const Rows& rows) {
    using Entry = std::remove_cv_t<std::remove_reference_t<decltype(rows[0])>>;
    std::unordered_map<std::uint16_t, const Entry*> result;
    result.reserve(std::size(rows));
    for (const auto& entry : rows) result.emplace(entry.typeId, &entry);
    return result;
  }

  template <typename Entry>
  [[nodiscard]] static const Entry* lookup(
      const std::unordered_map<std::uint16_t, const Entry*>& index, std::uint16_t type_id) {
    const auto found = index.find(type_id);
    return found == index.end() ? nullptr : found->second;
  }

  Catalog()
      : petals_by_id_(index(catalog::kPetals)),
        entities_by_id_(index(catalog::kEntities)),
        spawn_defaults_by_id_(index(catalog::kEntitySpawnDefaults)),
        petal_combat_by_id_(index(catalog::kPetalCombat)),
        drop_tables_by_id_(index(catalog::kEntityDropTables)) {}

  std::unordered_map<std::uint16_t, const catalog::PetalCatalogEntry*> petals_by_id_;
  std::unordered_map<std::uint16_t, const catalog::EntityCatalogEntry*> entities_by_id_;
  std::unordered_map<std::uint16_t, const catalog::EntitySpawnDefaults*> spawn_defaults_by_id_;
  std::unordered_map<std::uint16_t, const catalog::PetalCombat*> petal_combat_by_id_;
  std::unordered_map<std::uint16_t, const catalog::EntityDropTable*> drop_tables_by_id_;
};

} // namespace engine
