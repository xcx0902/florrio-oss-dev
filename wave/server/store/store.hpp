#pragma once

#include <array>
#include <compare>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace wave::store {

using GuestId = std::int64_t;
using Count = std::uint64_t;

struct Item {
  std::uint32_t kind = 0;
  std::uint8_t rarity = 0;
  auto operator<=>(const Item&) const = default;
};
// Owned items use original petal kinds 1..45; discoveries use the SEPARATE
// original mob gallery namespace 1..35. Both use six rarities 0..5.
using Inventory = std::map<Item, Count>;
// Main slots [0,8), reserve slots [8,16). Inventory counts INCLUDE equipped items.
using Slots = std::array<std::optional<Item>, 16>;

struct Profile {
  GuestId guest_id = 0;
  std::string guest_token;
  Count xp = 0;
  std::uint32_t highest_wave = 0;
  std::uint32_t level = 1;
  Inventory inventory;
  Slots slots{};
  std::set<Item> discoveries;  // Explicit mob gallery entries, never inferred from petals.
  Count version = 0;
  bool operator==(const Profile&) const = default;
};

enum class Code : std::uint8_t {
  ok,
  unknown_guest,
  invalid_request,
  version_conflict,
  key_conflict,
  insufficient_items,
  protected_item,
  not_alive,
  locked_slot,
  overflow
};
[[nodiscard]] std::string_view code_name(Code code);

// The app generates both strings. A key is scoped to (guest, scope, key), NOT to
// a socket. Retrying must preserve the entire semantic request, including version.
struct Command {
  std::string scope;
  std::string key;
  Count expected_version = 0;
};

struct EquipRequest {
  Slots slots{};
  // The app supplies authoritative life eligibility; never copy a client claim.
  bool alive = true;
};

struct CraftRequest {
  Item item;
  std::uint32_t attempts = 1;
  bool automatic = false;
  Count keep = 0;  // Additional UNEQUIPPED copies to preserve.
  std::uint8_t highest_output_rarity = 5;
};

struct CraftSummary {
  std::uint32_t attempts = 0;
  std::uint32_t successes = 0;
  Count consumed = 0;
  Count returned = 0;  // Unconsumed inputs: 1..4 per failed roll.
  bool operator==(const CraftSummary&) const = default;
};

struct Result {
  Code code = Code::ok;
  bool replayed = false;
  Profile profile;  // Exact COMMITTED result snapshot, including on replay.
  CraftSummary craft;
};

struct Reward {
  GuestId guest_id = 0;
  Count xp = 0;
  std::optional<std::uint32_t> highest_wave;
  Inventory items;
  std::set<Item> discoveries;
  std::optional<Count> expected_version;
};

// App resolves damage owner, shared eligibility, pickup distance, and segmented
// death identity. One logical event has ONE immutable, canonical recipient set.
// A pickup uses a single recipient: competing claims conflict on the event key.
struct RewardEvent {
  std::string match_id;
  std::string scope;  // e.g. "kill", "pickup", "wave" (distinct event lifecycles).
  std::string event_id;
  std::vector<Reward> recipients;
};
struct RewardResult {
  Code code = Code::ok;
  bool replayed = false;
  std::vector<Profile> profiles;  // Sorted by guest_id; original snapshots on replay.
};

// Original 2022-10-30 client DISPLAY rates recovered at memory 53136+rarity*4
// in $902. Applying those rates on the server is a reconstruction assumption.
// Independent rolls are supported by craft.rng.mode / the 2022-10-20 log.
// Values come from catalog::craft_table(), keeping one numeric authority.
extern const std::array<std::uint32_t, 5> craft_success_per_million;
inline constexpr std::string_view economy_rules_version = "20221030.store-reconstruction.1";
inline constexpr std::uint32_t max_craft_attempts = 1024;
[[nodiscard]] bool craft_succeeds(std::uint8_t input_rarity, std::uint32_t roll_per_million);
[[nodiscard]] std::uint32_t level_for_xp(Count xp);
[[nodiscard]] std::size_t unlocked_main_slots(std::uint32_t level);

enum class FaultPoint {
  after_inventory,
  before_commit,
  after_commit
};
struct Options {
  int busy_timeout_ms = 5000;
  bool allow_test_seed = false;
  bool allow_debug_inventory = false;  // Enabled only by the dedicated development host.
  // Uniform independent 32-bit words. Empty selects OS entropy. Called only
  // for new craft attempts, never for replay or guest credentials.
  std::function<std::uint32_t()> random_word;
  // Throwing before commit rolls back; throwing after commit models lost ACK.
  std::function<void(FaultPoint)> fault;
};

struct TestSeed {
  Count xp = 0;
  std::uint32_t highest_wave = 0;
  Inventory inventory;
  Slots slots{};
  std::set<Item> discoveries;
};

class Error : public std::runtime_error {
 public:
  Error(int sqlite_code, std::string message);
  [[nodiscard]] int sqlite_code() const noexcept { return code_; }

 private:
  int code_;
};

// Synchronous I/O boundary: call on the app's bounded I/O worker, not its tick.
// One instance is thread-safe; separate instances/processes serialize via SQLite.
// Constructor applies migrations and requires stock SQLite3. Implementation
// consumes generated dated tables; these public data types stay independent.
class Store {
 public:
  explicit Store(const std::string& database_path, Options options = {});
  ~Store();
  Store(const Store&) = delete;
  Store& operator=(const Store&) = delete;
  [[nodiscard]] Profile create_guest();
  // Recover a known bearer token, otherwise mint a NEW identity/token. Never
  // adopts an arbitrary claimed token. Empty input explicitly creates a guest.
  [[nodiscard]] Profile admit(std::string_view claimed_token = {});
  // A supplied token is only looked up. Unknown/malformed tokens NEVER create
  // or claim an identity. The app may explicitly create a fresh guest instead.
  [[nodiscard]] std::optional<Profile> recover_guest(std::string_view token);
  [[nodiscard]] Result equip(std::string_view token, const Command&, const EquipRequest&);
  [[nodiscard]] Result craft(std::string_view token, const Command&, const CraftRequest&);
  [[nodiscard]] RewardResult reward(const RewardEvent&);
  // Exact owned count, including equipment. Excess equipped copies are removed
  // in slot order (main before reserve); all other profile fields are preserved.
  [[nodiscard]] Result debug_set_inventory(std::string_view token, const Command&, Item, Count);
  // Disabled by default; no production handouts or guest-name fixture heuristics.
  [[nodiscard]] Profile seed_for_testing(std::string_view token, const TestSeed&);
  [[nodiscard]] int schema_version();

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace wave::store
