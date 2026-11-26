#include "app/room_manager.hpp"
#include "app/economy_queue.hpp"
#include "catalog/catalog.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <numbers>
#include <random>
#include <stdexcept>
#include <set>
#include <thread>

namespace wave::app {
namespace {
std::string random_hex(std::size_t count) {
  std::random_device random;
  constexpr char digits[] = "0123456789abcdef";
  std::string result(count, '0');
  for (auto& c : result) {
    c = digits[random() & 15];
  }
  return result;
}

std::string entity_key(sim::EntityId id) {
  return std::to_string(id.slot) + ":" + std::to_string(id.generation);
}

// The original cache stores n main slots, followed by n reserve slots; $70
// clears entries >=2*n. Store always keeps reserve slots at index eight.
std::size_t stored_slot(std::size_t client_slot, std::size_t count) {
  return client_slot < count ? client_slot : 8 + client_slot - count;
}

auto loadout(const store::Profile& profile) {
  std::pair<std::vector<sim::Petal>, std::vector<sim::Rarity>> result;
  const auto count = store::unlocked_main_slots(profile.level);
  for (std::size_t i = 0; i < count; ++i) {
    const auto item = profile.slots[i];
    result.first.push_back(item ? *catalog::petal_from_client(item->kind) : sim::Petal::none);
    result.second.push_back(item ? sim::Rarity(item->rarity) : sim::Rarity::common);
  }
  return result;
}
}  // namespace

struct RoomManager::StorageState {
  struct CommandState {
    std::optional<store::Command> command;
    std::optional<store::EquipRequest> equip;
    std::optional<store::CraftRequest> craft;
    std::optional<store::Result> rejected;
    std::string semantics;
  };
  struct Job {
    EconomyQueue::Work work;
    std::function<void()> finish;
    bool running = false;
    bool done = false;
    std::exception_ptr error;
    std::size_t failures = 0;
    std::chrono::steady_clock::time_point retry_at{};
  };
  struct Batch {
    struct Pickup {
      std::string id;
      sim::EntityId target;
      sim::Vec2 position;
    };
    std::string room;
    std::string match;
    std::vector<store::RewardEvent> events;
    std::vector<Pickup> pickups;
  };
  struct Ledger {
    std::set<std::string> roots;
    std::set<std::uint32_t> waves;
    std::shared_ptr<Batch> pending;
  };
  explicit StorageState(std::shared_ptr<store::Store> value, std::uint32_t seed)
      : db(std::move(value)), rng(seed), scope("rooms:" + random_hex(32)), queue(storage_capacity) {
  }
  bool add(EconomyQueue::Work work, std::function<void()> finish) {
    if (jobs.size() == storage_capacity) {
      return false;
    }
    auto job = std::make_shared<Job>();
    job->work = std::move(work);
    job->finish = std::move(finish);
    jobs.push_back(std::move(job));
    pump();
    return true;
  }
  void pump() {
    if (jobs.empty() || jobs.front()->running ||
        jobs.front()->retry_at > std::chrono::steady_clock::now()) {
      return;
    }
    const auto job = jobs.front();
    // Keep later mutations behind an interrupted transaction until the poller
    // has either delivered its committed result or scheduled its exact retry.
    // Otherwise a queued equip could commit between a failed craft and retry,
    // turning a transient I/O error into an avoidable version conflict.
    job->running = queue.submit(job->work, [job](std::exception_ptr error) {
      job->error = error;
      job->done = true;
    });
  }
  void wait(std::chrono::milliseconds timeout) {
    if (!jobs.empty() && !jobs.front()->running) {
      // The worker has no submitted job during retry backoff; queue.wait would
      // return immediately for an empty queue and turn a barrier into a spin.
      std::this_thread::sleep_until(
          std::min(jobs.front()->retry_at, std::chrono::steady_clock::now() + timeout));
    } else {
      queue.wait(timeout);
    }
  }
  std::shared_ptr<store::Store> db;
  std::mt19937 rng;
  std::string scope;
  std::uint64_t command_sequence = 0;
  std::deque<std::shared_ptr<Job>> jobs;
  std::map<std::string, Ledger> ledgers;
  std::map<std::string, store::Profile, std::less<>> admissions;
  std::map<std::string, std::pair<bool, std::uint64_t>, std::less<>> ready;
  std::map<std::string, std::shared_ptr<CommandState>> commands;
  std::deque<std::string> command_order;
  std::string error;
  EconomyQueue queue;
};

RoomManager::RoomManager(std::optional<sim::Rules> rules_override, std::uint32_t seed,
                         std::vector<std::vector<sim::Petal>> loadouts,
                         std::shared_ptr<store::Store> storage, sim::Biome rotating_biome,
                         RoomLimits limits)
    : rules_override_(std::move(rules_override)), seed_(seed), loadouts_(std::move(loadouts)),
      rotating_biome_(rotating_biome), limits_(limits) {
  if (!limits_.guests || !limits_.rooms || limits_.reconnect_grace.count() < 0) {
    throw std::invalid_argument("Invalid room capacity limits");
  }
  if (rotating_biome != sim::Biome::desert && rotating_biome != sim::Biome::ocean) {
    throw std::invalid_argument("Waves rotation must be Desert or Ocean");
  }
  if (storage) {
    storage_ = std::make_unique<StorageState>(std::move(storage), seed);
  }
}

const sim::Rules* RoomManager::rules_override_for(sim::Biome biome) const {
  return rules_override_ && rules_override_->biome == biome ? &*rules_override_ : nullptr;
}

RoomManager::~RoomManager() {
  try {
    drain_storage();
  } catch (const std::exception& error) {
    std::fprintf(stderr, "Room manager shutdown failed with %zu pending storage jobs: %s\n",
                 storage_pending(), error.what());
    std::fflush(stderr);
    std::terminate();
  } catch (...) {
    std::fprintf(stderr,
                 "Room manager shutdown failed with %zu pending storage jobs: unknown error\n",
                 storage_pending());
    std::fflush(stderr);
    std::terminate();
  }
}

std::shared_ptr<store::Store> RoomManager::storage() const {
  return storage_ ? storage_->db : nullptr;
}

const std::string& RoomManager::storage_error() const {
  static const std::string empty;
  return storage_ ? storage_->error : empty;
}

std::size_t RoomManager::storage_pending() const {
  if (!storage_) {
    return 0;
  }
  std::size_t count = storage_->jobs.size();
  for (const auto& [id, ledger] : storage_->ledgers) {
    count += bool(ledger.pending);
  }
  return count;
}

bool RoomManager::request_profile(std::string token,
                                  std::function<void(std::optional<store::Profile>)> callback,
                                  bool admit) {
  if (!storage_) {
    return false;
  }
  auto result = std::make_shared<std::optional<store::Profile>>();
  const auto db = storage_->db;
  return storage_->add(
      [db, token = std::move(token), admit, result] {
        *result = admit ? std::optional{db->admit(token)} : db->recover_guest(token);
      },
      [this, result, callback = std::move(callback)] {
        if (*result) {
          apply_profile(**result);
          auto& cache = storage_->admissions;
          cache[(**result).guest_token] = **result;
          if (cache.size() > 256) {
            cache.erase(cache.begin());
          }
        }
        callback(*result);
      });
}

bool RoomManager::debug_inventory(std::string token, store::Command command, store::Item item,
                                  store::Count count, std::function<void(store::Result)> callback) {
  if (!storage_) {
    return false;
  }
  const auto db = storage_->db;
  auto result = std::make_shared<store::Result>();
  auto latest = std::make_shared<std::optional<store::Profile>>();
  return storage_->add(
      [db, token, command = std::move(command), item, count, result, latest] {
        *result = db->debug_set_inventory(token, command, item, count);
        *latest = db->recover_guest(token);
      },
      [this, result, latest, callback = std::move(callback)] {
        if (*latest) {
          apply_profile(**latest);
          auto& cache = storage_->admissions;
          cache[(**latest).guest_token] = **latest;
          if (cache.size() > 256) {
            cache.erase(cache.begin());
          }
        }
        callback(std::move(*result));
      });
}

bool RoomManager::debug_progress(std::string token, store::Command command,
                                 store::DebugProgressRequest request,
                                 std::function<void(store::Result)> callback) {
  if (!storage_) {
    return false;
  }
  const auto db = storage_->db;
  auto result = std::make_shared<store::Result>();
  auto latest = std::make_shared<std::optional<store::Profile>>();
  return storage_->add(
      [db, token, command = std::move(command), request, result, latest] {
        *result = db->debug_set_progress(token, command, request);
        *latest = db->recover_guest(token);
      },
      [this, result, latest, callback = std::move(callback)] {
        if (*latest) {
          apply_profile(**latest);
          auto& cache = storage_->admissions;
          cache[(**latest).guest_token] = **latest;
          if (cache.size() > 256) {
            cache.erase(cache.begin());
          }
        }
        callback(std::move(*result));
      });
}

void RoomManager::poll_storage() {
  if (!storage_) {
    return;
  }
  storage_->queue.poll();
  // Copy completed jobs out before invoking callbacks, which may enqueue more
  // reads (HTTP cache feedback) on this same executor.
  std::vector<std::function<void()>> completions;
  for (auto it = storage_->jobs.begin(); it != storage_->jobs.end();) {
    auto& job = **it;
    if (!job.done) {
      ++it;
      continue;
    }
    if (job.error) {
      try {
        std::rethrow_exception(job.error);
      } catch (const std::exception& error) {
        storage_->error = error.what();
      } catch (...) {
        storage_->error = "Unknown economy storage error";
      }
      // Retry the identical immutable transaction/key, including its version.
      // This covers both a rolled-back write and a committed write with lost ACK.
      job.running = job.done = false;
      job.error = {};
      ++job.failures;
      job.retry_at = std::chrono::steady_clock::now() +
                     std::chrono::milliseconds(std::min<std::size_t>(
                         1000, 10u << std::min<std::size_t>(job.failures - 1, 7)));
      ++it;
    } else {
      completions.push_back(std::move(job.finish));
      it = storage_->jobs.erase(it);
    }
  }
  for (auto& finish : completions) {
    finish();
  }
  flush_economy();
  storage_->pump();
  if (storage_->jobs.empty() && !storage_->ready.empty()) {
    auto ready = std::move(storage_->ready);
    storage_->ready.clear();
    for (const auto& [token, request] : ready) {
      const auto found = members_.find(token);
      if (found != members_.end() && active(token, request.second)) {
        command(found->second, wire::Ready{request.first}, {});
      }
    }
  }
}

bool RoomManager::wait_storage(std::chrono::milliseconds timeout) {
  const auto deadline = std::chrono::steady_clock::now() + timeout;
  do {
    poll_storage();
    if (!storage_pending()) {
      return true;
    }
    if (std::chrono::steady_clock::now() >= deadline) {
      return false;
    }
    storage_->wait(std::chrono::milliseconds(10));
  } while (true);
}

void RoomManager::drain_storage() {
  if (!storage_) {
    return;
  }
  // A caller may repair the database after a failed explicit drain and retry.
  // Each invocation grants a fresh bounded retry budget, never a wall deadline
  // that could discard queued work behind a slow but successful transaction.
  for (const auto& job : storage_->jobs) {
    job->failures = 0;
  }
  auto report_at = std::chrono::steady_clock::now() + std::chrono::seconds(5);
  while (true) {
    poll_storage();
    if (!storage_pending()) {
      return;
    }
    if (!storage_->jobs.empty() && storage_->jobs.front()->failures >= 8) {
      throw std::runtime_error("Room manager storage drain exhausted eight attempts: " +
                               storage_->error);
    }
    if (std::chrono::steady_clock::now() >= report_at) {
      std::fprintf(stderr, "Room manager shutdown waiting for %zu pending storage jobs\n",
                   storage_pending());
      std::fflush(stderr);
      report_at = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    }
    storage_->wait(std::chrono::milliseconds(100));
  }
}

Member& RoomManager::admit(std::string_view token, std::uint64_t connection, sim::Biome biome,
                           sim::Mode mode) {
  poll_storage();
  auto found = members_.find(token);
  if (found == members_.end()) {
    if (members_.size() >= limits_.guests) {
      reap_disconnected(true);
    }
    if (members_.size() >= limits_.guests) {
      throw std::runtime_error("Room manager guest capacity reached");
    }
    std::optional<store::Profile> profile;
    if (storage_) {
      if (auto cached = storage_->admissions.find(token); cached != storage_->admissions.end()) {
        profile = std::move(cached->second);
        storage_->admissions.erase(cached);
      } else {
        // The wire admission signature is synchronous. Hosts should prime this
        // cache with request_profile before starting original-client JS. The
        // compatibility fallback is a deliberate admission barrier, never a tick.
        struct Admission {
          bool done = false;
          std::optional<store::Profile> profile;
        };
        auto admission = std::make_shared<Admission>();
        if (!request_profile(std::string(token), [admission](auto result) {
              admission->profile = std::move(result);
              admission->done = true;
            })) {
          throw std::runtime_error("Room manager economy queue full during admission");
        }
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (!admission->done && std::chrono::steady_clock::now() < deadline) {
          poll_storage();
          if (!admission->done) {
            storage_->wait(std::chrono::milliseconds(10));
          }
        }
        if (!admission->profile) {
          throw std::runtime_error("Room manager profile admission unavailable");
        }
        profile = std::move(admission->profile);
        storage_->admissions.erase(profile->guest_token);
      }
    }
    std::string id = profile ? profile->guest_token : random_hex(32);
    while (!profile && members_.contains(id)) {
      id = random_hex(32);
    }
    found = members_.find(id);
    if (found == members_.end()) {
      Member member;
      member.id = profile ? sim::PlayerId{static_cast<std::uint64_t>(profile->guest_id)}
                          : sim::PlayerId{++next_player_};
      member.token = id;
      member.profile = std::move(profile);
      next_player_ = std::max(next_player_, member.id.value);
      found = members_.emplace(id, std::move(member)).first;
    }
  }
  auto& entry = found->second;
  const auto* previous = room(entry);
  if (entry.mode != mode || entry.biome != biome ||
      (previous && !entry.connected &&
       std::chrono::steady_clock::now() - entry.disconnected_at >= limits_.reconnect_grace) ||
      (previous && previous->match && previous->match->phase() == sim::Phase::ended)) {
    // A closed client cannot finish Continue/Leave for an ended match.
    // Expired reservations likewise return to the lobby on admission.
    leave(entry);
    entry.biome = biome;
    entry.mode = mode;
  }
  entry.connection = connection;
  entry.connected = true;
  if (auto r = rooms_.find(entry.room); r != rooms_.end() && r->second.match) {
    r->second.match->queue(sim::Connection{entry.id, true});
  }
  return entry;
}

const Member* RoomManager::member(std::string_view token) const {
  const auto it = members_.find(token);
  return it == members_.end() ? nullptr : &it->second;
}

bool RoomManager::active(std::string_view token, std::uint64_t connection) const {
  const auto* entry = member(token);
  return entry && entry->connected && entry->connection == connection;
}

const Room* RoomManager::room(const Member& entry) const {
  const auto it = rooms_.find(entry.room);
  return it == rooms_.end() ? nullptr : &it->second;
}

std::span<const sim::Petal> RoomManager::default_loadout(std::size_t seat) const {
  static constexpr std::array basic{sim::Petal::basic, sim::Petal::basic, sim::Petal::basic,
                                    sim::Petal::basic, sim::Petal::basic};
  return seat < loadouts_.size() ? std::span<const sim::Petal>(loadouts_[seat]) : basic;
}

void RoomManager::disconnect(std::string_view token, std::uint64_t connection) {
  if (!active(token, connection)) {
    return;
  }
  auto& entry = members_.find(token)->second;
  entry.connected = false;
  entry.disconnected_at = std::chrono::steady_clock::now();
  if (auto it = rooms_.find(entry.room); it != rooms_.end() && it->second.match) {
    it->second.match->queue(sim::Connection{entry.id, false});
  } else {
    // A dropped lobby connection must not keep a seat or block everyone's Ready.
    leave(entry);
  }
}

void RoomManager::reap_disconnected(bool pressure, std::chrono::steady_clock::time_point now) {
  // Pending transactions may still reference a member or match ledger.
  if (storage_pending()) {
    return;
  }
  for (auto it = members_.begin(); it != members_.end();) {
    auto& entry = it->second;
    const auto* previous = room(entry);
    const bool finished =
        previous && previous->match && previous->match->phase() == sim::Phase::ended;
    if (!entry.connected && entry.session_refs == 0 &&
        ((pressure && (entry.room.empty() || finished)) ||
         now - entry.disconnected_at >= limits_.reconnect_grace)) {
      leave(entry);
      it = members_.erase(it);
    } else {
      ++it;
    }
  }
  if (storage_) {
    std::erase_if(storage_->ledgers, [this](const auto& ledger) {
      return std::ranges::none_of(
          rooms_, [&](const auto& room) { return room.second.economy_id == ledger.first; });
    });
  }
}

void RoomManager::leave(Member& entry) {
  if (storage_) {
    storage_->ready.erase(entry.token);
  }
  auto it = rooms_.find(entry.room);
  if (it != rooms_.end()) {
    auto& room = it->second;
    if (room.match) {
      room.match->queue(sim::Departure{entry.id});
    } else if (room.members.front() == entry.token) {
      // The next member takes ownership and confirms the new lobby lineup.
      for (const auto& token : room.members) {
        members_.at(token).ready = false;
        if (storage_) {
          storage_->ready.erase(token);
        }
      }
    }
    std::erase(room.members, entry.token);
    if (room.members.empty()) {
      rooms_.erase(it);
    }
  }
  entry.room.clear();
  entry.ready = false;
}

bool RoomManager::create_room(Member& entry, bool private_room) {
  const auto* current = room(entry);
  // Keep disconnected matches available for reconnect, but reclaim finished,
  // unattended rooms when admission needs a slot. Otherwise 32 past sessions
  // permanently exhaust the host and Ready is acknowledged without starting.
  if (rooms_.size() >= limits_.rooms) {
    for (auto it = rooms_.begin(); it != rooms_.end() && rooms_.size() >= limits_.rooms;) {
      const auto& candidate = it->second;
      const bool unattended = std::ranges::none_of(
          candidate.members, [this](const auto& token) { return members_.at(token).connected; });
      if (&candidate != current && candidate.match && unattended &&
          candidate.match->phase() == sim::Phase::ended) {
        for (const auto& token : candidate.members) {
          auto& member = members_.at(token);
          member.room.clear();
          member.ready = false;
        }
        it = rooms_.erase(it);
      } else {
        ++it;
      }
    }
  }
  if (rooms_.size() >= limits_.rooms && (!current || current->members.size() != 1)) {
    return false;
  }
  std::string code;
  do {
    code = random_hex(6);
  } while (rooms_.contains(code));
  leave(entry);
  auto& created = rooms_[code];
  created.code = code;
  created.version = ++next_room_;
  created.private_room = private_room;
  created.biome = entry.biome;
  created.mode = entry.mode;
  created.loot_rng.seed(seed_ ^ (entry.mode == sim::Mode::pvp ? 0x505650u : 0u));
  created.members.reserve(Room::capacity);
  entry.room = code;
  created.members.push_back(entry.token);
  return true;
}

JoinResult RoomManager::join_squad(Member& entry, std::string_view code) {
  auto it = rooms_.find(code);
  if (it == rooms_.end() || it->second.biome != entry.biome || it->second.mode != entry.mode ||
      (it->second.match && it->second.match->phase() == sim::Phase::ended)) {
    return JoinResult::unavailable;
  }
  if (entry.room == code) {
    return JoinResult::joined;
  }
  auto& target = it->second;
  if (target.members.size() >= Room::capacity) {
    return JoinResult::full;
  }
  if (target.match) {
    return JoinResult::started;
  }
  enter(entry, target);
  return JoinResult::joined;
}

void RoomManager::enter(Member& entry, Room& target) {
  leave(entry);
  entry.room = target.code;
  target.members.push_back(entry.token);
}

bool RoomManager::add_player(const Member& member, sim::Match& match, std::size_t seat) const {
  const auto start = sim::Vec2{double(seat) * 24 - 12, 0};
  if (member.profile && seat >= loadouts_.size()) {
    auto [petals, rarities] = loadout(*member.profile);
    return match.add_player(member.id, start, std::move(petals), std::move(rarities));
  }
  const auto fallback = default_loadout(seat);
  return match.add_player(member.id, start, {fallback.begin(), fallback.end()});
}

bool RoomManager::find_public(Member& entry) {
  Room* lobby = nullptr;
  for (auto& [code, candidate] : rooms_) {
    if (code != entry.room && !candidate.private_room && candidate.biome == entry.biome &&
        candidate.mode == entry.mode && !candidate.match &&
        candidate.members.size() < Room::capacity &&
        (!lobby || candidate.version < lobby->version)) {
      lobby = &candidate;
    }
  }
  if (lobby) {
    enter(entry, *lobby);
    return true;
  }
  // The client waits for the squad code to change before it dismisses Creating.
  return create_room(entry, false);
}

bool RoomManager::join_running_public(Member& entry) {
  if (entry.mode == sim::Mode::pvp) {
    return join_pvp(entry);
  }
  const auto biome = static_cast<unsigned>(entry.biome);
  const auto best = entry.profile ? entry.profile->highest_waves.at(biome) : 0u;
  if (best == 0) {
    return false;
  }
  Room* running = nullptr;
  std::uint32_t highest = 0;
  // The oldest room wins ties. Selection and admission both run on
  // the room executor, so no second request can claim the same free seat.
  for (auto& [code, candidate] : rooms_) {
    if (!candidate.match || candidate.private_room || candidate.biome != entry.biome ||
        candidate.mode != entry.mode || candidate.members.size() >= Room::capacity) {
      continue;
    }
    const auto wave = candidate.match->late_join_wave(entry.id);
    if (wave && *wave <= best &&
        (!running || *wave > highest ||
         (*wave == highest && candidate.version < running->version)) &&
        std::ranges::any_of(candidate.members,
                            [this](const auto& token) { return members_.at(token).connected; })) {
      running = &candidate;
      highest = *wave;
    }
  }
  if (!running || !add_player(entry, *running->match, running->members.size())) {
    return false;
  }
  enter(entry, *running);
  return true;
}

bool RoomManager::join_pvp(Member& entry) {
  if (entry.profile && entry.profile->level < sim::pvp_minimum_level()) {
    return false;
  }
  if (const auto* current = room(entry); current && current->match) {
    return false;
  }
  for (auto& [code, candidate] : rooms_) {
    if (candidate.mode != sim::Mode::pvp || !candidate.match ||
        candidate.match->phase() == sim::Phase::ended || candidate.members.size() >= 32) {
      continue;
    }
    if (!add_player(entry, *candidate.match, candidate.members.size())) {
      continue;
    }
    enter(entry, candidate);
    entry.ready = true;
    return true;
  }
  if (!create_room(entry, false)) {
    return false;
  }
  auto& created = rooms_.at(entry.room);
  auto rules = rules_override_ && rules_override_->mode == sim::Mode::pvp ? *rules_override_
                                                                          : sim::pvp_rules();
  created.match = std::make_unique<sim::Match>(sim::MatchId{++next_match_}, seed_ ^ 0x505650u,
                                               std::move(rules));
  if (!add_player(entry, *created.match, 0)) {
    throw std::logic_error("PvP admission failed");
  }
  if (storage_) {
    created.economy_id = random_hex(32);
  }
  entry.ready = true;
  return true;
}

void RoomManager::apply_profile(const store::Profile& profile) {
  const auto found = members_.find(profile.guest_token);
  if (found == members_.end()) {
    return;
  }
  auto& member = found->second;
  // A replay returns its original committed snapshot. Never roll back a newer
  // profile (for example a later shared kill arriving before the replay ACK).
  if (member.profile && member.profile->version > profile.version) {
    return;
  }
  member.profile = profile;
  const auto room = rooms_.find(member.room);
  if (room != rooms_.end() && room->second.match) {
    auto equipment = loadout(profile);
    room->second.match->set_loadout(member.id, std::move(equipment.first),
                                    std::move(equipment.second));
  }
}

bool RoomManager::economy_command(Member& member, const wire::ReliableAction& action,
                                  std::optional<sim::LifeId> acknowledged_life, std::string key) {
  if (!storage_ || !member.profile || !member.connected) {
    return false;
  }
  const auto* craft = std::get_if<wire::Craft>(&action);
  store::CraftRequest crafting;
  store::EquipRequest equipping;
  std::vector<std::pair<std::size_t, std::optional<store::Item>>> changes;
  std::vector<std::pair<std::size_t, std::optional<store::Item>>> expected;
  std::string semantics;
  if (craft) {
    if (!craft->kind || craft->rarity >= 5 || !catalog::petal_from_client(craft->kind)) {
      return false;
    }
    crafting.item = {craft->kind, craft->rarity};
    crafting.automatic = craft->all;
    crafting.attempts = craft->all ? store::max_craft_attempts : 1;
    crafting.highest_output_rarity =
        static_cast<std::uint8_t>(catalog::craft_table().maximum_rarity);
    semantics = "craft:" + std::to_string(craft->all) + ":" + std::to_string(craft->keep) + ":" +
                std::to_string(craft->kind) + ":" + std::to_string(craft->rarity);
  } else {
    const auto slots = store::unlocked_main_slots(member.profile->level);
    equipping.slots = member.profile->slots;
    const auto* rules = rules_override_for(member.biome);
    const auto& equipment_catalog = rules ? rules->catalog : catalog::dated();
    const auto assign = [&](std::size_t slot, std::pair<std::uint32_t, std::uint8_t> value) {
      if (value.first == 0) {
        equipping.slots[slot].reset();
        changes.emplace_back(slot, std::nullopt);
        return value.second == 0;
      }
      const auto kind = catalog::petal_from_client(value.first);
      if (!kind || value.second >= 6) {
        return false;
      }
      // Keep registered inventory intact, but do not silently simulate a kind
      // whose authoritative effect has not been implemented yet.
      if (slot < 8 && !equipment_catalog.petal(*kind, sim::Rarity(value.second))) {
        return false;
      }
      equipping.slots[slot] = store::Item{value.first, value.second};
      changes.emplace_back(slot, equipping.slots[slot]);
      return true;
    };
    if (const auto* equip = std::get_if<wire::Equip>(&action)) {
      semantics = "equip:";
      for (std::size_t i = 0; i < equip->slots.size(); ++i) {
        if (i >= 2 * slots) {
          if (equip->slots[i] != std::pair<std::uint32_t, std::uint8_t>{0, 0}) {
            return false;
          }
        } else if (!assign(stored_slot(i, slots), equip->slots[i])) {
          return false;
        }
      }
    } else {
      semantics = "swap:";
      const auto& swap = std::get<wire::Swap>(action);
      if (swap.first >= 2 * slots || swap.second >= 2 * slots || swap.first == swap.second ||
          !assign(stored_slot(swap.first, slots), swap.second_item) ||
          !assign(stored_slot(swap.second, slots), swap.first_item)) {
        return false;
      }
      // Original $463 writes the two pre-swap values. They are optimistic
      // preconditions, not target assignments: compare both, then exchange.
      expected.emplace_back(stored_slot(swap.first, slots),
                            equipping.slots[stored_slot(swap.second, slots)]);
      expected.emplace_back(stored_slot(swap.second, slots),
                            equipping.slots[stored_slot(swap.first, slots)]);
    }
    for (const auto& [slot, item] : changes) {
      semantics += std::to_string(slot) + ":" + std::to_string(item ? item->kind : 0) + ":" +
                   std::to_string(item ? item->rarity : 0) + ";";
    }
  }
  const auto room = rooms_.find(member.room);
  if (room != rooms_.end() && room->second.match) {
    // The original client resends its cached equipment in the Identify batch,
    // before it can ACK a life. An unchanged cache is synchronization only;
    // refreshing an active squad must not reject this startup and loop forever.
    if (!acknowledged_life && std::holds_alternative<wire::Equip>(action) &&
        equipping.slots == member.profile->slots) {
      return true;
    }
    const auto view = room->second.match->view();
    const auto player = std::ranges::find(view.players, member.id, &sim::PlayerView::id);
    if (player == view.players.end() || !acknowledged_life || player->life != acknowledged_life ||
        player->state != sim::LifeState::alive || !player->connected) {
      return false;
    }
  }
  if (key.empty()) {
    key = "local:" + std::to_string(++storage_->command_sequence);
  }
  const auto token = member.token;
  const auto logical_key = token + ":" + key;
  auto canonical = storage_->commands.find(logical_key);
  if (canonical == storage_->commands.end()) {
    if (storage_->commands.size() >= 8192) {
      storage_->commands.erase(storage_->command_order.front());
      storage_->command_order.pop_front();
    }
    auto state = std::make_shared<StorageState::CommandState>();
    state->semantics = semantics;
    canonical = storage_->commands.emplace(logical_key, std::move(state)).first;
    storage_->command_order.push_back(logical_key);
  }
  const auto command = canonical->second;
  const bool same_semantics = command->semantics == semantics;
  const auto scope = storage_->scope;
  const auto db = storage_->db;
  const auto wire_keep = craft ? craft->keep : 0;
  auto result = std::make_shared<store::Result>();
  auto latest = std::make_shared<std::optional<store::Profile>>();
  return storage_->add(
      [db, token, key = std::move(key), scope, command, crafting, changes, expected,
       is_craft = bool(craft), wire_keep, same_semantics, result, latest] {
        if (!same_semantics) {
          result->code = store::Code::key_conflict;
          *latest = db->recover_guest(token);
          if (*latest) {
            result->profile = **latest;
          }
          return;
        }
        if (command->rejected) {
          *result = *command->rejected;
          result->replayed = true;
          *latest = db->recover_guest(token);
          return;
        }
        if (!command->command) {
          const auto current = db->recover_guest(token);
          if (!current) {
            result->code = store::Code::unknown_guest;
            return;
          }
          command->command = store::Command{scope, key, current->version};
          for (const auto& [slot, item] : expected) {
            if (current->slots[slot] == item) {
              continue;
            }
            result->code = store::Code::version_conflict;
            result->profile = *current;
            command->rejected = *result;
            *latest = *current;
            return;
          }
          if (is_craft) {
            command->craft = crafting;
            // Original keep includes equipped copies. Resolve against the ordered
            // committed state, so an earlier queued equip is protected exactly once.
            store::Count equipped = 0;
            for (const auto& item : current->slots) {
              if (item == crafting.item) {
                ++equipped;
              }
            }
            command->craft->keep = wire_keep > equipped ? wire_keep - equipped : 0;
          } else {
            command->equip = store::EquipRequest{current->slots, true};
            for (const auto& [slot, item] : changes) {
              command->equip->slots[slot] = item;
            }
          }
        }
        *result = is_craft ? db->craft(token, *command->command, *command->craft)
                           : db->equip(token, *command->command, *command->equip);
        *latest = db->recover_guest(token);
      },
      [this, token, result, latest, is_craft = bool(craft)] {
        if (*latest) {
          apply_profile(**latest);
        }
        if (is_craft) {
          auto& member = members_.at(token);
          member.craft_results.emplace_back(++member.craft_sequence, std::move(*result));
          if (member.craft_results.size() > 256) {
            member.craft_results.pop_front();
          }
        }
      });
}

void RoomManager::settle_economy(Room& room, const sim::MatchView& after) {
  auto& ledger = storage_->ledgers[room.economy_id];
  auto batch = std::make_shared<StorageState::Batch>();
  batch->room = room.code;
  batch->match = room.economy_id;
  struct Eligible {
    const Member* member;
    sim::Vec2 position;
    sim::LifeId life;
    sim::EntityId body;
    double pickup_multiplier = 1;
    std::uint32_t area = 0;
    std::uint64_t life_start_generation = 0;
  };
  std::vector<Eligible> eligible;
  // Eligibility is a snapshot at the authoritative event tick, not at the
  // eventual I/O completion. Simultaneous terminal wave reaping must not revoke
  // a living teammate's last kill reward.
  for (const auto& token : room.members) {
    const auto& member = members_.at(token);
    if (!member.connected || !member.profile) {
      continue;
    }
    const auto player = std::ranges::find(after.players, member.id, &sim::PlayerView::id);
    if (player == after.players.end()) {
      continue;
    }
    if (!player->connected) {
      continue;
    }
    auto body = player->body;
    std::optional<sim::Vec2> position;
    if (player->state == sim::LifeState::ended) {
      for (const auto& event : room.match->events()) {
        const auto* change = std::get_if<sim::LifeChange>(&event.data);
        if (change && change->life == player->life && change->state == sim::LifeState::ended &&
            change->body && change->position) {
          body = change->body;
          position = change->position;
        }
      }
    } else if (player->state == sim::LifeState::alive && body) {
      const auto entity = std::ranges::find(after.entities, *body, &sim::EntityView::id);
      if (entity != after.entities.end()) {
        position = entity->position;
      }
    }
    if (!body || !position) {
      continue;
    }
    bool died = false;
    for (const auto& event : room.match->events()) {
      if (const auto* defeat = std::get_if<sim::Defeat>(&event.data);
          defeat && defeat->group == sim::Group::player && defeat->entity == *body) {
        died = true;
      }
    }
    if (died) {
      continue;
    }
    eligible.push_back({&member, *position, player->life, *body, player->pickup_multiplier,
                        player->area, player->life_start_generation});
  }

  std::map<std::uint32_t, sim::Vec2> closed_areas;
  for (const auto& event : room.match->events()) {
    if (const auto* closed = std::get_if<sim::AreaClosed>(&event.data)) {
      closed_areas[closed->area] = closed->position;
    }
  }
  const auto current_area = [&](std::uint32_t area) {
    return closed_areas.contains(area) ? 0u : area;
  };
  for (const auto& event : room.match->events()) {
    if (const auto* defeat = std::get_if<sim::Defeat>(&event.data)) {
      if (room.mode == sim::Mode::pvp && defeat->group == sim::Group::player) {
        const auto rarity = sim::pvp_basic_rarity(defeat->victim_score);
        const auto id = "player:" + entity_key(defeat->entity);
        if (rarity && ledger.roots.insert(id).second) {
          room.drops.push_back(
              {id,
               {*catalog::client_petal(sim::Petal::basic), static_cast<std::uint8_t>(*rarity)},
               defeat->position,
               ++room.drop_sequence,
               event.tick + sim::Timing{after.step}.ticks_ceil(std::chrono::milliseconds(250)),
               false,
               defeat->area});
        }
        continue;
      }
      const bool portal_closed =
          defeat->mob == sim::Mob::fire_ant_burrow ||
          (defeat->rarity >= sim::Rarity::rare && defeat->mob == sim::Mob::ant_hole);
      if ((defeat->group != sim::Group::main_mob && defeat->group != sim::Group::residual &&
           !defeat->natural_summon) ||
          !defeat->mob ||
          (!portal_closed &&
           (defeat->source.faction == sim::Faction::hostile || !defeat->source.owner)) ||
          static_cast<unsigned>(defeat->rarity) >= 6) {
        continue;
      }
      const auto owner = std::ranges::find_if(eligible, [&](const Eligible& e) {
        return defeat->source.owner && e.member->id == defeat->source.owner->player &&
               e.life.match == defeat->source.owner->match &&
               defeat->source.owner->generation >= e.life_start_generation &&
               defeat->source.owner->generation <= e.life.generation;
      });
      if (owner == eligible.end() && !portal_closed) {
        continue;
      }
      const auto id = entity_key(defeat->entity);
      if (!ledger.roots.insert(id).second) {
        continue;
      }
      const auto* mob = catalog::dated().mob(*defeat->mob, defeat->rarity);
      if (!mob) {
        continue;
      }
      store::RewardEvent reward{room.economy_id, "kill", id, {}};
      for (const auto& e : eligible) {
        store::Reward recipient;
        if (e.area != current_area(defeat->area) ||
            (room.mode == sim::Mode::pvp &&
             (owner == eligible.end() || e.member != owner->member))) {
          continue;
        }
        recipient.guest_id = e.member->profile->guest_id;
        recipient.xp = mob->xp;
        recipient.discoveries.insert({mob->client_id, static_cast<std::uint8_t>(defeat->rarity)});
        reward.recipients.push_back(std::move(recipient));
      }
      if (!reward.recipients.empty()) {
        batch->events.push_back(std::move(reward));
      }
      std::map<sim::Petal, std::vector<const catalog::DropDefinition*>> drop_kinds;
      for (const auto& drop : catalog::drop_table()) {
        if (drop.mob == *defeat->mob && drop.mob_rarity == defeat->rarity) {
          drop_kinds[drop.petal].push_back(&drop);
        }
      }
      const auto first_drop = room.drops.size();
      const auto available_tick =
          event.tick + sim::Timing{after.step}.ticks_ceil(std::chrono::milliseconds(250));
      for (const auto& [petal, variants] : drop_kinds) {
        // Separate petal kinds roll independently. One roll selects at most one
        // rarity of this kind; probabilities retain the client's original mass.
        double roll = double(room.loot_rng()) / 4294967296.0;
        for (const auto* drop : variants) {
          if (roll < drop->probability) {
            const auto kind = *catalog::client_petal(petal);
            room.drops.push_back({id + ":" + std::to_string(kind),
                                  {kind, static_cast<std::uint8_t>(drop->rarity)},
                                  defeat->position,
                                  ++room.drop_sequence,
                                  available_tick,
                                  false,
                                  defeat->area});
            break;
          }
          roll -= drop->probability;
        }
      }
      const auto count = room.drops.size() - first_drop;
      if (count > 1) {
        // A single defeat can yield several kinds; give each card its own spot.
        const double spread = std::min(12., 5.5 / std::sin(std::numbers::pi / count));
        for (std::size_t i = 0; i < count; ++i) {
          const double angle = std::numbers::pi * (.5 + 2. * i / count);
          const sim::Vec2 offset{spread * std::cos(angle), spread * std::sin(angle)};
          const auto hole =
              std::ranges::find(after.ant_holes, defeat->area, &sim::AntHoleView::area);
          const auto radius = hole == after.ant_holes.end() ? after.arena_radius : hole->radius;
          room.drops[first_drop + i].position =
              sim::clamp_center(defeat->position + offset, radius, 4);
        }
      }
    } else if (const auto* transition = std::get_if<sim::Transition>(&event.data)) {
      // Deadlines can carry/discard living mobs: only a threshold transition
      // represents completion. Merely spawning/entering a wave never sets best.
      if (transition->reason != sim::TransitionReason::threshold || eligible.empty() ||
          !ledger.waves.insert(transition->from).second) {
        continue;
      }
      store::RewardEvent reward{room.economy_id, "wave", std::to_string(transition->from), {}};
      for (const auto& e : eligible) {
        store::Reward recipient;
        recipient.guest_id = e.member->profile->guest_id;
        recipient.highest_wave = transition->from;
        recipient.wave_biome = room.biome;
        reward.recipients.push_back(std::move(recipient));
      }
      batch->events.push_back(std::move(reward));
    }
  }

  // Include loot created by the last guard's death in this tick, regardless of
  // event ordering. Interior coordinates are discarded when returning outside.
  for (const auto& [area, position] : closed_areas) {
    for (auto& drop : room.drops) {
      if (drop.area == area) {
        drop.area = 0;
        drop.position = sim::clamp_center(position, after.arena_radius, 4);
      }
    }
    for (auto& pickup : room.pickups) {
      if (pickup.drop.area == area) {
        pickup.drop.area = 0;
        pickup.drop.position = sim::clamp_center(position, after.arena_radius, 4);
        pickup.destination = sim::clamp_center(position, after.arena_radius, 5);
      }
    }
  }

  if (room.mode == sim::Mode::pvp) {
    // Population can shrink the arena after a kill. Cards must remain reachable.
    for (auto& drop : room.drops) {
      drop.position = sim::clamp_center(drop.position, after.arena_radius, 4);
    }
    for (auto& pickup : room.pickups) {
      pickup.drop.position = sim::clamp_center(pickup.drop.position, after.arena_radius, 4);
      pickup.destination = sim::clamp_center(pickup.destination, after.arena_radius, 5);
    }
  }
  for (auto& drop : room.drops) {
    if (drop.claimed ||
        (after.phase != sim::Phase::ended && after.next_tick <= drop.available_tick)) {
      continue;
    }
    const Eligible* nearest = nullptr;
    double distance = std::numeric_limits<double>::infinity();
    for (const auto& e : eligible) {
      if (e.area != drop.area) {
        continue;
      }
      const double candidate = (e.position - drop.position).length();
      if (candidate > pickup_distance * e.pickup_multiplier) {
        continue;
      }
      if (candidate < distance ||
          (candidate == distance && (!nearest || e.member->id.value < nearest->member->id.value))) {
        nearest = &e;
        distance = candidate;
      }
    }
    if (!nearest) {
      continue;
    }
    drop.claimed = true;
    store::Reward recipient;
    recipient.guest_id = nearest->member->profile->guest_id;
    recipient.items[drop.item] = 1;
    batch->events.push_back({room.economy_id, "pickup", drop.id, {std::move(recipient)}});
    batch->pickups.push_back({drop.id, nearest->body, nearest->position});
  }
  if (!batch->events.empty()) {
    ledger.pending = std::move(batch);
  }
  flush_economy();
}

void RoomManager::flush_economy() {
  if (!storage_) {
    return;
  }
  for (auto& [id, ledger] : storage_->ledgers) {
    if (!ledger.pending) {
      continue;
    }
    const auto batch = ledger.pending;
    const auto db = storage_->db;
    auto profiles = std::make_shared<std::map<store::GuestId, store::Profile>>();
    if (!storage_->add(
            [db, batch, profiles] {
              for (const auto& event : batch->events) {
                const auto result = db->reward(event);
                if (result.code != store::Code::ok) {
                  throw std::runtime_error("Room reward rejected: " +
                                           std::string(store::code_name(result.code)));
                }
                for (const auto& profile : result.profiles) {
                  (*profiles)[profile.guest_id] = profile;
                }
              }
            },
            [this, profiles, batch] {
              for (const auto& [guest, profile] : *profiles) {
                apply_profile(profile);
              }
              const auto room = rooms_.find(batch->room);
              if (room != rooms_.end() && room->second.economy_id == batch->match) {
                const auto now = std::chrono::steady_clock::now();
                std::erase_if(room->second.drops, [&](const Room::Drop& drop) {
                  const auto pickup =
                      std::ranges::find(batch->pickups, drop.id, &StorageState::Batch::Pickup::id);
                  if (pickup == batch->pickups.end()) {
                    return false;
                  }
                  room->second.pickups.push_back({drop, pickup->target, pickup->position, now});
                  return true;
                });
              }
            })) {
      break;
    }
    ledger.pending.reset();
  }
  std::erase_if(storage_->ledgers, [this](const auto& entry) {
    return !entry.second.pending && std::ranges::none_of(rooms_, [&](const auto& room) {
      return room.second.match && room.second.economy_id == entry.first;
    });
  });
}

bool RoomManager::command(Member& entry, const wire::ReliableAction& action,
                          std::optional<sim::LifeId> acknowledged_life, std::string key) {
  poll_storage();
  if (std::holds_alternative<wire::Craft>(action) || std::holds_alternative<wire::Equip>(action) ||
      std::holds_alternative<wire::Swap>(action)) {
    return economy_command(entry, action, acknowledged_life, std::move(key));
  }
  if (const auto* name = std::get_if<wire::Nickname>(&action)) {
    entry.name = name->value.empty() ? "Flower" : name->value;
  } else if (const auto* create = std::get_if<wire::CreateSquad>(&action)) {
    if (entry.mode == sim::Mode::pvp) {
      return false;
    }
    return create_room(entry, create->private_room);
  } else if (const auto* visibility = std::get_if<wire::SetSquadPublic>(&action)) {
    const auto found = rooms_.find(entry.room);
    if (found == rooms_.end() || found->second.match ||
        found->second.members.front() != entry.token) {
      return false;
    }
    found->second.private_room = !visibility->value;
  } else if (std::holds_alternative<wire::FindPublicSquad>(action)) {
    return entry.mode == sim::Mode::pvp ? false : find_public(entry);
  } else if (const auto* join_room = std::get_if<wire::JoinSquad>(&action)) {
    return join_squad(entry, join_room->code) == JoinResult::joined;
  } else if (std::holds_alternative<wire::Leave>(action)) {
    leave(entry);
  } else if (std::holds_alternative<wire::Continue>(action)) {
    const auto* current = room(entry);
    // Continue acknowledges death; an ongoing squad retains the player for
    // Yggdrasil or next-wave revival. A delayed Continue also preserves a new life.
    if (!current || !current->match || current->mode == sim::Mode::pvp ||
        current->match->phase() == sim::Phase::ended) {
      leave(entry);
    }
  } else if (std::holds_alternative<wire::AdComplete>(action)) {
    // A Waves player who already sent Continue while waiting for revival can
    // reach GAME OVER without another 21. Both that screen and PvP Continue
    // finish through $456 (34). Keep live matches safe from delayed completions.
    if (const auto* current = room(entry); current && current->match) {
      if (current->match->phase() == sim::Phase::ended) {
        leave(entry);
      } else if (current->mode == sim::Mode::pvp) {
        const auto view = current->match->view();
        const auto player = std::ranges::find(view.players, entry.id, &sim::PlayerView::id);
        if (player != view.players.end() && player->state == sim::LifeState::ended) {
          leave(entry);
        }
      }
    }
  } else if (const auto* ready = std::get_if<wire::Ready>(&action)) {
    if (const auto* current = room(entry); current && current->match) {
      // $991 clears Ready after receiving its flower. This is a lobby-state
      // acknowledgement, not Leave: echo the cleared bit so $382/$2588 can
      // finish the native Ready transition instead of retrying it forever.
      if (!ready->value) {
        entry.ready = false;
      }
      return !ready->value;
    }
    if (storage_ && !storage_->jobs.empty()) {
      // Original Equip(12) and Ready can share one reliable batch. Admission
      // uses committed equipment only, so defer Ready without waiting in tick.
      storage_->ready[entry.token] = {ready->value, entry.connection};
      return true;
    }
    if (entry.mode == sim::Mode::pvp && ready->value) {
      return join_pvp(entry);
    }
    if (entry.room.empty()) {
      if (!ready->value) {
        return true;
      }
      if (join_running_public(entry)) {
        entry.ready = true;
        return true;
      }
      if (!create_room(entry, false)) {
        return false;
      }
    }
    auto& room = rooms_.at(entry.room);
    entry.ready = ready->value;
    if (std::ranges::all_of(room.members, [this](const auto& token) {
          const auto& m = members_.at(token);
          return m.ready && m.connected;
        })) {
      const auto* override_rules = rules_override_for(room.biome);
      auto rules = override_rules ? *override_rules : sim::scenario_rules(room.biome);
      std::size_t opening_index = 0;
      if (rules.progressive_waves) {
        const auto biome = static_cast<unsigned>(room.biome);
        auto lowest = sim::max_wave_number;
        for (const auto& token : room.members) {
          const auto& profile = members_.at(token).profile;
          lowest = std::min(lowest, profile ? profile->highest_waves.at(biome) : 0u);
        }
        // Start at floor(2/3 * minimum), with wave one for a fresh squad.
        opening_index = std::max<std::uint64_t>(1, lowest * std::uint64_t{2} / 3) - 1;
      }
      auto match = std::make_unique<sim::Match>(sim::MatchId{++next_match_}, seed_,
                                                std::move(rules), opening_index);
      for (std::size_t i = 0; i < room.members.size(); ++i) {
        if (!add_player(members_.at(room.members[i]), *match, i)) {
          throw std::logic_error("Room manager admission failed before tick zero");
        }
      }
      if (storage_) {
        room.economy_id = random_hex(32);
      }
      room.match = std::move(match);
    }
  } else if (const auto* move = std::get_if<wire::Move>(&action)) {
    const auto it = rooms_.find(entry.room);
    if (it == rooms_.end() || !it->second.match || !acknowledged_life ||
        acknowledged_life->player != entry.id) {
      ++rejected_inputs;
      return false;
    }
    // The World engine reaches full movement input at 200 client units.
    const double amount = move->strength < 2 ? 0 : std::min(1.0, double(move->strength) / 200);
    const bool accepted = it->second.match->queue(
        sim::Input{*acknowledged_life,
                   {std::cos(move->angle) * amount, std::sin(move->angle) * amount},
                   (move->buttons & 1) != 0,
                   (move->buttons & 2) != 0,
                   move->angle,
                   double(move->strength) / 5});
    if (accepted) {
      ++accepted_inputs;
    } else {
      ++rejected_inputs;
    }
    return accepted;
  }
  return true;
}

void RoomManager::step() {
  poll_storage();
  const auto now = std::chrono::steady_clock::now();
  for (auto& [code, room] : rooms_) {
    while (!room.pickups.empty() && now >= room.pickups.front().started + Room::Pickup::duration) {
      room.pickups.pop_front();
    }
    // A full I/O queue retains at most one tick's settlement per room. Pause
    // that room without waiting for I/O; never advance and silently lose rewards.
    if (storage_ && room.match && storage_->ledgers[room.economy_id].pending) {
      continue;
    }
    if (room.match && room.match->step()) {
      ++steps;
      if (storage_) {
        settle_economy(room, room.match->view());
      }
      for (const auto& event : room.match->events()) {
        if (const auto* transition = std::get_if<sim::Transition>(&event.data)) {
          transitions.emplace_back(event.tick, *transition);
          if (transitions.size() > 128) {
            transitions.pop_front();
          }
        }
        if (const auto* hit = std::get_if<sim::HealthChange>(&event.data);
            hit && hit->kind != sim::HealthKind::heal) {
          room.hits.push_back({++room.hit_sequence, *hit});
          if (room.hits.size() > 4096) {
            room.hits.pop_front();
          }
        } else if (const auto* arc = std::get_if<sim::LightningArc>(&event.data)) {
          room.arcs.push_back({++room.arc_sequence, *arc});
          if (room.arcs.size() > 256) {
            room.arcs.pop_front();
          }
        }
      }
    }
  }
  poll_storage();
}

}  // namespace wave::app
