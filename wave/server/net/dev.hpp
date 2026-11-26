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

struct ProgressEdit {
  store::DebugProgressRequest progress;
  store::Command command;
};

using EditFields = std::map<std::string_view, std::string_view>;

// The panel sends only decimal integers and a UUID. Reject duplicate/unknown
// fields and encodings rather than accepting ambiguous mutation requests.
inline std::optional<EditFields> parse_edit_fields(std::string_view body) {
  EditFields fields;
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
  return fields;
}

inline std::optional<std::uint64_t> edit_number(const EditFields& fields, std::string_view name,
                                                std::uint64_t maximum) {
  const auto found = fields.find(name);
  if (found == fields.end()) {
    return {};
  }
  const auto value = found->second;
  std::uint64_t parsed = 0;
  const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), parsed);
  if (error != std::errc{} || end != value.data() + value.size() || parsed > maximum) {
    return {};
  }
  return parsed;
}

inline std::optional<store::Command> edit_command(const EditFields& fields, std::string scope) {
  const auto version = edit_number(fields, "version", std::numeric_limits<std::int64_t>::max());
  const auto found = fields.find("key");
  if (!version || found == fields.end()) {
    return {};
  }
  const auto key = found->second;
  if (key.empty() || key.size() > 128 ||
      key.find_first_not_of("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-") !=
          std::string_view::npos) {
    return {};
  }
  return store::Command{std::move(scope), std::string(key), *version};
}

inline std::optional<InventoryEdit> parse_inventory_edit(std::string_view body) {
  const auto fields = parse_edit_fields(body);
  if (!fields || fields->size() != 5) {
    return {};
  }
  const auto kind = edit_number(*fields, "kind", 45), rarity = edit_number(*fields, "rarity", 5),
             count = edit_number(*fields, "count", std::numeric_limits<std::uint32_t>::max());
  const auto command = edit_command(*fields, "dev");
  if (!kind || !*kind || !rarity || !count || !command) {
    return {};
  }
  return InventoryEdit{
      {static_cast<std::uint32_t>(*kind), static_cast<std::uint8_t>(*rarity)}, *count, *command};
}

inline std::optional<ProgressEdit> parse_progress_edit(std::string_view body) {
  const auto fields = parse_edit_fields(body);
  if (!fields || fields->size() != 7) {
    return {};
  }
  const auto xp = edit_number(*fields, "xp", std::numeric_limits<std::int64_t>::max()),
             level = edit_number(*fields, "level", catalog::level_table().maximum_level);
  const auto command = edit_command(*fields, "dev-progress");
  if (!xp || !level || *level != store::level_for_xp(*xp) || !command) {
    return {};
  }
  store::DebugProgressRequest progress{*xp, static_cast<std::uint32_t>(*level), {}};
  constexpr std::string_view names[]{"garden", "desert", "ocean"};
  for (std::size_t i = 0; i < progress.highest_waves.size(); ++i) {
    const auto wave = edit_number(*fields, names[i], std::numeric_limits<std::int32_t>::max());
    if (!wave) {
      return {};
    }
    progress.highest_waves[i] = static_cast<std::uint32_t>(*wave);
  }
  return ProgressEdit{progress, *command};
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
  std::string result =
      "{\"version\":\"" + std::to_string(profile.version) + "\",\"xp\":\"" +
      std::to_string(profile.xp) + "\",\"level\":" + std::to_string(profile.level) +
      ",\"highestWaves\":[" + std::to_string(profile.highest_waves[0]) + ',' +
      std::to_string(profile.highest_waves[1]) + ',' + std::to_string(profile.highest_waves[2]) +
      "],\"maximumLevel\":" + std::to_string(catalog::level_table().maximum_level) +
      ",\"xpThresholds\":[";
  bool threshold_comma = false;
  for (const auto xp : catalog::xp_thresholds()) {
    if (threshold_comma) {
      result += ',';
    }
    threshold_comma = true;
    result += json_string(std::to_string(xp));
  }
  result += "],\"inventory\":[";
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
