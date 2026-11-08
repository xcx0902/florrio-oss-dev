#pragma once
#include "store/store.hpp"
#include <bit>
#include <string>
#include <vector>
namespace wave::wire {
// Original $997 -> $219 MurmurHash3_x64_128 -> two vu64 -> $141 base64.
// This feeds only the client's normal presentation cache; all operations are revalidated.
inline void cache_integer(std::vector<std::uint8_t>& bytes, std::uint64_t value) {
  do {
    bytes.push_back((value & 127) | (value > 127 ? 128 : 0));
    value >>= 7;
  } while (value);
}
inline std::uint32_t cache_seed(std::string_view key) {
  std::uint32_t h = 19089779;
  const auto mix = [](std::uint32_t k) {
    k *= 0xcc9e2d51;
    k = std::rotl(k, 15);
    return k * 0x1b873593;
  };
  std::size_t i = 0;
  for (; i + 4 <= key.size(); i += 4) {
    std::uint32_t k = 0;
    for (unsigned j = 0; j < 4; ++j) {
      k |= std::uint32_t(static_cast<unsigned char>(key[i + j])) << (8 * j);
    }
    h ^= mix(k);
    h = std::rotl(h, 13);
    h = h * 5 + 0xe6546b64;
  }
  std::uint32_t k = 0;
  for (unsigned j = 0; i + j < key.size(); ++j) {
    k |= std::uint32_t(static_cast<unsigned char>(key[i + j])) << (8 * j);
  }
  if (i < key.size()) {
    h ^= mix(k);
  }
  h ^= key.size();
  h ^= h >> 16;
  h *= 0x85ebca6b;
  h ^= h >> 13;
  h *= 0xc2b2ae35;
  return h ^ (h >> 16);
}
inline std::string original_cache(std::vector<std::uint8_t> bytes,
                                  std::string_view key = "cached_equipped") {
  auto payload = bytes;
  const auto length = bytes.size();
  constexpr std::uint64_t c1 = 0x87c37b91114253d5ULL, c2 = 0x4cf5ad432745937fULL;
  // Equipment uses $384's fixed seed; the generic $321 cache uses the key hash.
  std::uint64_t h1 = key == "cached_equipped" ? std::uint32_t(-2107407757) : cache_seed(key),
                h2 = h1;
  const auto word = [&](std::size_t at) {
    std::uint64_t v = 0;
    for (unsigned i = 0; i < 8; ++i) {
      v |= std::uint64_t(bytes[at + i]) << (8 * i);
    }
    return v;
  };
  for (std::size_t at = 0; at + 16 <= length; at += 16) {
    auto k1 = word(at), k2 = word(at + 8);
    k1 *= c1;
    k1 = std::rotl(k1, 31);
    k1 *= c2;
    h1 ^= k1;
    h1 = std::rotl(h1, 27);
    h1 += h2;
    h1 = h1 * 5 + 0x52dce729;
    k2 *= c2;
    k2 = std::rotl(k2, 33);
    k2 *= c1;
    h2 ^= k2;
    h2 = std::rotl(h2, 31);
    h2 += h1;
    h2 = h2 * 5 + 0x38495ab5;
  }
  std::uint64_t k1 = 0, k2 = 0;
  const auto tail = length & ~std::size_t(15);
  for (std::size_t i = tail; i < length; ++i) {
    if (i - tail < 8) {
      k1 |= std::uint64_t(bytes[i]) << (8 * (i - tail));
    } else {
      k2 |= std::uint64_t(bytes[i]) << (8 * (i - tail - 8));
    }
  }
  if (length - tail > 8) {
    k2 *= c2;
    k2 = std::rotl(k2, 33);
    k2 *= c1;
    h2 ^= k2;
  }
  if (length > tail) {
    k1 *= c1;
    k1 = std::rotl(k1, 31);
    k1 *= c2;
    h1 ^= k1;
  }
  h1 ^= length;
  h2 ^= length;
  h1 += h2;
  h2 += h1;
  const auto mix = [](std::uint64_t v) {
    v ^= v >> 33;
    v *= 0xff51afd7ed558ccdULL;
    v ^= v >> 33;
    v *= 0xc4ceb9fe1a85ec53ULL;
    return v ^ (v >> 33);
  };
  h1 = mix(h1);
  h2 = mix(h2);
  h1 += h2;
  h2 += h1;
  bytes = std::move(payload);
  for (auto hash : {h1, h2}) {
    do {
      bytes.push_back((hash & 127) | (hash > 127 ? 128 : 0));
      hash >>= 7;
    } while (hash);
  }
  constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  for (std::size_t i = 0; i < bytes.size(); i += 3) {
    const auto n = (std::uint32_t(bytes[i]) << 16) |
                   (i + 1 < bytes.size() ? std::uint32_t(bytes[i + 1]) << 8 : 0) |
                   (i + 2 < bytes.size() ? bytes[i + 2] : 0);
    result += alphabet[n >> 18];
    result += alphabet[(n >> 12) & 63];
    result += i + 1 < bytes.size() ? alphabet[(n >> 6) & 63] : '=';
    result += i + 2 < bytes.size() ? alphabet[n & 63] : '=';
  }
  return result;
}
inline std::string equipped_cache(const store::Slots& slots) {
  std::vector<std::uint8_t> bytes;
  for (const auto& item : slots) {
    cache_integer(bytes, item ? item->kind : 0);
    if (item) {
      bytes.push_back(item->rarity);
    }
  }
  return original_cache(std::move(bytes));
}
inline store::Slots client_equipment(const store::Profile& profile) {
  store::Slots packed;
  const auto count = store::unlocked_main_slots(profile.level);
  for (std::size_t i = 0; i < count; ++i) {
    packed[i] = profile.slots[i];
    packed[count + i] = profile.slots[8 + i];
  }
  return packed;
}
inline std::string inventory_cache(const store::Inventory& inventory) {
  std::vector<std::uint8_t> bytes;
  cache_integer(bytes, inventory.size());
  // Original $215 serializes rarity first, then kind within each rarity.
  for (unsigned rarity = 0; rarity < 6; ++rarity) {
    for (const auto& [item, count] : inventory) {
      if (item.rarity == rarity) {
        cache_integer(bytes, item.kind);
        bytes.push_back(item.rarity);
        cache_integer(bytes, count);
      }
    }
  }
  return original_cache(std::move(bytes), "cached_inventory");
}
inline std::string signed_cache(std::uint32_t value, std::string_view key = "cached_level") {
  std::vector<std::uint8_t> bytes;
  cache_integer(bytes, std::uint64_t(value) * 2);
  return original_cache(std::move(bytes), key);
}
}
