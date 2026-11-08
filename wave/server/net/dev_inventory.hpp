#pragma once

#include "catalog/catalog.hpp"
#include "store/store.hpp"

#include <charconv>
#include <limits>
#include <map>
#include <optional>
#include <string>
#include <string_view>

namespace wave::dev {

struct InventoryEdit {
  store::Item item;
  store::Count count;
  store::Command command;
};

// The panel sends only decimal integers and a UUID. Reject duplicate/unknown
// fields and encodings rather than accepting ambiguous mutation requests.
inline std::optional<InventoryEdit> parse_inventory_edit(std::string_view body) {
  std::map<std::string_view, std::string_view> fields;
  while (!body.empty()) {
    const auto end = body.find('&');
    const auto field = body.substr(0, end);
    const auto equal = field.find('=');
    if (equal == std::string_view::npos ||
        !fields.emplace(field.substr(0, equal), field.substr(equal + 1)).second) {
      return {};
    }
    if (end == std::string_view::npos) {
      break;
    }
    body.remove_prefix(end + 1);
    if (body.empty()) {
      return {};
    }
  }
  if (fields.size() != 5 || !fields.contains("kind") || !fields.contains("rarity") ||
      !fields.contains("count") || !fields.contains("version") || !fields.contains("key")) {
    return {};
  }
  const auto number = [&](std::string_view name,
                          std::uint64_t maximum) -> std::optional<std::uint64_t> {
    const auto value = fields.at(name);
    std::uint64_t parsed = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), parsed);
    if (error != std::errc{} || end != value.data() + value.size() || parsed > maximum) {
      return {};
    }
    return parsed;
  };
  const auto kind = number("kind", 45), rarity = number("rarity", 5),
             count = number("count", std::numeric_limits<std::uint32_t>::max()),
             version = number("version", std::numeric_limits<std::int64_t>::max());
  const auto key = fields.at("key");
  if (!kind || !*kind || !rarity || !count || !version || key.empty() || key.size() > 128 ||
      key.find_first_not_of("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-") !=
          std::string_view::npos) {
    return {};
  }
  return InventoryEdit{{static_cast<std::uint32_t>(*kind), static_cast<std::uint8_t>(*rarity)},
                       *count,
                       {"dev-inventory", std::string(key), *version}};
}

inline std::string json_string(std::string_view value) {
  std::string result = "\"";
  for (const auto c : value) {
    if (c == '\\' || c == '"') {
      result += '\\';
    }
    result += c;
  }
  return result + '"';
}

inline std::string inventory_json(const store::Profile& profile) {
  std::string result = "{\"version\":\"" + std::to_string(profile.version) + "\",\"inventory\":[";
  bool comma = false;
  for (const auto& [item, count] : profile.inventory) {
    if (comma) {
      result += ',';
    }
    comma = true;
    result += '[' + std::to_string(item.kind) + ',' + std::to_string(item.rarity) + ",\"" +
              std::to_string(count) + "\"]";
  }
  result += "],\"slots\":[";
  comma = false;
  for (const auto& slot : profile.slots) {
    if (comma) {
      result += ',';
    }
    comma = true;
    result +=
        slot ? '[' + std::to_string(slot->kind) + ',' + std::to_string(slot->rarity) + ']' : "null";
  }
  result += "],\"petals\":[";
  comma = false;
  for (const auto& petal : catalog::petal_registry()) {
    if (petal.client_id == 0) {
      continue;
    }
    if (comma) {
      result += ',';
    }
    comma = true;
    result += "{\"kind\":" + std::to_string(petal.client_id) +
              ",\"name\":" + json_string(petal.name) +
              ",\"supported\":" + (catalog::can_equip(petal.kind) ? "true" : "false") + '}';
  }
  return result + "]}";
}

}  // namespace wave::dev
