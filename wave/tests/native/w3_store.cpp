#include "store/store.hpp"
#include "catalog/catalog.hpp"

#include <sqlite3.h>

#include <algorithm>
#include <array>
#include <barrier>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <future>
#include <iostream>
#include <limits>
#include <random>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <sys/wait.h>
#include <unistd.h>

namespace {
using namespace wave::store;
constexpr Item rose{5, 0};
constexpr Item unusual_rose{5, 1};
constexpr Count max_count = static_cast<Count>(std::numeric_limits<std::int64_t>::max());

void check(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
void status(Code actual, Code expected, const std::string& message) {
  check(actual == expected, message + ": expected " + std::string(code_name(expected)) + ", got " +
                                std::string(code_name(actual)));
}
template <class Exception = std::exception, class Callback>
void throws(Callback callback, const std::string& message) {
  bool caught = false;
  try {
    callback();
  } catch (const Exception&) {
    caught = true;
  }
  check(caught, message);
}
struct Database {
  std::filesystem::path directory;
  std::string path;
  Database() {
    char pattern[] = "/tmp/wave-w3-store-XXXXXX";
    const auto* created = mkdtemp(pattern);
    if (!created) {
      throw std::runtime_error("mkdtemp failed");
    }
    directory = created;
    path = (directory / "profiles.sqlite3").string();
  }
  ~Database() {
    std::error_code ignored;
    std::filesystem::remove_all(directory, ignored);
  }
};
struct Raw {
  sqlite3* db = nullptr;
  explicit Raw(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db) != SQLITE_OK) {
      throw std::runtime_error("raw SQLite open");
    }
  }
  ~Raw() { sqlite3_close(db); }
  void execute(const char* sql) {
    const auto rc = sqlite3_exec(db, sql, nullptr, nullptr, nullptr);
    check(rc == SQLITE_OK, std::string("raw SQL: ") + sqlite3_errmsg(db));
  }
  std::string scalar(const char* sql) {
    sqlite3_stmt* query = nullptr;
    check(sqlite3_prepare_v2(db, sql, -1, &query, nullptr) == SQLITE_OK, "raw prepare");
    const auto rc = sqlite3_step(query);
    if (rc != SQLITE_ROW) {
      sqlite3_finalize(query);
      throw std::runtime_error("raw scalar missing");
    }
    const auto* value = sqlite3_column_text(query, 0);
    const auto result = value ? reinterpret_cast<const char*>(value) : "";
    std::string copy = result;
    sqlite3_finalize(query);
    return copy;
  }
};

Profile get(Store& store, const std::string& token) {
  auto profile = store.recover_guest(token);
  check(profile.has_value(), "guest must exist");
  return *profile;
}
Count count(const Profile& profile, Item item) {
  const auto it = profile.inventory.find(item);
  return it == profile.inventory.end() ? 0 : it->second;
}
void invariant(const Profile& profile) {
  Inventory equipped;
  for (const auto& slot : profile.slots) {
    if (!slot) {
      continue;
    }
    check(slot->kind >= 1 && slot->kind <= 45 && slot->rarity <= 5, "valid equipped item");
    check(++equipped[*slot] <= count(profile, *slot), "equipped quantities never exceed ownership");
  }
  check(profile.level == level_for_xp(profile.xp), "persisted level matches XP");
}
Profile seed(Store& store, const Profile& profile, Inventory inventory, Slots slots = {}) {
  TestSeed fixture;
  fixture.inventory = std::move(inventory);
  fixture.slots = slots;
  return store.seed_for_testing(profile.guest_token, fixture);
}
Options deterministic(std::uint32_t word = 0) {
  Options options;
  options.allow_test_seed = true;
  options.random_word = [word] { return word; };
  return options;
}
Reward grant(GuestId guest, Count xp = 0, Inventory items = {}) {
  Reward reward;
  reward.guest_id = guest;
  reward.xp = xp;
  reward.items = std::move(items);
  return reward;
}

void identity_and_migration() {
  Database db;
  Profile original;
  Profile full_profile;
  Command full_command;
  {
    Store store(db.path);
    check(store.schema_version() == 2, "fresh DB migrates through both schemas");
    original = store.create_guest();
    check(original.guest_id > 0 && original.guest_token.size() == 64, "opaque persistent identity");
    check(original.xp == 0 && original.highest_wave == 0 && original.level == 1 &&
              original.version == 0 && original.inventory == Inventory{{Item{1, 0}, 5}} &&
              original.discoveries.empty(),
          "production guest has exactly five Basic Common, no test handouts");
    check(std::ranges::count(original.slots, std::optional<Item>{Item{1, 0}}) == 5,
          "five starter main slots");
    invariant(original);
    check(!store.recover_guest("claimed-id") && !store.recover_guest(std::string(64, '0')) &&
              !store.recover_guest(original.guest_token + std::string("\0bad", 4)),
          "unknown and malformed identity rejected");
    const auto replacement = store.admit(std::string(64, '0'));
    check(replacement.guest_id != original.guest_id &&
              replacement.guest_token != std::string(64, '0'),
          "unknown claimed token mints unrelated identity");
    check(store.admit(original.guest_token) == original, "admit recovers known bearer");
    throws<std::logic_error>([&] { (void)store.seed_for_testing(original.guest_token, {}); },
                             "test seeding disabled by default");
    std::set<std::string> tokens{original.guest_token, replacement.guest_token};
    for (unsigned i = 0; i < 32; ++i) {
      check(tokens.insert(store.create_guest().guest_token).second, "unique OS-random tokens");
    }
  }
  {
    Raw raw(db.path);
    check(raw.scalar("PRAGMA journal_mode") == "wal", "persistent WAL mode");
    // Downgrade only the journal migration to model an existing v1 database.
    raw.execute("DROP TABLE command_results; DROP TABLE reward_results; PRAGMA user_version=1");
  }
  {
    Store restored(db.path, deterministic());
    check(restored.schema_version() == 2 && get(restored, original.guest_token) == original,
          "migration v1->v2 preserves complete profile");
    TestSeed all;
    all.xp = 202500;
    all.highest_wave = 57;
    for (std::uint32_t kind = 1; kind <= 45; ++kind) {
      for (std::uint8_t rarity = 0; rarity <= 5; ++rarity) {
        const Item item{kind, rarity};
        if (kind <= 35) {
          all.discoveries.insert(item);
        }
        all.inventory[item] = kind + rarity + 1;
      }
    }
    for (std::size_t index = 0; index < all.slots.size(); ++index) {
      if (index % 8 < unlocked_main_slots(level_for_xp(all.xp))) {
        all.slots[index] =
            Item{static_cast<std::uint32_t>(index + 1), static_cast<std::uint8_t>(index % 6)};
      }
    }
    const auto populated = restored.seed_for_testing(original.guest_token, all);
    full_command = {"complete-profile", "all-original-fields", populated.version};
    const auto committed = restored.equip(original.guest_token, full_command, {populated.slots});
    status(committed.code, Code::ok, "full profile command snapshot");
    full_profile = committed.profile;
    invariant(full_profile);
  }
  {
    Store recovered(db.path);
    check(
        get(recovered, full_profile.guest_token) == full_profile,
        "reopen preserves all 270 inventory entries, 16 slots, 210 mob discoveries and progression");
    const auto replay =
        recovered.equip(full_profile.guest_token, full_command, {full_profile.slots});
    check(replay.replayed && replay.profile == full_profile,
          "durable result codec preserves complete profile");
  }
  {
    Raw raw(db.path);
    check(raw.scalar("PRAGMA integrity_check") == "ok", "SQLite integrity after reopen/migrate");
    raw.execute("PRAGMA user_version=3");
  }
  throws<Error>([&] { Store unsupported(db.path); }, "refuse newer schema");
}

void shared_rewards_and_progress() {
  Database db;
  Store store(db.path, deterministic());
  const auto thresholds = wave::catalog::xp_thresholds();
  check(thresholds.size() >= 2 && thresholds[1] > 0, "catalog supplies a level-two threshold");
  const auto level_two = thresholds[1];
  const auto a = store.create_guest(), b = store.create_guest(), outsider = store.create_guest();
  auto ar = grant(a.guest_id, level_two - 1), br = grant(b.guest_id, level_two - 1);
  ar.discoveries.insert(Item{35, 5});
  br.discoveries = ar.discoveries;
  RewardEvent kill{"match-a", "kill", "segmented-parent-42", {br, ar}};
  const auto first = store.reward(kill);
  status(first.code, Code::ok, "shared eligible kill");
  check(first.profiles.size() == 2 && first.profiles[0].guest_id == a.guest_id &&
            first.profiles[1].guest_id == b.guest_id,
        "canonical recipient ordering");
  std::ranges::reverse(kill.recipients);
  const auto replay = store.reward(kill);
  check(replay.replayed && replay.profiles == first.profiles,
        "segment retries cannot duplicate shared XP");
  kill.recipients[0].xp = level_two;
  status(store.reward(kill).code, Code::key_conflict, "same event with changed semantics rejected");
  check(get(store, a.guest_token).xp == level_two - 1 && get(store, outsider.guest_token).xp == 0 &&
            get(store, a.guest_token).discoveries == std::set<Item>{Item{35, 5}},
        "only supplied eligible recipients rewarded");
  auto level = store.reward({"match-a", "kill", "next-death", {grant(a.guest_id, 1)}});
  check(level.profiles.front().xp == level_two && level.profiles.front().level == 2 &&
            level.profiles.front().highest_wave == 0,
        "kill XP crosses exact level boundary independently of wave");
  auto completion = grant(a.guest_id);
  completion.highest_wave = 12;
  status(store.reward({"match-a", "wave", "12", {completion}}).code, Code::ok, "wave completion");
  completion.highest_wave = 4;
  status(store.reward({"match-a", "wave", "4", {completion}}).code, Code::ok,
         "lower completion accepted");
  check(get(store, a.guest_token).highest_wave == 12, "highest wave cannot regress");
  const auto before_items = get(store, a.guest_token);
  status(
      store.reward({"match-a", "pickup", "petal-only", {grant(a.guest_id, 0, {{rose, 1}})}}).code,
      Code::ok, "petal-only reward");
  check(get(store, a.guest_token).discoveries == before_items.discoveries,
        "petal rewards never insert mob gallery discoveries");
  const auto after = get(store, a.guest_token);
  status(store
             .reward({"match-a",
                      "kill",
                      "missing-recipient",
                      {grant(a.guest_id, 500), grant(999999, 500)}})
             .code,
         Code::unknown_guest, "invalid recipient rejects entire shared event");
  check(get(store, a.guest_token) == after, "no partial shared rewards");
  auto guarded = grant(a.guest_id, 1);
  guarded.expected_version = after.version - 1;
  status(store.reward({"match-a", "kill", "cas", {guarded}}).code, Code::version_conflict,
         "reward CAS");
  status(store.reward({"match-a", "kill", "duplicate-recipient", {ar, ar}}).code,
         Code::invalid_request, "duplicate recipient rejected");
  auto illegal = grant(a.guest_id, 0, {{Item{46, 0}, 1}});
  status(store.reward({"match-a", "pickup", "mob-as-petal", {illegal}}).code, Code::invalid_request,
         "mob cannot become an inventory petal");
  illegal = grant(a.guest_id);
  illegal.discoveries.insert(Item{36, 0});
  status(store.reward({"match-a", "kill", "invalid-gallery", {illegal}}).code,
         Code::invalid_request, "mob gallery namespace stops at original kind35");
  // Same numeric event in a different match is a different settlement.
  status(store.reward({"match-b", "kill", "segmented-parent-42", {grant(a.guest_id, 7)}}).code,
         Code::ok, "match scope isolates event dedup");
  for (std::size_t index = 0; index < thresholds.size(); ++index) {
    const auto cap = wave::catalog::level_table().maximum_level;
    check(level_for_xp(thresholds[index]) == std::min<std::size_t>(cap, index + 1),
          "store uses catalog exact XP threshold");
    if (index) {
      check(level_for_xp(thresholds[index] - 1) == std::min<std::size_t>(cap, index),
            "catalog threshold lower boundary");
    }
  }
  check(level_for_xp(max_count) == wave::catalog::level_table().maximum_level,
        "catalog level cap at int64 XP boundary");
}

void equipment_validation_and_dedup() {
  for (const auto& [level, slots] : std::array<std::pair<std::uint32_t, std::size_t>, 8>{
           {{1, 5}, {14, 5}, {15, 6}, {29, 6}, {30, 7}, {44, 7}, {45, 8}, {UINT32_MAX, 8}}}) {
    check(unlocked_main_slots(level) == slots, "original level15/30/45 slot unlock boundaries");
  }
  Database db;
  Store store(db.path, deterministic());
  auto profile = seed(store, store.create_guest(), {{rose, 6}, {Item{1, 0}, 5}});
  EquipRequest equip;
  equip.slots[0] = rose;
  equip.slots[8] = rose;
  equip.slots[1] = Item{1, 0};
  const Command command{"connection-a", "sequence-7", profile.version};
  const auto result = store.equip(profile.guest_token, command, equip);
  status(result.code, Code::ok, "equip main and reserve");
  check(result.profile.inventory == profile.inventory &&
            result.profile.version == profile.version + 1,
        "equip preserves total ownership and advances version");
  invariant(result.profile);
  const auto replay = store.equip(profile.guest_token, command, equip);
  check(replay.replayed && replay.profile == result.profile, "equip replay original result");
  auto changed = equip;
  changed.slots[0].reset();
  status(store.equip(profile.guest_token, command, changed).code, Code::key_conflict,
         "semantic key conflict");
  status(store.craft(profile.guest_token, command, {rose}).code, Code::key_conflict,
         "opcode included in fingerprint");
  status(store.equip(profile.guest_token, {"connection-a", "stale", profile.version}, changed).code,
         Code::version_conflict, "stale equip rejected");
  profile = result.profile;
  auto invalid = equip;
  for (std::size_t i : {0u, 1u, 2u, 3u, 4u, 8u, 9u}) {
    invalid.slots[i] = rose;
  }
  status(store.equip(profile.guest_token, {"equip", "too-many", profile.version}, invalid).code,
         Code::insufficient_items, "duplicate slots cannot counterfeit owned copies");
  invalid = equip;
  invalid.slots[5] = rose;
  status(store.equip(profile.guest_token, {"equip", "locked", profile.version}, invalid).code,
         Code::locked_slot, "level locks main slot and paired reserve");
  invalid = equip;
  invalid.slots[13] = rose;
  status(
      store.equip(profile.guest_token, {"equip", "locked-reserve", profile.version}, invalid).code,
      Code::locked_slot, "level locks reserve slot");
  invalid = equip;
  invalid.alive = false;
  status(store.equip(profile.guest_token, {"equip", "dead", profile.version}, invalid).code,
         Code::not_alive, "authoritative life eligibility enforced");
  invalid = equip;
  invalid.slots[0] = Item{46, 0};
  status(store.equip(profile.guest_token, {"equip", "invalid-kind", profile.version}, invalid).code,
         Code::invalid_request, "unknown petal rejected");
  status(store.equip("claimed", {"equip", "unknown", profile.version}, equip).code,
         Code::unknown_guest, "equip cannot claim arbitrary identity");
  check(get(store, profile.guest_token) == profile,
        "invalid equip requests leave profile unchanged");
  // The same sequence can be used in another connection scope.
  const auto scoped =
      store.equip(profile.guest_token, {"connection-b", "sequence-7", profile.version}, changed);
  status(scoped.code, Code::ok, "connection scope isolates sequence keys");
  check(store.equip(profile.guest_token, command, equip).profile == result.profile,
        "replay returns old committed snapshot after subsequent writes");
}

void craft_thresholds_and_loss() {
  Database db;
  std::vector<std::uint32_t> words;
  std::size_t next = 0;
  auto options = deterministic();
  options.random_word = [&] {
    check(next < words.size(), "unexpected extra craft RNG draw");
    return words[next++];
  };
  Store store(db.path, options);
  auto profile = store.create_guest();
  for (std::uint8_t rarity = 0; rarity < 5; ++rarity) {
    const Item item{rarity == 1 ? 1u : 5u, rarity};
    profile = seed(store, profile, {{item, 10}});
    const auto threshold = craft_success_per_million[rarity];
    check(craft_succeeds(rarity, 0) && craft_succeeds(rarity, threshold - 1) &&
              !craft_succeeds(rarity, threshold) && !craft_succeeds(rarity, 999999),
          "exact probability thresholds");
    words = {threshold - 1};
    next = 0;
    const Command command{"threshold", "success-" + std::to_string(rarity), profile.version};
    const auto success = store.craft(profile.guest_token, command, {item});
    status(success.code, Code::ok, "threshold success");
    check(success.craft == CraftSummary{1, 1, 5, 0} && next == 1 &&
              count(success.profile, item) == 5 &&
              count(success.profile, Item{item.kind, static_cast<std::uint8_t>(rarity + 1)}) == 1,
          "five inputs produce one next-rarity item");
    check(success.profile.discoveries.empty(), "crafting a petal does not discover a mob");
    const auto replay = store.craft(profile.guest_token, command, {item});
    check(replay.replayed && replay.craft == success.craft && replay.profile == success.profile &&
              next == 1,
          "craft dedup never draws RNG again");
    profile = success.profile;
    words = {threshold, 3};
    next = 0;
    const auto failure =
        store.craft(profile.guest_token,
                    {"threshold", "failure-" + std::to_string(rarity), profile.version}, {item});
    status(failure.code, Code::ok, "threshold failure");
    check(failure.craft == CraftSummary{1, 0, 4, 1} && count(failure.profile, item) == 1 &&
              next == 2,
          "failure uses independent loss draw");
    profile = failure.profile;
  }
  for (std::uint32_t loss_word = 0; loss_word < 4; ++loss_word) {
    profile = seed(store, profile, {{rose, 5}});
    words = {999999, loss_word};
    next = 0;
    const auto failure = store.craft(
        profile.guest_token, {"failure-loss", std::to_string(loss_word), profile.version}, {rose});
    check(failure.craft.consumed == loss_word + 1 && failure.craft.returned == 4 - loss_word &&
              count(failure.profile, rose) == 4 - loss_word,
          "failure destroys each of 1..4 inputs");
  }
  throws<std::invalid_argument>([] { (void)craft_succeeds(5, 0); }, "no Ultra craft odds");
  throws<std::invalid_argument>([] { (void)craft_succeeds(0, 1000000); },
                                "out-of-range RNG rejected");
}

void craft_auto_protection_and_caps() {
  Database db;
  Store store(db.path, deterministic());
  auto profile = store.create_guest();
  Slots equipped{};
  equipped[0] = rose;
  equipped[8] = rose;
  profile = seed(store, profile, {{rose, 100}}, equipped);
  CraftRequest automatic{rose, max_craft_attempts, true, 3, 5};
  auto result = store.craft(profile.guest_token, {"auto", "keep", profile.version}, automatic);
  status(result.code, Code::ok, "auto craft");
  check(result.craft.attempts == 19 && count(result.profile, rose) == 5 &&
            count(result.profile, unusual_rose) == 19 && result.profile.slots == equipped,
        "auto protects equipped copies plus additional keep");
  invariant(result.profile);
  profile = seed(store, result.profile, {{rose, 6000}});
  result = store.craft(profile.guest_token, {"auto", "cap", profile.version}, automatic);
  check(result.craft.attempts == max_craft_attempts && count(result.profile, rose) == 880,
        "auto work bounded by hard cap");
  profile = result.profile;
  automatic.attempts = max_craft_attempts + 1;
  status(store.craft(profile.guest_token, {"auto", "over-cap", profile.version}, automatic).code,
         Code::invalid_request, "oversized requests rejected");
  automatic = {Item{5, 4}, 1, true, 0, 4};
  status(
      store.craft(profile.guest_token, {"auto", "rarity-guard", profile.version}, automatic).code,
      Code::protected_item, "configured output rarity protection");
  status(store.craft(profile.guest_token, {"auto", "no-ultra", profile.version}, {Item{5, 5}}).code,
         Code::protected_item, "Mythic cannot become Ultra");
  status(store.craft(profile.guest_token, {"auto", "basic", profile.version}, {Item{1, 0}}).code,
         Code::protected_item, "Basic Common cannot craft");
  status(
      store.craft(profile.guest_token, {"auto", "bad-kind", profile.version}, {Item{46, 0}}).code,
      Code::invalid_request, "craft kind boundary");
  profile = seed(store, profile, {{rose, 9}});
  const Command batch{"batch", "atomic", profile.version};
  const auto denied = store.craft(profile.guest_token, batch, {rose, 2});
  status(denied.code, Code::insufficient_items, "manual batch promises full requested attempts");
  check(get(store, profile.guest_token) == profile && denied.craft == CraftSummary{},
        "partial manual batch fully rolls back");
  status(store
             .reward(
                 {"fixture-match", "pickup", "restock", {grant(profile.guest_id, 0, {{rose, 20}})}})
             .code,
         Code::ok, "restock through explicit reward event");
  const auto replay = store.craft(profile.guest_token, batch, {rose, 2});
  check(replay.replayed && replay.code == Code::insufficient_items && replay.profile == profile,
        "terminal rejection stays stable after restock");
  profile = seed(store, profile, {{rose, 4}});
  status(store.craft(profile.guest_token, {"batch", "under-five", profile.version}, {rose}).code,
         Code::insufficient_items, "five copies required");
}

void rng_rejection_and_overflow() {
  Database db;
  std::uint32_t draws = 0;
  auto options = deterministic();
  options.random_word = [&] { return draws++ == 0 ? UINT32_MAX : 0u; };
  Store store(db.path, options);
  auto profile = seed(store, store.create_guest(), {{rose, 5}});
  const auto accepted =
      store.craft(profile.guest_token, {"rng", "rejected-word", profile.version}, {rose});
  check(accepted.craft.successes == 1 && draws == 2, "unbiased RNG rejects high incomplete bucket");
  profile = seed(store, profile, {{rose, 5}, {unusual_rose, max_count}});
  const auto before = profile;
  status(store.craft(profile.guest_token, {"overflow", "craft", profile.version}, {rose}).code,
         Code::overflow, "craft output cannot overflow SQLite integer");
  check(get(store, profile.guest_token) == before, "overflow consumes no inputs");
  const auto other = store.create_guest();
  status(store
             .reward({"match",
                      "pickup",
                      "overflow",
                      {grant(other.guest_id, 9), grant(profile.guest_id, 0, {{unusual_rose, 1}})}})
             .code,
         Code::overflow, "shared reward overflow");
  check(get(store, other.guest_token) == other && get(store, profile.guest_token) == before,
        "overflow in shared reward leaves every recipient unchanged");
  auto seeded = TestSeed{};
  seeded.xp = max_count;
  seeded.inventory = {{rose, 5}};
  profile = store.seed_for_testing(profile.guest_token, seeded);
  status(store.reward({"match", "kill", "xp-overflow", {grant(profile.guest_id, 1)}}).code,
         Code::overflow, "XP cannot overflow");
  auto broken = deterministic(UINT32_MAX);
  Store broken_store(db.path, broken);
  throws<Error>(
      [&] {
        (void)broken_store.craft(profile.guest_token, {"rng", "broken", profile.version}, {rose});
      },
      "pathological RNG is bounded and throws");
  check(get(store, profile.guest_token) == profile, "RNG failure rolls back");
}

void distribution() {
  Database db;
  std::mt19937 random(20221030);
  auto options = deterministic();
  std::uint64_t draws = 0;
  options.random_word = [&] {
    ++draws;
    return static_cast<std::uint32_t>(random());
  };
  Store store(db.path, options);
  auto profile = store.create_guest();
  constexpr std::uint32_t trials = 100000;
  for (std::uint8_t rarity = 0; rarity < 5; ++rarity) {
    const Item input{5, rarity}, output{5, static_cast<std::uint8_t>(rarity + 1)};
    profile = seed(store, profile, {{input, Count{trials} * 5}});
    Count successes = 0, consumed = 0, returned = 0;
    for (std::uint32_t done = 0; done < trials;) {
      const auto attempts = std::min(max_craft_attempts, trials - done);
      const auto result = store.craft(
          profile.guest_token,
          {"distribution", std::to_string(rarity) + ":" + std::to_string(done), profile.version},
          {input, attempts});
      status(result.code, Code::ok, "distribution transaction");
      check(result.craft.attempts == attempts, "full sample counted");
      successes += result.craft.successes;
      consumed += result.craft.consumed;
      returned += result.craft.returned;
      profile = result.profile;
      done += attempts;
    }
    const double probability = craft_success_per_million[rarity] / 1000000.0;
    const double expected = trials * probability;
    const double sigma = std::sqrt(trials * probability * (1.0 - probability));
    check(std::abs(static_cast<double>(successes) - expected) < 6.0 * sigma,
          "fixed-seed observed rates within six standard deviations of dated table");
    check(count(profile, output) == successes &&
              count(profile, input) + consumed == Count{trials} * 5 &&
              consumed + returned == Count{trials} * 5,
          "distribution conserves consumed/returned inputs");
    const double failed = trials - static_cast<double>(successes);
    const double failure_loss =
        (static_cast<double>(consumed) - 5.0 * static_cast<double>(successes)) / failed;
    check(std::abs(failure_loss - 2.5) < 0.04,
          "uniform reconstructed failure loss has expected mean");
    std::cout << "  distribution rarity=" << unsigned(rarity) << " successes=" << successes << "/"
              << trials << " expected=" << expected << " failure_loss_mean=" << failure_loss
              << '\n';
  }
  check(draws > Count{trials} * 5, "failure randomness uses additional independent draws");
}

void concurrent_pickup_and_shared_dedup() {
  Database db;
  Store one(db.path), two(db.path);
  const auto a = one.create_guest(), b = one.create_guest();
  std::array<RewardResult, 2> results;
  std::array<std::exception_ptr, 2> errors{};
  std::barrier ready(2);
  auto compete = [&](std::size_t index, Store& store, GuestId id) {
    try {
      ready.arrive_and_wait();
      results[index] = store.reward({"race", "pickup", "drop-1", {grant(id, 0, {{rose, 1}})}});
    } catch (...) {
      errors[index] = std::current_exception();
    }
  };
  std::thread first(compete, 0, std::ref(one), a.guest_id);
  std::thread second(compete, 1, std::ref(two), b.guest_id);
  first.join();
  second.join();
  for (auto error : errors) {
    if (error) {
      std::rethrow_exception(error);
    }
  }
  check((results[0].code == Code::ok && results[1].code == Code::key_conflict) ||
            (results[1].code == Code::ok && results[0].code == Code::key_conflict),
        "two competing pickup claims have exactly one winner");
  check(count(get(one, a.guest_token), rose) + count(get(one, b.guest_token), rose) == 1,
        "physical drop granted exactly once");
  RewardEvent shared{"race", "kill", "shared-parent", {grant(a.guest_id, 7), grant(b.guest_id, 7)}};
  std::barrier again(2);
  auto duplicate = [&](std::size_t index, Store& store) {
    try {
      again.arrive_and_wait();
      results[index] = store.reward(shared);
    } catch (...) {
      errors[index] = std::current_exception();
    }
  };
  first = std::thread(duplicate, 0, std::ref(one));
  second = std::thread(duplicate, 1, std::ref(two));
  first.join();
  second.join();
  for (auto error : errors) {
    if (error) {
      std::rethrow_exception(error);
    }
  }
  check(results[0].code == Code::ok && results[1].code == Code::ok &&
            results[0].replayed != results[1].replayed,
        "concurrent duplicate event replays once");
  check(get(one, a.guest_token).xp == 7 && get(one, b.guest_token).xp == 7,
        "shared XP exactly once per recipient");
}

void concurrent_equip_and_craft() {
  Database db;
  Store one(db.path, deterministic()), two(db.path, deterministic());
  for (unsigned round = 0; round < 24; ++round) {
    const auto profile = seed(one, one.create_guest(), {{rose, 5}});
    EquipRequest equip;
    equip.slots[0] = rose;
    std::array<Result, 2> results;
    std::array<std::exception_ptr, 2> errors{};
    std::barrier ready(2);
    std::thread first([&] {
      try {
        ready.arrive_and_wait();
        results[0] = one.equip(profile.guest_token, {"race", "equip", profile.version}, equip);
      } catch (...) {
        errors[0] = std::current_exception();
      }
    });
    std::thread second([&] {
      try {
        ready.arrive_and_wait();
        results[1] = two.craft(profile.guest_token, {"race", "craft", profile.version}, {rose});
      } catch (...) {
        errors[1] = std::current_exception();
      }
    });
    first.join();
    second.join();
    for (auto error : errors) {
      if (error) {
        std::rethrow_exception(error);
      }
    }
    check((results[0].code == Code::ok && results[1].code == Code::version_conflict) ||
              (results[1].code == Code::ok && results[0].code == Code::version_conflict),
          "equip/craft CAS admits exactly one same-version command");
    const auto final = get(one, profile.guest_token);
    invariant(final);
    check(final.version == profile.version + 1, "one race mutation committed");
    if (results[0].code == Code::ok) {
      check(count(final, rose) == 5 && final.slots[0] == rose,
            "winning equip preserves quantities");
      status(two.craft(final.guest_token, {"race", "retry-craft", final.version}, {rose}).code,
             Code::insufficient_items, "subsequent craft protects winning equipped copy");
    } else {
      check(count(final, rose) == 0 && count(final, unusual_rose) == 1 && !final.slots[0],
            "winning craft does not leave dangling equipment");
      status(one.equip(final.guest_token, {"race", "retry-equip", final.version}, equip).code,
             Code::insufficient_items, "subsequent equip cannot restore consumed inputs");
    }
  }
}

void fault_injection_and_lost_reply() {
  for (const auto point :
       {FaultPoint::after_inventory, FaultPoint::before_commit, FaultPoint::after_commit}) {
    Database db;
    bool armed = false;
    auto options = deterministic();
    options.fault = [&](FaultPoint actual) {
      if (armed && actual == point) {
        throw std::runtime_error("injected storage fault");
      }
    };
    Store store(db.path, options);
    const auto profile = seed(store, store.create_guest(), {{rose, 5}});
    const Command command{"fault", "craft", profile.version};
    armed = true;
    throws([&] { (void)store.craft(profile.guest_token, command, {rose}); }, "fault propagates");
    armed = false;
    Store recovered(db.path, deterministic());
    const auto snapshot = get(recovered, profile.guest_token);
    const bool committed = point == FaultPoint::after_commit;
    check(committed
              ? (snapshot.version == profile.version + 1 && count(snapshot, unusual_rose) == 1)
              : snapshot == profile,
          "fault boundary preserves atomic inventory/version");
    const auto retried = recovered.craft(profile.guest_token, command, {rose});
    check(retried.code == Code::ok && retried.replayed == committed &&
              retried.profile.version == profile.version + 1 &&
              count(retried.profile, unusual_rose) == 1,
          "retry after fault produces exactly one committed result");
    Raw raw(db.path);
    check(raw.scalar("SELECT count(*) FROM command_results") == "1",
          "journal contains exactly one command");
  }
  // A fault after the FIRST profile write must roll back the entire shared grant.
  Database db;
  bool armed = false;
  auto options = deterministic();
  options.fault = [&](FaultPoint point) {
    if (armed && point == FaultPoint::after_inventory) {
      throw std::runtime_error("partial shared write");
    }
  };
  Store store(db.path, options);
  const auto a = store.create_guest(), b = store.create_guest();
  const RewardEvent event{
      "fault", "kill", "shared", {grant(a.guest_id, 100), grant(b.guest_id, 100)}};
  armed = true;
  throws([&] { (void)store.reward(event); }, "partial shared write fault");
  armed = false;
  check(get(store, a.guest_token) == a && get(store, b.guest_token) == b,
        "shared transaction rolls back all recipients");
  const auto committed = store.reward(event);
  check(committed.code == Code::ok && !committed.replayed && committed.profiles[0].xp == 100,
        "shared reward retry commits once");
  auto lost_options = Options{};
  lost_options.fault = [](FaultPoint point) {
    if (point == FaultPoint::after_commit) {
      throw std::runtime_error("lost shared reply");
    }
  };
  Store lost_reply(db.path, lost_options);
  auto second_event = event;
  second_event.event_id = "shared-lost-ack";
  throws([&] { (void)lost_reply.reward(second_event); }, "shared reward reply lost after commit");
  const auto replay = store.reward(second_event);
  check(replay.code == Code::ok && replay.replayed && replay.profiles.size() == 2 &&
            replay.profiles[0].xp == 200 && replay.profiles[1].xp == 200 &&
            get(store, a.guest_token).xp == 200 && get(store, b.guest_token).xp == 200,
        "shared reward lost reply recovers each committed result exactly once");
}

void process_crash_recovery() {
  for (const auto point : {FaultPoint::before_commit, FaultPoint::after_commit}) {
    Database db;
    Profile profile;
    {
      Store setup(db.path, deterministic());
      profile = seed(setup, setup.create_guest(), {{rose, 5}});
    }
    const Command command{"process-crash", "craft", profile.version};
    const auto child = fork();
    check(child >= 0, "fork crash fixture");
    if (child == 0) {
      try {
        auto options = deterministic();
        options.fault = [point](FaultPoint actual) {
          if (actual == point) {
            _exit(77);
          }
        };
        Store store(db.path, options);
        (void)store.craft(profile.guest_token, command, {rose});
        _exit(78);
      } catch (...) {
        _exit(79);
      }
    }
    int result = 0;
    check(waitpid(child, &result, 0) == child && WIFEXITED(result) && WEXITSTATUS(result) == 77,
          "child exits at exact transaction boundary without destructors/checkpoint");
    Store recovered(db.path, deterministic());
    const auto retry = recovered.craft(profile.guest_token, command, {rose});
    check(retry.code == Code::ok && retry.replayed == (point == FaultPoint::after_commit) &&
              retry.profile.version == profile.version + 1 &&
              count(retry.profile, unusual_rose) == 1,
          "OS process recovery has one committed craft/result");
    Raw raw(db.path);
    check(raw.scalar("PRAGMA integrity_check") == "ok" &&
              raw.scalar("SELECT count(*) FROM command_results") == "1",
          "crashed WAL recovers intact journal");
  }
}

void lock_contention_and_single_instance_threads() {
  Database db;
  Store setup(db.path);
  const auto guest = setup.create_guest();
  auto options = Options{};
  options.busy_timeout_ms = 20;
  Store contender(db.path, options);
  const RewardEvent event{"locks", "kill", "pending", {grant(guest.guest_id, 7)}};
  {
    Raw blocker(db.path);
    blocker.execute("BEGIN IMMEDIATE");
    throws<Error>([&] { (void)contender.reward(event); },
                  "busy timeout is recoverable and commits nothing");
    check(get(setup, guest.guest_token) == guest, "WAL reader stays available while writer locked");
    blocker.execute("ROLLBACK");
  }
  check(contender.reward(event).code == Code::ok && contender.reward(event).replayed,
        "same event can retry after SQLite lock clears");
  constexpr std::size_t workers = 8;
  std::array<std::exception_ptr, workers> errors{};
  std::array<std::thread, workers> threads;
  for (std::size_t index = 0; index < workers; ++index) {
    threads[index] = std::thread([&, index] {
      try {
        for (unsigned i = 0; i < 20; ++i) {
          const auto result = setup.reward({"threads",
                                            "kill",
                                            std::to_string(index) + ":" + std::to_string(i),
                                            {grant(guest.guest_id, 1)}});
          status(result.code, Code::ok, "single Store serializes callers");
        }
      } catch (...) {
        errors[index] = std::current_exception();
      }
    });
  }
  for (auto& thread : threads) {
    thread.join();
  }
  for (auto error : errors) {
    if (error) {
      std::rethrow_exception(error);
    }
  }
  const auto final = get(setup, guest.guest_token);
  check(final.xp == 7 + workers * 20 && final.version == 1 + workers * 20,
        "all concurrent same-instance rewards persist with no lost updates");
}
}  // namespace

int main() {
  using Test = std::pair<const char*, void (*)()>;
  const std::array tests{
      Test{"W3-04 identity, WAL, migrations, recovery", identity_and_migration},
      Test{"W3-02 shared rewards, segment dedup, XP and highest wave", shared_rewards_and_progress},
      Test{"W3-03 equipment quantities, eligibility and semantic dedup",
           equipment_validation_and_dedup},
      Test{"W3-03 deterministic chance thresholds and failure loss", craft_thresholds_and_loss},
      Test{"W3-03 auto/batch cap, keep, equipped and rarity protection",
           craft_auto_protection_and_caps},
      Test{"W3-03 unbiased RNG failure and integer overflow", rng_rejection_and_overflow},
      Test{"W3-03 fixed-seed 500000-craft distribution", distribution},
      Test{"W3-02 two-person pickup race and shared event concurrency",
           concurrent_pickup_and_shared_dedup},
      Test{"W3-04 concurrent equip/craft CAS, 24 races", concurrent_equip_and_craft},
      Test{"W3-04 rollback fault injection and committed lost reply",
           fault_injection_and_lost_reply},
      Test{"W3-04 process exit before/after commit and WAL recovery", process_crash_recovery},
      Test{"W3-04 bounded SQLite lock waits and 8 concurrent callers",
           lock_contention_and_single_instance_threads}};
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "PASS " << name << '\n';
    } catch (const std::exception& error) {
      std::cerr << "FAIL " << name << ": " << error.what() << '\n';
      return 1;
    }
  }
  std::cout << "PASS w3_store " << tests.size() << " groups; rules=" << economy_rules_version
            << '\n';
}
