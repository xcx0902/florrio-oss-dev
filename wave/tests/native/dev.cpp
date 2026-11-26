#include "app/room_manager.hpp"
#include "net/dev.hpp"
#include "store/store.hpp"

#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
using namespace wave::store;
void check(bool value, const char* message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}

void edits() {
  Store production(":memory:");
  const auto original = production.create_guest();
  check(production
                .debug_set_inventory(original.guest_token, {"debug", "disabled", original.version},
                                     {5, 0}, 100)
                .code == Code::protected_item,
        "Production Store rejects debug writes");
  check(*production.recover_guest(original.guest_token) == original,
        "Disabled write changes nothing");

  Options options;
  options.allow_debug_inventory = true;
  options.allow_test_seed = true;
  Store store(":memory:", options);
  auto profile = store.create_guest();
  const auto token = profile.guest_token;
  TestSeed seed;
  seed.xp = 150;
  seed.highest_wave = 7;
  seed.inventory = profile.inventory;
  seed.slots = profile.slots;
  seed.slots[8] = Item{1, 0};
  seed.inventory[{1, 0}] = 6;
  seed.discoveries.insert({4, 2});
  profile = store.seed_for_testing(token, seed);
  const auto before = profile;
  const Command command{"dev", "reduce", profile.version};
  const auto reduced = store.debug_set_inventory(token, command, {1, 0}, 2);
  check(reduced.code == Code::ok && reduced.profile.inventory.at({1, 0}) == 2,
        "Exact count can be reduced below equipped count");
  check(reduced.profile.slots[0] == Item{1, 0} && reduced.profile.slots[1] == Item{1, 0},
        "Main slots retained first");
  for (std::size_t i = 2; i < 16; ++i) {
    check(!reduced.profile.slots[i], "Excess equipment cleared atomically");
  }
  check(reduced.profile.xp == before.xp && reduced.profile.highest_wave == before.highest_wave &&
            reduced.profile.discoveries == before.discoveries &&
            reduced.profile.guest_token == before.guest_token,
        "Inventory editing preserves other profile fields");
  check(store.debug_set_inventory(token, command, {1, 0}, 2).replayed, "Exact retry replays");
  check(store.recover_guest(token)->version == reduced.profile.version,
        "Replay increments no version");
  check(store.debug_set_inventory(token, command, {1, 0}, 3).code == Code::key_conflict,
        "Changed replay semantics rejected");
  check(store.debug_set_inventory(token, {"dev", "stale", before.version}, {5, 0}, 50).code ==
            Code::version_conflict,
        "Concurrent stale edit rejected");
  profile = reduced.profile;
  unsigned key = 0;
  // Every registered kind and rarity can be held, even before effects are implemented.
  for (std::uint32_t kind = 1; kind <= 45; ++kind) {
    for (std::uint8_t rarity = 0; rarity < 6; ++rarity) {
      const auto result = store.debug_set_inventory(
          token, {"dev", std::to_string(++key), profile.version}, {kind, rarity}, 123);
      check(result.code == Code::ok, "All inventory identities editable");
      profile = result.profile;
    }
  }
  auto result = store.debug_set_inventory(token, {"dev", "zero", profile.version}, {1, 0}, 0);
  check(result.code == Code::ok && !result.profile.inventory.contains({1, 0}), "Zero removes item");
  check(!result.profile.slots[0] && !result.profile.slots[1], "Zero removes equipped copies");
  profile = result.profile;
  for (const Item bad : {Item{0, 0}, Item{46, 0}, Item{5, 6}}) {
    check(store.debug_set_inventory(token, {"dev", std::to_string(++key), profile.version}, bad, 1)
                  .code == Code::invalid_request,
          "Unknown identity rejected");
  }
  check(store.debug_set_inventory(token, {"dev", "overflow", profile.version}, {5, 0},
                                  Count{std::numeric_limits<std::uint32_t>::max()} + 1)
                .code == Code::invalid_request,
        "Unrepresentable client count rejected");
  check(store.debug_set_inventory(std::string(64, 'a'), {"dev", "unknown", 0}, {5, 0}, 1).code ==
            Code::unknown_guest,
        "Unknown token never creates a guest");
}

void progress_edits() {
  Store production(":memory:");
  const auto original = production.create_guest();
  check(production.debug_set_progress(original.guest_token, {"dev-progress", "disabled", 0}, {})
                .code == Code::protected_item,
        "Production Store rejects progress writes");
  check(*production.recover_guest(original.guest_token) == original,
        "Disabled progress write changes nothing");

  Options options;
  options.allow_debug_progress = true;
  options.allow_test_seed = true;
  Store store(":memory:", options);
  auto profile = store.create_guest();
  const auto token = profile.guest_token;
  TestSeed seed;
  seed.xp = wave::catalog::xp_thresholds()[44];
  seed.highest_waves = {100, 200, 300};
  seed.inventory[Item{1, 0}] = 16;
  seed.slots.fill(Item{1, 0});
  seed.discoveries.insert({4, 2});
  profile = store.seed_for_testing(token, seed);
  const auto before = profile;
  const Command command{"dev-progress", "lower", profile.version};
  DebugProgressRequest request{150, 2, {7, 8, 9}};
  const auto lowered = store.debug_set_progress(token, command, request);
  check(lowered.code == Code::ok && lowered.profile.xp == 150 && lowered.profile.level == 2 &&
            lowered.profile.highest_waves == request.highest_waves &&
            lowered.profile.highest_wave == 9,
        "XP, level and all biome records can decrease atomically");
  for (std::size_t i = 0; i < profile.slots.size(); ++i) {
    check(lowered.profile.slots[i].has_value() == (i % 8 < 5),
          "Level decrease clears locked main and reserve slots");
  }
  check(lowered.profile.inventory == before.inventory &&
            lowered.profile.discoveries == before.discoveries &&
            lowered.profile.guest_token == before.guest_token,
        "Progress edit preserves owned items, discoveries and identity");
  check(*store.recover_guest(token) == lowered.profile, "Progress persisted in SQLite");
  check(store.debug_set_progress(token, command, request).replayed,
        "Progress retry replays original result");
  ++request.highest_waves[2];
  check(store.debug_set_progress(token, command, request).code == Code::key_conflict,
        "Changed progress retry rejected");
  check(store.debug_set_progress(token, {"dev-progress", "stale", before.version}, request).code ==
            Code::version_conflict,
        "Stale progress edit rejected");
  profile = lowered.profile;
  unsigned key = 0;
  for (const auto bad :
       {DebugProgressRequest{150, 1, {}}, DebugProgressRequest{0, 0, {}},
        DebugProgressRequest{0, 256, {}}, DebugProgressRequest{0, 1, {2147483648U, 0, 0}},
        DebugProgressRequest{Count{1} << 63, 255, {}}}) {
    check(store.debug_set_progress(token, {"dev-progress", std::to_string(++key), profile.version},
                                   bad)
                  .code == Code::invalid_request,
          "Invalid XP, level or wave is rejected");
    check(*store.recover_guest(token) == profile, "Invalid edit leaves profile unchanged");
  }
  request = {static_cast<Count>(std::numeric_limits<std::int64_t>::max()),
             255,
             {2147483647, 2147483647, 2147483647}};
  auto result =
      store.debug_set_progress(token, {"dev-progress", "maximum", profile.version}, request);
  check(result.code == Code::ok && result.profile.xp == request.xp && result.profile.level == 255,
        "Maximum XP, level and waves supported");
  check(wave::dev::inventory_json(result.profile).find("\"xp\":\"9223372036854775807\"") !=
            std::string::npos,
        "XP is serialized without JavaScript integer precision loss");
  result = store.debug_set_progress(token, {"dev-progress", "reset", result.profile.version}, {});
  check(result.code == Code::ok && result.profile.xp == 0 && result.profile.level == 1 &&
            result.profile.highest_wave == 0 &&
            result.profile.highest_waves == std::array<std::uint32_t, 3>{},
        "Progress and all wave records can reset to zero");
  check(store.debug_set_progress(std::string(64, 'a'), {"dev-progress", "unknown", 0}, {}).code ==
            Code::unknown_guest,
        "Progress editing never creates unknown guests");
}

void queued_edit() {
  Options options;
  options.allow_debug_inventory = true;
  options.allow_debug_progress = true;
  auto db = std::make_shared<Store>(":memory:", options);
  const auto before = db->create_guest();
  wave::app::RoomManager rooms(std::nullopt, 42, {}, db);
  auto& member = rooms.admit(before.guest_token, 1);
  bool done = false;
  check(rooms.debug_inventory(before.guest_token, {"dev", "queued", before.version}, {5, 5}, 400,
                              [&](Result result) {
                                check(result.code == Code::ok, "Queued edit commits");
                                done = true;
                              }),
        "Queue accepts edit");
  check(rooms.wait_storage() && done, "Queue completion delivered");
  check(member.profile->inventory.at({5, 5}) == 400, "Active member receives committed inventory");
  check(db->recover_guest(before.guest_token)->inventory.at({5, 5}) == 400,
        "Database receives edit");
  done = false;
  check(rooms.debug_progress(before.guest_token,
                             {"dev-progress", "queued", member.profile->version},
                             {19600, 15, {40, 50, 60}},
                             [&](Result result) {
                               check(result.code == Code::ok, "Queued progress commits");
                               done = true;
                             }),
        "Queue accepts progress edit");
  check(rooms.wait_storage() && done && member.profile->level == 15 &&
            member.profile->highest_waves == std::array<std::uint32_t, 3>{40, 50, 60},
        "Active member receives committed progress");
}

void http_validation() {
  const std::string good = "kind=45&rarity=5&count=4294967295&version=0&key=test-123";
  check(wave::dev::parse_inventory_edit(good).has_value(), "Full range parses");
  for (const auto* bad : {
           "kind=0&rarity=0&count=1&version=0&key=k",
           "kind=46&rarity=0&count=1&version=0&key=k",
           "kind=5&rarity=6&count=1&version=0&key=k",
           "kind=5&rarity=0&count=-1&version=0&key=k",
           "kind=5&rarity=0&count=1.5&version=0&key=k",
           "kind=5&rarity=0&count=4294967296&version=0&key=k",
           "kind=5&rarity=0&count=1&version=0&key=",
           "kind=5&rarity=0&count=1&version=0&key=k&count=9",
           "kind=5&rarity=0&count=1&version=0&key=k&",
           "kind=5&rarity=0&count=1&version=0",
           "kind=5&rarity=0&count=1&version=0&key=%00",
       }) {
    check(!wave::dev::parse_inventory_edit(bad), "Malformed edit rejected");
  }
  check(wave::dev::parse_progress_edit(
            "xp=9223372036854775807&level=255&garden=2147483647&desert=0&ocean=1&version=0&key=k")
            .has_value(),
        "Full progress range parses");
  const std::string progress = "xp=100&level=2&garden=3&desert=4&ocean=5&version=0&key=k";
  for (const auto& bad :
       {progress + "&xp=100", progress + "&unknown=1", progress + "&",
        std::string("xp=100&level=2&garden=3&desert=4&version=0&key=k"),
        std::string("xp=-1&level=1&garden=0&desert=0&ocean=0&version=0&key=k"),
        std::string("xp=100&level=1&garden=0&desert=0&ocean=0&version=0&key=k"),
        std::string("xp=0&level=1&garden=2147483648&desert=0&ocean=0&version=0&key=k"),
        std::string("xp=0&level=1&garden=0&desert=0&ocean=0&version=0&key=%00")}) {
    check(!wave::dev::parse_progress_edit(bad), "Malformed progress edit rejected");
  }
}
}  // namespace

int main() {
  try {
    edits();
    progress_edits();
    queued_edit();
    http_validation();
    std::cout
        << "PASS dev profile: inventory, progress, equipment, replay, CAS, validation and queue\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
