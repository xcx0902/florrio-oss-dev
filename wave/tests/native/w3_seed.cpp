// Offline acceptance setup/readback. Built only with BUILD_TESTING, never linked into the host.
#include "store/store.hpp"
#include <sqlite3.h>
#include <iostream>
#include <stdexcept>
int main(int argc, char** argv) {
  try {
    if (argc < 2 || argc > 3) {
      throw std::runtime_error("Usage: wave_w3_seed DATABASE [TOKEN]");
    }
    wave::store::Store store(argv[1], {.allow_test_seed = true});
    const bool automatic = argc == 3 && std::string_view(argv[2]) == "--auto";
    const bool behaviors = argc == 3 && std::string_view(argv[2]) == "--behaviors";
    auto profile = argc == 3 && !automatic && !behaviors ? store.recover_guest(argv[2]).value()
                                                         : store.create_guest();
    if (argc == 2 || automatic || behaviors) {
      wave::store::TestSeed seed;
      seed.xp = 150;
      seed.highest_wave = 7;
      seed.inventory = {{{1, 0}, 5}, {{5, 0}, 40}, {{5, 1}, 20}, {{12, 0}, 4},
                        {{6, 2}, 8}, {{44, 1}, 8}, {{20, 2}, 10}};
      for (unsigned i = 0; i < 5; ++i) {
        seed.slots[i] = wave::store::Item{1, 0};
      }
      seed.slots[8] = wave::store::Item{5, 1};
      if (automatic) {
        seed.inventory = {{{1, 0}, 5}, {{5, 0}, 30}, {{5, 5}, 2}};
        seed.slots[8] = wave::store::Item{5, 5};
      }
      if (behaviors) {
        seed.xp = 100 * 44 * 44;
        seed.inventory.clear();
        seed.slots = {};
        for (unsigned kind = 1; kind <= 45; ++kind) {
          for (std::uint8_t rarity = 0; rarity < 6; ++rarity) {
            seed.inventory[{kind, rarity}] = 1;
          }
        }
        const std::array<wave::store::Item, 8> active{
            {{17, 5}, {43, 0}, {37, 0}, {32, 2}, {36, 0}, {14, 5}, {38, 3}, {8, 4}}};
        for (std::size_t i = 0; i < active.size(); ++i) {
          seed.slots[i] = active[i];
        }
      }
      seed.discoveries = {{1, 0}, {4, 1}, {12, 2}};
      profile = store.seed_for_testing(profile.guest_token, seed);
    }
    std::cout << "{\"token\":\"" << profile.guest_token << "\",\"version\":" << profile.version
              << ",\"xp\":" << profile.xp << ",\"level\":" << profile.level
              << ",\"highestWave\":" << profile.highest_wave << ",\"sqliteVersion\":\""
              << sqlite3_libversion() << "\",\"inventory\":[";
    bool comma = false;
    for (const auto& [item, count] : profile.inventory) {
      if (comma) {
        std::cout << ',';
      }
      comma = true;
      std::cout << '[' << item.kind << ',' << unsigned(item.rarity) << ',' << count << ']';
    }
    std::cout << "],\"slots\":[";
    comma = false;
    for (const auto& item : profile.slots) {
      if (comma) {
        std::cout << ',';
      }
      comma = true;
      if (item) {
        std::cout << '[' << item->kind << ',' << unsigned(item->rarity) << ']';
      } else {
        std::cout << "null";
      }
    }
    std::cout << "],\"discoveries\":[";
    comma = false;
    for (const auto item : profile.discoveries) {
      if (comma) {
        std::cout << ',';
      }
      comma = true;
      std::cout << '[' << item.kind << ',' << unsigned(item.rarity) << ']';
    }
    std::cout << "]}\n";
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
