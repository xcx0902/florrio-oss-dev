#pragma once
#include "engine/catalog/drop_chances.hpp"
#include "engine/catalog/entity_spawn_defaults.hpp"
#include "engine/catalog/petal_combat.hpp"
#include "engine/catalog/generated_catalog_data.hpp"
#include <cstdint>
#include <span>

namespace engine {

/** Read-only view over the build-time catalog data generated from
 * schema/catalogs. Lookups are linear over 39/23/20 records. */
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
    for (const auto& entry : catalog::kPetals) if (entry.typeId == type_id) return &entry;
    return nullptr;
  }
  [[nodiscard]] const catalog::EntityCatalogEntry* entity(std::uint16_t type_id) const {
    for (const auto& entry : catalog::kEntities) if (entry.typeId == type_id) return &entry;
    return nullptr;
  }
  [[nodiscard]] const catalog::EntitySpawnDefaults* spawn_defaults(std::uint16_t type_id) const {
    for (const auto& entry : catalog::kEntitySpawnDefaults) if (entry.typeId == type_id) return &entry;
    return nullptr;
  }
  [[nodiscard]] const catalog::PetalCombat* petal_combat(std::uint16_t type_id) const {
    for (const auto& entry : catalog::kPetalCombat) if (entry.typeId == type_id) return &entry;
    return nullptr;
  }
  [[nodiscard]] const catalog::EntityDropTable* drop_table(std::uint16_t type_id) const {
    for (const auto& entry : catalog::kEntityDropTables) if (entry.typeId == type_id) return &entry;
    return nullptr;
  }

 private:
  Catalog() = default;
};

} // namespace engine
