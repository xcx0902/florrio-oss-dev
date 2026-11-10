#include "store/store.hpp"
#include "catalog/catalog.hpp"

#include <sqlite3.h>

#include <algorithm>
#include <fstream>
#include <limits>
#include <mutex>
#include <utility>

namespace wave::store {
namespace {
constexpr Count sql_max = static_cast<Count>(std::numeric_limits<std::int64_t>::max());
constexpr int current_schema = 3;

bool valid(Item item) {
  return item.kind >= 1 && item.kind <= 80 && item.rarity <= 5;
}
bool valid_owned(Item item) {
  return valid(item) && item.kind <= 45;
}
bool valid_discovery(Item item) {
  return valid(item) && item.kind <= 35;
}
bool valid_key(std::string_view key) {
  return !key.empty() && key.size() <= 256;
}
bool valid_token(std::string_view token) {
  return token.size() == 64 && std::ranges::all_of(token, [](char c) {
           return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
         });
}
bool add(Count& value, Count increment) {
  if (increment > sql_max || value > sql_max - increment) {
    return false;
  }
  value += increment;
  return true;
}

void entropy(void* destination, std::size_t size) {
  // Credentials never use the injectable craft RNG or a predictable PRNG seed.
  std::ifstream input("/dev/urandom", std::ios::binary);
  if (!input.read(static_cast<char*>(destination), static_cast<std::streamsize>(size))) {
    throw Error(SQLITE_IOERR, "OS entropy unavailable");
  }
}
std::string guest_token() {
  std::array<unsigned char, 32> bytes{};
  entropy(bytes.data(), bytes.size());
  constexpr char hex[] = "0123456789abcdef";
  std::string token;
  token.reserve(64);
  for (auto byte : bytes) {
    token += hex[byte >> 4];
    token += hex[byte & 15];
  }
  return token;
}

class Statement {
 public:
  Statement(sqlite3* db, const char* sql) : db_(db) {
    const auto rc = sqlite3_prepare_v2(db, sql, -1, &statement_, nullptr);
    if (rc != SQLITE_OK) {
      throw Error(rc, sqlite3_errmsg(db));
    }
  }
  ~Statement() { sqlite3_finalize(statement_); }
  Statement(const Statement&) = delete;
  Statement& operator=(const Statement&) = delete;
  void number(int index, Count value) {
    if (value > sql_max) {
      throw Error(SQLITE_RANGE, "integer exceeds SQLite int64");
    }
    check(sqlite3_bind_int64(statement_, index, static_cast<sqlite3_int64>(value)));
  }
  void text(int index, std::string_view value) {
    check(sqlite3_bind_text(statement_, index, value.data(), static_cast<int>(value.size()),
                            SQLITE_TRANSIENT));
  }
  void blob(int index, const std::string& value) {
    check(sqlite3_bind_blob(statement_, index, value.data(), static_cast<int>(value.size()),
                            SQLITE_TRANSIENT));
  }
  bool row() {
    const auto rc = sqlite3_step(statement_);
    if (rc == SQLITE_ROW) {
      return true;
    }
    if (rc == SQLITE_DONE) {
      return false;
    }
    throw Error(rc, sqlite3_errmsg(db_));
  }
  void done() {
    if (row()) {
      throw Error(SQLITE_MISUSE, "unexpected SQLite result row");
    }
  }
  Count number(int index) const {
    const auto value = sqlite3_column_int64(statement_, index);
    if (value < 0) {
      throw Error(SQLITE_CORRUPT, "negative stored unsigned integer");
    }
    return static_cast<Count>(value);
  }
  std::string bytes(int index) const {
    const auto* data = static_cast<const char*>(sqlite3_column_blob(statement_, index));
    const auto size = sqlite3_column_bytes(statement_, index);
    return size ? std::string(data, static_cast<std::size_t>(size)) : std::string{};
  }

 private:
  void check(int rc) {
    if (rc != SQLITE_OK) {
      throw Error(rc, sqlite3_errmsg(db_));
    }
  }
  sqlite3* db_;
  sqlite3_stmt* statement_ = nullptr;
};

void execute(sqlite3* db, const char* sql) {
  char* error = nullptr;
  const auto rc = sqlite3_exec(db, sql, nullptr, nullptr, &error);
  if (rc != SQLITE_OK) {
    const std::string message = error ? error : sqlite3_errmsg(db);
    sqlite3_free(error);
    throw Error(rc, message);
  }
}
class Transaction {
 public:
  explicit Transaction(sqlite3* db, bool write = true) : db_(db) {
    execute(db_, write ? "BEGIN IMMEDIATE" : "BEGIN");
  }
  ~Transaction() {
    if (active_) {
      sqlite3_exec(db_, "ROLLBACK", nullptr, nullptr, nullptr);
    }
  }
  void commit() {
    execute(db_, "COMMIT");
    active_ = false;
  }

 private:
  sqlite3* db_;
  bool active_ = true;
};

// Length-delimited, little-endian encoding serves as a collision-free semantic
// fingerprint (the complete canonical request), and as a durable result codec.
// No std::hash, delimiter ambiguity, ABI-dependent structs, or float formatting.
struct Encoder {
  std::string bytes;
  void n(Count value) {
    for (unsigned i = 0; i < 8; ++i) {
      bytes += static_cast<char>((value >> (i * 8)) & 255);
    }
  }
  void s(std::string_view value) {
    n(value.size());
    bytes.append(value);
  }
  void item(Item value) {
    n(value.kind);
    n(value.rarity);
  }
  void inventory(const Inventory& value) {
    n(value.size());
    for (const auto& [key, count] : value) {
      item(key);
      n(count);
    }
  }
  void slots(const Slots& value) {
    for (const auto& slot : value) {
      n(slot.has_value());
      if (slot) {
        item(*slot);
      }
    }
  }
  void discoveries(const std::set<Item>& value) {
    n(value.size());
    for (auto key : value) {
      item(key);
    }
  }
  void profile(const Profile& value) {
    n(static_cast<Count>(value.guest_id));
    s(value.guest_token);
    n(value.xp);
    n(value.highest_wave);
    n(value.level);
    n(value.version);
    inventory(value.inventory);
    slots(value.slots);
    discoveries(value.discoveries);
    for (const auto wave : value.highest_waves) {
      n(wave);
    }
  }
};
struct Decoder {
  std::string_view bytes;
  std::size_t offset = 0;
  [[noreturn]] static void corrupt() { throw Error(SQLITE_CORRUPT, "invalid stored result codec"); }
  Count n() {
    if (bytes.size() - offset < 8) {
      corrupt();
    }
    Count value = 0;
    for (unsigned i = 0; i < 8; ++i) {
      value |= static_cast<Count>(static_cast<unsigned char>(bytes[offset++])) << (8 * i);
    }
    return value;
  }
  std::string s() {
    const auto size = n();
    if (size > bytes.size() - offset) {
      corrupt();
    }
    auto result = std::string(bytes.substr(offset, static_cast<std::size_t>(size)));
    offset += static_cast<std::size_t>(size);
    return result;
  }
  Item item() {
    const auto kind = n(), rarity = n();
    if (kind < 1 || kind > 80 || rarity > 5) {
      corrupt();
    }
    return {static_cast<std::uint32_t>(kind), static_cast<std::uint8_t>(rarity)};
  }
  Profile profile(Count codec) {
    Profile value;
    const auto id = n();
    if (id == 0 || id > sql_max) {
      corrupt();
    }
    value.guest_id = static_cast<GuestId>(id);
    value.guest_token = s();
    value.xp = n();
    const auto wave = n(), level = n();
    if (wave > UINT32_MAX || level > UINT32_MAX) {
      corrupt();
    }
    value.highest_wave = static_cast<std::uint32_t>(wave);
    value.level = static_cast<std::uint32_t>(level);
    value.version = n();
    auto size = n();
    if (size > 480) {
      corrupt();
    }
    for (Count i = 0; i < size; ++i) {
      const auto key = item();
      value.inventory[key] = n();
    }
    for (auto& slot : value.slots) {
      if (n()) {
        slot = item();
      }
    }
    size = n();
    if (size > 480) {
      corrupt();
    }
    for (Count i = 0; i < size; ++i) {
      value.discoveries.insert(item());
    }
    if (codec >= 2) {
      for (auto& best : value.highest_waves) {
        const auto wave = n();
        if (wave > UINT32_MAX) {
          corrupt();
        }
        best = static_cast<std::uint32_t>(wave);
      }
    }
    return value;
  }
  void end() const {
    if (offset != bytes.size()) {
      corrupt();
    }
  }
};

std::string encode(const Result& result) {
  Encoder out;
  out.n(2);
  out.n(static_cast<Count>(result.code));
  out.profile(result.profile);
  out.n(result.craft.attempts);
  out.n(result.craft.successes);
  out.n(result.craft.consumed);
  out.n(result.craft.returned);
  return out.bytes;
}
Result decode_result(const std::string& bytes) {
  Decoder in{bytes};
  const auto codec = in.n();
  if (codec != 1 && codec != 2) {
    Decoder::corrupt();
  }
  Result result;
  const auto code = in.n();
  if (code > static_cast<Count>(Code::overflow)) {
    Decoder::corrupt();
  }
  result.code = static_cast<Code>(code);
  result.profile = in.profile(codec);
  const auto attempts = in.n(), successes = in.n();
  if (attempts > max_craft_attempts || successes > attempts) {
    Decoder::corrupt();
  }
  result.craft.attempts = static_cast<std::uint32_t>(attempts);
  result.craft.successes = static_cast<std::uint32_t>(successes);
  result.craft.consumed = in.n();
  result.craft.returned = in.n();
  in.end();
  result.replayed = true;
  return result;
}
std::string encode(const RewardResult& result) {
  Encoder out;
  out.n(2);
  out.n(static_cast<Count>(result.code));
  out.n(result.profiles.size());
  for (const auto& profile : result.profiles) {
    out.profile(profile);
  }
  return out.bytes;
}
RewardResult decode_reward(const std::string& bytes) {
  Decoder in{bytes};
  const auto codec = in.n();
  if (codec != 1 && codec != 2) {
    Decoder::corrupt();
  }
  RewardResult result;
  const auto code = in.n(), size = in.n();
  if (code > static_cast<Count>(Code::overflow) || size > 256) {
    Decoder::corrupt();
  }
  result.code = static_cast<Code>(code);
  for (Count i = 0; i < size; ++i) {
    result.profiles.push_back(in.profile(codec));
  }
  in.end();
  result.replayed = true;
  return result;
}

Code validate_slots(const Profile& profile, const Slots& slots) {
  Inventory used;
  for (std::size_t index = 0; index < slots.size(); ++index) {
    if (!slots[index]) {
      continue;
    }
    const auto item = *slots[index];
    if (!valid_owned(item)) {
      return Code::invalid_request;
    }
    if (index % 8 >= unlocked_main_slots(profile.level)) {
      return Code::locked_slot;
    }
    const auto it = profile.inventory.find(item);
    if (it == profile.inventory.end() || ++used[item] > it->second) {
      return Code::insufficient_items;
    }
  }
  return Code::ok;
}
}  // namespace

Error::Error(int sqlite_code, std::string message)
    : std::runtime_error(std::move(message)), code_(sqlite_code) {}

const std::array<std::uint32_t, 5> craft_success_per_million =
    catalog::craft_table().server_success_per_million;

std::string_view code_name(Code code) {
  switch (code) {
    case Code::ok:
      return "ok";
    case Code::unknown_guest:
      return "unknown_guest";
    case Code::invalid_request:
      return "invalid_request";
    case Code::version_conflict:
      return "version_conflict";
    case Code::key_conflict:
      return "key_conflict";
    case Code::insufficient_items:
      return "insufficient_items";
    case Code::protected_item:
      return "protected_item";
    case Code::not_alive:
      return "not_alive";
    case Code::locked_slot:
      return "locked_slot";
    case Code::overflow:
      return "overflow";
  }
  return "invalid_code";
}
bool craft_succeeds(std::uint8_t rarity, std::uint32_t roll) {
  if (rarity >= craft_success_per_million.size() || roll >= 1000000) {
    throw std::invalid_argument("invalid craft rarity or roll");
  }
  return roll < craft_success_per_million[rarity];
}
std::uint32_t level_for_xp(Count xp) {
  return catalog::level_for_xp(xp);
}
std::size_t unlocked_main_slots(std::uint32_t level) {
  // Original $107 -> table143 -> $3645: levels 15,30,45 unlock pairs.
  return catalog::unlocked_main_slots(level);
}

struct Store::Impl {
  sqlite3* db = nullptr;
  Options options;
  std::mutex mutex;

  Impl(const std::string& path, Options supplied) : options(std::move(supplied)) {
    if (options.busy_timeout_ms < 0 || options.busy_timeout_ms > 60000) {
      throw std::invalid_argument("invalid SQLite busy timeout");
    }
    const auto rc = sqlite3_open_v2(
        path.c_str(), &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
        nullptr);
    if (rc != SQLITE_OK) {
      const std::string message = db ? sqlite3_errmsg(db) : "SQLite open failed";
      if (db) {
        sqlite3_close(db);
      }
      db = nullptr;
      throw Error(rc, message);
    }
    try {
      sqlite3_extended_result_codes(db, 1);
      sqlite3_busy_timeout(db, options.busy_timeout_ms);
      execute(db, "PRAGMA foreign_keys=ON");
      {
        Statement mode(db, "PRAGMA journal_mode=WAL");
        if (!mode.row() || (mode.bytes(0) != "wal" && path != ":memory:")) {
          throw Error(SQLITE_CANTOPEN, "SQLite WAL mode unavailable");
        }
      }
      execute(db, "PRAGMA synchronous=FULL");
      Transaction transaction(db);
      auto version = schema();
      if (version > current_schema) {
        throw Error(SQLITE_ERROR, "unsupported newer store schema");
      }
      if (version == 0) {
        execute(db, R"SQL(
CREATE TABLE profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 token TEXT NOT NULL UNIQUE CHECK(length(token)=64),
 xp INTEGER NOT NULL CHECK(xp>=0),
 highest_wave INTEGER NOT NULL CHECK(highest_wave BETWEEN 0 AND 4294967295),
 level INTEGER NOT NULL CHECK(level>=1),
 version INTEGER NOT NULL CHECK(version>=0)
);
CREATE TABLE inventory (
 guest_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 kind INTEGER NOT NULL CHECK(kind BETWEEN 1 AND 45),
 rarity INTEGER NOT NULL CHECK(rarity BETWEEN 0 AND 5),
 count INTEGER NOT NULL CHECK(count>0), PRIMARY KEY(guest_id,kind,rarity)
);
CREATE TABLE slots (
 guest_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 15),
 kind INTEGER NOT NULL CHECK(kind BETWEEN 1 AND 45),
 rarity INTEGER NOT NULL CHECK(rarity BETWEEN 0 AND 5), PRIMARY KEY(guest_id,slot)
);
CREATE TABLE discoveries (
 guest_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 kind INTEGER NOT NULL CHECK(kind BETWEEN 1 AND 35),
 rarity INTEGER NOT NULL CHECK(rarity BETWEEN 0 AND 5), PRIMARY KEY(guest_id,kind,rarity)
);
PRAGMA user_version=1;
)SQL");
        version = 1;
      }
      if (version == 1) {
        execute(db, R"SQL(
CREATE TABLE command_results (
 guest_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 scope TEXT NOT NULL, command_key TEXT NOT NULL,
 fingerprint BLOB NOT NULL, result BLOB NOT NULL,
 PRIMARY KEY(guest_id,scope,command_key)
);
CREATE TABLE reward_results (
 match_id TEXT NOT NULL, scope TEXT NOT NULL, event_id TEXT NOT NULL,
 fingerprint BLOB NOT NULL, result BLOB NOT NULL,
 PRIMARY KEY(match_id,scope,event_id)
);
PRAGMA user_version=2;
)SQL");
        version = 2;
      }
      if (version == 2) {
        // The old aggregate does not identify which biome it came from.
        execute(db, R"SQL(
ALTER TABLE profiles ADD COLUMN garden_wave INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN desert_wave INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN ocean_wave INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version=3;
)SQL");
      }
      transaction.commit();
    } catch (...) {
      sqlite3_close(db);
      db = nullptr;
      throw;
    }
  }
  ~Impl() {
    if (db) {
      sqlite3_close(db);
    }
  }

  int schema() {
    Statement query(db, "PRAGMA user_version");
    if (!query.row()) {
      throw Error(SQLITE_CORRUPT, "missing SQLite user_version");
    }
    return static_cast<int>(query.number(0));
  }
  void fault(FaultPoint point) {
    if (options.fault) {
      options.fault(point);
    }
  }
  void commit(Transaction& transaction) {
    fault(FaultPoint::before_commit);
    transaction.commit();
    fault(FaultPoint::after_commit);
  }
  std::uint32_t roll(std::uint32_t range = 1000000) {
    // Unbiased reduction of 2^32 equiprobable words to [0,range).
    // Bounded rejection prevents a broken injected RNG from hanging a worker.
    const Count limit = (Count{1} << 32) / range * range;
    for (unsigned i = 0; i < 128; ++i) {
      std::uint32_t word = 0;
      if (options.random_word) {
        word = options.random_word();
      } else {
        entropy(&word, sizeof(word));
      }
      if (word < limit) {
        return word % range;
      }
    }
    throw Error(SQLITE_ABORT, "random source repeatedly produced rejected words");
  }

  std::optional<Profile> lookup(std::string_view token) {
    if (!valid_token(token)) {
      return {};
    }
    Statement query(db, "SELECT id FROM profiles WHERE token=?");
    query.text(1, token);
    if (!query.row()) {
      return {};
    }
    return load(static_cast<GuestId>(query.number(0)));
  }
  std::optional<Profile> load(GuestId id) {
    if (id <= 0) {
      return {};
    }
    Statement query(db, "SELECT token,xp,highest_wave,level,version,garden_wave,desert_wave,"
                        "ocean_wave FROM profiles WHERE id=?");
    query.number(1, static_cast<Count>(id));
    if (!query.row()) {
      return {};
    }
    Profile result;
    result.guest_id = id;
    result.guest_token = query.bytes(0);
    result.xp = query.number(1);
    result.highest_wave = static_cast<std::uint32_t>(query.number(2));
    result.level = static_cast<std::uint32_t>(query.number(3));
    result.version = query.number(4);
    for (std::size_t biome = 0; biome < result.highest_waves.size(); ++biome) {
      result.highest_waves[biome] = static_cast<std::uint32_t>(query.number(5 + biome));
    }
    Statement inventory(
        db, "SELECT kind,rarity,count FROM inventory WHERE guest_id=? ORDER BY kind,rarity");
    inventory.number(1, static_cast<Count>(id));
    while (inventory.row()) {
      result.inventory[{static_cast<std::uint32_t>(inventory.number(0)),
                        static_cast<std::uint8_t>(inventory.number(1))}] = inventory.number(2);
    }
    Statement slots(db, "SELECT slot,kind,rarity FROM slots WHERE guest_id=? ORDER BY slot");
    slots.number(1, static_cast<Count>(id));
    while (slots.row()) {
      const auto index = slots.number(0);
      if (index >= result.slots.size()) {
        throw Error(SQLITE_CORRUPT, "invalid persisted slot");
      }
      result.slots[static_cast<std::size_t>(index)] = Item{
          static_cast<std::uint32_t>(slots.number(1)), static_cast<std::uint8_t>(slots.number(2))};
    }
    Statement discoveries(
        db, "SELECT kind,rarity FROM discoveries WHERE guest_id=? ORDER BY kind,rarity");
    discoveries.number(1, static_cast<Count>(id));
    while (discoveries.row()) {
      result.discoveries.insert({static_cast<std::uint32_t>(discoveries.number(0)),
                                 static_cast<std::uint8_t>(discoveries.number(1))});
    }
    return result;
  }

  void write_contents(const Profile& profile) {
    for (const auto* sql :
         {"DELETE FROM inventory WHERE guest_id=?", "DELETE FROM slots WHERE guest_id=?",
          "DELETE FROM discoveries WHERE guest_id=?"}) {
      Statement erase(db, sql);
      erase.number(1, static_cast<Count>(profile.guest_id));
      erase.done();
    }
    for (const auto& [item, count] : profile.inventory) {
      if (!count) {
        continue;
      }
      Statement insert(db, "INSERT INTO inventory VALUES(?,?,?,?)");
      insert.number(1, static_cast<Count>(profile.guest_id));
      insert.number(2, item.kind);
      insert.number(3, item.rarity);
      insert.number(4, count);
      insert.done();
    }
    for (std::size_t i = 0; i < profile.slots.size(); ++i) {
      if (!profile.slots[i]) {
        continue;
      }
      Statement insert(db, "INSERT INTO slots VALUES(?,?,?,?)");
      insert.number(1, static_cast<Count>(profile.guest_id));
      insert.number(2, i);
      insert.number(3, profile.slots[i]->kind);
      insert.number(4, profile.slots[i]->rarity);
      insert.done();
    }
    for (auto item : profile.discoveries) {
      Statement insert(db, "INSERT INTO discoveries VALUES(?,?,?)");
      insert.number(1, static_cast<Count>(profile.guest_id));
      insert.number(2, item.kind);
      insert.number(3, item.rarity);
      insert.done();
    }
  }
  void save(Profile& profile) {
    if (profile.version >= sql_max) {
      throw Error(SQLITE_FULL, "profile version exhausted");
    }
    Statement update(db, "UPDATE profiles SET xp=?,highest_wave=?,level=?,version=version+1,"
                         "garden_wave=?,desert_wave=?,ocean_wave=? WHERE id=? AND version=?");
    update.number(1, profile.xp);
    update.number(2, profile.highest_wave);
    update.number(3, profile.level);
    for (std::size_t biome = 0; biome < profile.highest_waves.size(); ++biome) {
      update.number(4 + biome, profile.highest_waves[biome]);
    }
    update.number(7, static_cast<Count>(profile.guest_id));
    update.number(8, profile.version);
    update.done();
    if (sqlite3_changes(db) != 1) {
      throw Error(SQLITE_BUSY, "profile version changed");
    }
    ++profile.version;
    write_contents(profile);
    fault(FaultPoint::after_inventory);
  }

  template <class Apply>
  Result command(std::string_view token, const Command& command, const std::string& fingerprint,
                 Apply apply) {
    std::lock_guard guard(mutex);
    Transaction transaction(db);
    auto profile = lookup(token);
    if (!profile) {
      Result result;
      result.code = Code::unknown_guest;
      return result;
    }
    Result result;
    result.profile = *profile;
    if (!valid_key(command.scope) || !valid_key(command.key) ||
        command.expected_version > sql_max) {
      result.code = Code::invalid_request;
      return result;
    }
    {
      Statement prior(db, "SELECT fingerprint,result FROM command_results "
                          "WHERE guest_id=? AND scope=? AND command_key=?");
      prior.number(1, static_cast<Count>(profile->guest_id));
      prior.text(2, command.scope);
      prior.text(3, command.key);
      if (prior.row()) {
        if (prior.bytes(0) != fingerprint) {
          result.code = Code::key_conflict;
          return result;
        }
        return decode_result(prior.bytes(1));
      }
    }
    if (profile->version != command.expected_version) {
      result.code = Code::version_conflict;
      return result;
    }
    result.code = apply(result);
    if (result.code == Code::ok) {
      save(result.profile);
    } else {
      result.profile = *profile;
      result.craft = {};
    }
    Statement insert(db, "INSERT INTO command_results VALUES(?,?,?,?,?)");
    insert.number(1, static_cast<Count>(profile->guest_id));
    insert.text(2, command.scope);
    insert.text(3, command.key);
    insert.blob(4, fingerprint);
    insert.blob(5, encode(result));
    insert.done();
    commit(transaction);
    return result;
  }
};

Store::Store(const std::string& path, Options options)
    : impl_(std::make_unique<Impl>(path, std::move(options))) {}
Store::~Store() = default;

Profile Store::create_guest() {
  std::lock_guard guard(impl_->mutex);
  Transaction transaction(impl_->db);
  Profile result;
  result.guest_token = guest_token();
  Statement insert(impl_->db,
                   "INSERT INTO profiles(token,xp,highest_wave,level,version) VALUES(?,0,0,1,0)");
  insert.text(1, result.guest_token);
  insert.done();
  result.guest_id = sqlite3_last_insert_rowid(impl_->db);
  result.inventory[Item{1, 0}] = 5;
  for (std::size_t i = 0; i < 5; ++i) {
    result.slots[i] = Item{1, 0};
  }
  impl_->write_contents(result);
  impl_->fault(FaultPoint::after_inventory);
  impl_->commit(transaction);
  return result;
}

std::optional<Profile> Store::recover_guest(std::string_view token) {
  std::lock_guard guard(impl_->mutex);
  Transaction transaction(impl_->db, false);
  auto result = impl_->lookup(token);
  transaction.commit();
  return result;
}

Profile Store::admit(std::string_view claimed_token) {
  if (auto profile = recover_guest(claimed_token)) {
    return *profile;
  }
  return create_guest();
}

Result Store::equip(std::string_view token, const Command& command, const EquipRequest& request) {
  Encoder fingerprint;
  fingerprint.s("equip.v1");
  fingerprint.n(command.expected_version);
  fingerprint.n(request.alive);
  fingerprint.slots(request.slots);
  return impl_->command(token, command, fingerprint.bytes, [&](Result& result) {
    if (!request.alive) {
      return Code::not_alive;
    }
    const auto status = validate_slots(result.profile, request.slots);
    if (status == Code::ok) {
      result.profile.slots = request.slots;
    }
    return status;
  });
}

Result Store::craft(std::string_view token, const Command& command, const CraftRequest& request) {
  Encoder fingerprint;
  fingerprint.s("craft.v1");
  fingerprint.n(command.expected_version);
  fingerprint.item(request.item);
  fingerprint.n(request.attempts);
  fingerprint.n(request.automatic);
  fingerprint.n(request.keep);
  fingerprint.n(request.highest_output_rarity);
  return impl_->command(token, command, fingerprint.bytes, [&](Result& result) {
    if (!valid_owned(request.item) || request.attempts == 0 ||
        request.attempts > max_craft_attempts || request.keep > sql_max ||
        request.highest_output_rarity > 5) {
      return Code::invalid_request;
    }
    if (request.item.rarity == 5 || request.item.rarity >= request.highest_output_rarity ||
        request.item == Item{1, 0}) {
      return Code::protected_item;
    }
    auto& profile = result.profile;
    Count equipped = 0;
    for (const auto& slot : profile.slots) {
      if (slot == request.item) {
        ++equipped;
      }
    }
    const auto input = profile.inventory.find(request.item);
    if (input == profile.inventory.end()) {
      return Code::insufficient_items;
    }
    auto& count = input->second;
    if (count < equipped || request.keep > count - equipped) {
      return Code::insufficient_items;
    }
    const auto reserved = equipped + request.keep;
    const Item output{request.item.kind, static_cast<std::uint8_t>(request.item.rarity + 1)};
    for (std::uint32_t i = 0; i < request.attempts && count - reserved >= 5; ++i) {
      const bool success = craft_succeeds(request.item.rarity, impl_->roll());
      ++result.craft.attempts;
      // The original UI establishes failure loss 1..4. Uniform loss within that
      // range is a reconstruction; it uses a separate unbiased random draw.
      const Count consumed = success ? 5 : 1 + impl_->roll(4);
      count -= consumed;
      result.craft.consumed += consumed;
      if (success) {
        if (!add(profile.inventory[output], 1)) {
          return Code::overflow;
        }
        ++result.craft.successes;
      } else {
        result.craft.returned += 5 - consumed;
      }
      // Both batch and auto are bounded by attempts. Auto is allowed to stop
      // early; a manual batch promises its requested number of attempts.
    }
    if (result.craft.attempts == 0 ||
        (!request.automatic && result.craft.attempts != request.attempts)) {
      return Code::insufficient_items;
    }
    if (!count) {
      profile.inventory.erase(input);
    }
    return Code::ok;
  });
}

Result Store::debug_set_inventory(std::string_view token, const Command& command, Item item,
                                  Count count) {
  if (!impl_->options.allow_debug_inventory) {
    Result result;
    result.code = Code::protected_item;
    return result;
  }
  Encoder fingerprint;
  fingerprint.s("debug-inventory.v1");
  fingerprint.n(command.expected_version);
  fingerprint.item(item);
  fingerprint.n(count);
  return impl_->command(token, command, fingerprint.bytes, [&](Result& result) {
    if (!valid_owned(item) || count > std::numeric_limits<std::uint32_t>::max()) {
      return Code::invalid_request;
    }
    if (count) {
      result.profile.inventory[item] = count;
    } else {
      result.profile.inventory.erase(item);
    }
    Count kept = 0;
    for (auto& slot : result.profile.slots) {
      if (slot == item && ++kept > count) {
        slot.reset();
      }
    }
    return Code::ok;
  });
}

RewardResult Store::reward(const RewardEvent& event) {
  std::lock_guard guard(impl_->mutex);
  RewardResult result;
  if (!valid_key(event.match_id) || !valid_key(event.scope) || !valid_key(event.event_id) ||
      event.recipients.empty() || event.recipients.size() > 256) {
    result.code = Code::invalid_request;
    return result;
  }
  auto recipients = event.recipients;
  std::ranges::sort(recipients, {}, &Reward::guest_id);
  Encoder fingerprint;
  fingerprint.s("reward.v1");
  fingerprint.n(recipients.size());
  GuestId previous = 0;
  for (const auto& reward : recipients) {
    const auto biome = static_cast<unsigned>(reward.wave_biome);
    if (reward.guest_id <= previous || reward.xp > sql_max || biome > 2 ||
        (reward.expected_version && *reward.expected_version > sql_max)) {
      result.code = Code::invalid_request;
      return result;
    }
    previous = reward.guest_id;
    for (const auto& [item, count] : reward.items) {
      if (!valid_owned(item) || count == 0 || count > sql_max) {
        result.code = Code::invalid_request;
        return result;
      }
    }
    for (auto item : reward.discoveries) {
      if (!valid_discovery(item)) {
        result.code = Code::invalid_request;
        return result;
      }
    }
    fingerprint.n(static_cast<Count>(reward.guest_id));
    fingerprint.n(reward.xp);
    // Keep the old 0/1 fingerprints compatible for non-wave and Garden events.
    fingerprint.n(reward.highest_wave ? biome + 1 : 0);
    if (reward.highest_wave) {
      fingerprint.n(*reward.highest_wave);
    }
    fingerprint.n(reward.expected_version.has_value());
    if (reward.expected_version) {
      fingerprint.n(*reward.expected_version);
    }
    fingerprint.inventory(reward.items);
    fingerprint.discoveries(reward.discoveries);
  }
  Transaction transaction(impl_->db);
  {
    Statement prior(impl_->db, "SELECT fingerprint,result FROM reward_results "
                               "WHERE match_id=? AND scope=? AND event_id=?");
    prior.text(1, event.match_id);
    prior.text(2, event.scope);
    prior.text(3, event.event_id);
    if (prior.row()) {
      if (prior.bytes(0) != fingerprint.bytes) {
        result.code = Code::key_conflict;
        return result;
      }
      return decode_reward(prior.bytes(1));
    }
  }
  for (const auto& reward : recipients) {
    auto profile = impl_->load(reward.guest_id);
    if (!profile) {
      result.code = Code::unknown_guest;
      result.profiles.clear();
      return result;
    }
    if (reward.expected_version && *reward.expected_version != profile->version) {
      result.code = Code::version_conflict;
      result.profiles.clear();
      return result;
    }
    if (!add(profile->xp, reward.xp)) {
      result.code = Code::overflow;
      result.profiles.clear();
      return result;
    }
    profile->level = level_for_xp(profile->xp);
    if (reward.highest_wave) {
      auto& best = profile->highest_waves.at(static_cast<unsigned>(reward.wave_biome));
      best = std::max(best, *reward.highest_wave);
      profile->highest_wave = std::max(profile->highest_wave, best);
    }
    for (const auto& [item, count] : reward.items) {
      if (!add(profile->inventory[item], count)) {
        result.code = Code::overflow;
        result.profiles.clear();
        return result;
      }
    }
    profile->discoveries.insert(reward.discoveries.begin(), reward.discoveries.end());
    result.profiles.push_back(std::move(*profile));
  }
  for (auto& profile : result.profiles) {
    impl_->save(profile);
  }
  Statement insert(impl_->db, "INSERT INTO reward_results VALUES(?,?,?,?,?)");
  insert.text(1, event.match_id);
  insert.text(2, event.scope);
  insert.text(3, event.event_id);
  insert.blob(4, fingerprint.bytes);
  insert.blob(5, encode(result));
  insert.done();
  impl_->commit(transaction);
  return result;
}

Profile Store::seed_for_testing(std::string_view token, const TestSeed& seed) {
  std::lock_guard guard(impl_->mutex);
  if (!impl_->options.allow_test_seed) {
    throw std::logic_error("test seeding is disabled");
  }
  if (seed.xp > sql_max) {
    throw std::invalid_argument("invalid seed XP");
  }
  for (const auto& [item, count] : seed.inventory) {
    if (!valid_owned(item) || count == 0 || count > sql_max) {
      throw std::invalid_argument("invalid seed inventory");
    }
  }
  for (auto item : seed.discoveries) {
    if (!valid_discovery(item)) {
      throw std::invalid_argument("invalid seed discovery");
    }
  }
  Transaction transaction(impl_->db);
  auto profile = impl_->lookup(token);
  if (!profile) {
    throw std::invalid_argument("unknown seed guest");
  }
  profile->xp = seed.xp;
  profile->level = level_for_xp(seed.xp);
  profile->highest_waves = seed.highest_waves;
  profile->highest_wave = std::max(seed.highest_wave, std::ranges::max(seed.highest_waves));
  profile->inventory = seed.inventory;
  profile->slots = seed.slots;
  profile->discoveries = seed.discoveries;
  if (validate_slots(*profile, profile->slots) != Code::ok) {
    throw std::invalid_argument("invalid seed slots");
  }
  impl_->save(*profile);
  impl_->commit(transaction);
  return *profile;
}

int Store::schema_version() {
  std::lock_guard guard(impl_->mutex);
  return impl_->schema();
}

}  // namespace wave::store
