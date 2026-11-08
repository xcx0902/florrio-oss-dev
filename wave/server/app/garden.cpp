#include "app/garden.hpp"
#include "app/economy_queue.hpp"
#include "catalog/catalog.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
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

struct Garden::StorageState {
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
    std::string room;
    std::string match;
    std::vector<store::RewardEvent> events;
    std::vector<std::string> pickups;
  };
  struct Ledger {
    std::set<std::string> roots;
    std::set<std::uint32_t> waves;
    std::shared_ptr<Batch> pending;
  };
  explicit StorageState(std::shared_ptr<store::Store> value, std::uint32_t seed)
      : db(std::move(value)), rng(seed), scope("garden:" + random_hex(32)),
        queue(storage_capacity) {}
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

Garden::Garden(sim::Rules rules, std::uint32_t seed, std::vector<std::vector<sim::Petal>> loadouts,
               std::shared_ptr<store::Store> storage)
    : rules_(std::move(rules)), seed_(seed), loadouts_(std::move(loadouts)) {
  if (storage) {
    storage_ = std::make_unique<StorageState>(std::move(storage), seed);
  }
}

Garden::~Garden() {
  try {
    drain_storage();
  } catch (const std::exception& error) {
    std::fprintf(stderr, "Garden shutdown failed with %zu pending storage jobs: %s\n",
                 storage_pending(), error.what());
    std::fflush(stderr);
    std::terminate();
  } catch (...) {
    std::fprintf(stderr, "Garden shutdown failed with %zu pending storage jobs: unknown error\n",
                 storage_pending());
    std::fflush(stderr);
    std::terminate();
  }
}

std::shared_ptr<store::Store> Garden::storage() const {
  return storage_ ? storage_->db : nullptr;
}

const std::string& Garden::storage_error() const {
  static const std::string empty;
  return storage_ ? storage_->error : empty;
}

std::size_t Garden::storage_pending() const {
  if (!storage_) {
    return 0;
  }
  std::size_t count = storage_->jobs.size();
  for (const auto& [id, ledger] : storage_->ledgers) {
    count += bool(ledger.pending);
  }
  return count;
}

bool Garden::request_profile(std::string token,
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

bool Garden::debug_inventory(std::string token, store::Command command, store::Item item,
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

void Garden::poll_storage() {
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

bool Garden::wait_storage(std::chrono::milliseconds timeout) {
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

void Garden::drain_storage() {
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
      throw std::runtime_error("Garden storage drain exhausted eight attempts: " + storage_->error);
    }
    if (std::chrono::steady_clock::now() >= report_at) {
      std::fprintf(stderr, "Garden shutdown waiting for %zu pending storage jobs\n",
                   storage_pending());
      std::fflush(stderr);
      report_at = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    }
    storage_->wait(std::chrono::milliseconds(100));
  }
}

Member& Garden::admit(std::string_view token, std::uint64_t connection) {
  poll_storage();
  auto found = members_.find(token);
  if (found == members_.end()) {
    if (members_.size() >= 256) {
      throw std::runtime_error("Garden guest capacity reached");
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
          throw std::runtime_error("Garden economy queue full during admission");
        }
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (!admission->done && std::chrono::steady_clock::now() < deadline) {
          poll_storage();
          if (!admission->done) {
            storage_->wait(std::chrono::milliseconds(10));
          }
        }
        if (!admission->profile) {
          throw std::runtime_error("Garden profile admission unavailable");
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
  entry.connection = connection;
  entry.connected = true;
  if (auto r = rooms_.find(entry.room); r != rooms_.end() && r->second.match) {
    r->second.match->queue(sim::Connection{entry.id, true});
  }
  return entry;
}

const Member* Garden::member(std::string_view token) const {
  const auto it = members_.find(token);
  return it == members_.end() ? nullptr : &it->second;
}

bool Garden::active(std::string_view token, std::uint64_t connection) const {
  const auto* entry = member(token);
  return entry && entry->connected && entry->connection == connection;
}

const Room* Garden::room(const Member& entry) const {
  const auto it = rooms_.find(entry.room);
  return it == rooms_.end() ? nullptr : &it->second;
}

void Garden::disconnect(std::string_view token, std::uint64_t connection) {
  if (!active(token, connection)) {
    return;
  }
  auto& entry = members_.find(token)->second;
  entry.connected = false;
  if (auto it = rooms_.find(entry.room); it != rooms_.end() && it->second.match) {
    it->second.match->queue(sim::Connection{entry.id, false});
  }
}

void Garden::leave(Member& entry) {
  if (storage_) {
    storage_->ready.erase(entry.token);
  }
  auto it = rooms_.find(entry.room);
  if (it != rooms_.end()) {
    if (it->second.match) {
      it->second.match->queue(sim::Connection{entry.id, false});
    }
    std::erase(it->second.members, entry.token);
    if (it->second.members.empty()) {
      rooms_.erase(it);
    }
  }
  entry.room.clear();
  entry.ready = false;
}

bool Garden::join(Member& entry, std::string_view code) {
  auto it = rooms_.find(code);
  if (entry.room == code) {
    return true;
  }
  if (it == rooms_.end() || it->second.match || it->second.members.size() >= 2) {
    return false;
  }
  leave(entry);
  entry.room = code;
  it->second.members.push_back(entry.token);
  return true;
}

void Garden::apply_profile(const store::Profile& profile) {
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

bool Garden::economy_command(Member& member, const wire::ReliableAction& action,
                             std::optional<sim::LifeId> acknowledged_life, std::string key) {
  if (!storage_ || !member.profile || !member.connected) {
    return false;
  }
  auto room = rooms_.find(member.room);
  if (room != rooms_.end() && room->second.match) {
    const auto view = room->second.match->view();
    const auto player = std::ranges::find(view.players, member.id, &sim::PlayerView::id);
    if (player == view.players.end() || !acknowledged_life || player->life != acknowledged_life ||
        player->state != sim::LifeState::alive || !player->connected) {
      return false;
    }
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
      if (slot < 8 && (rules_.catalog ? !rules_.catalog->petal(*kind, sim::Rarity(value.second))
                                      : static_cast<std::size_t>(*kind) >= rules_.petals.size())) {
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

void Garden::settle_economy(Room& room, const sim::MatchView& after) {
  auto& ledger = storage_->ledgers[room.economy_id];
  auto batch = std::make_shared<StorageState::Batch>();
  batch->room = room.code;
  batch->match = room.economy_id;
  struct Eligible {
    const Member* member;
    sim::Vec2 position;
    sim::LifeId life;
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
    eligible.push_back({&member, *position, player->life});
  }

  for (const auto& event : room.match->events()) {
    if (const auto* defeat = std::get_if<sim::Defeat>(&event.data)) {
      if (defeat->group != sim::Group::main_mob || !defeat->mob ||
          defeat->source.faction != sim::Faction::team || !defeat->source.owner ||
          static_cast<unsigned>(defeat->rarity) >= 6) {
        continue;
      }
      const auto owner = std::ranges::find_if(
          eligible, [&](const Eligible& e) { return e.life == *defeat->source.owner; });
      if (owner == eligible.end()) {
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
        recipient.guest_id = e.member->profile->guest_id;
        recipient.xp = mob->xp;
        recipient.discoveries.insert({mob->client_id, static_cast<std::uint8_t>(defeat->rarity)});
        reward.recipients.push_back(std::move(recipient));
      }
      batch->events.push_back(std::move(reward));
      std::size_t index = 0;
      for (const auto& drop : catalog::drop_table()) {
        if (drop.mob != *defeat->mob || drop.mob_rarity != defeat->rarity) {
          ++index;
          continue;
        }
        // Fixed integer PRNG scaling avoids implementation-specific distribution
        // behavior. Drops are independent server rolls, never client requests.
        const double roll = double(storage_->rng()) / 4294967296.0;
        const auto kind = catalog::client_petal(drop.petal, drop.rarity);
        if (roll < drop.probability && kind && static_cast<unsigned>(drop.rarity) < 6) {
          room.drops.push_back({id + ":" + std::to_string(index),
                                {*kind, static_cast<std::uint8_t>(drop.rarity)},
                                defeat->position});
        }
        ++index;
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
        reward.recipients.push_back(std::move(recipient));
      }
      batch->events.push_back(std::move(reward));
    }
  }

  for (auto& drop : room.drops) {
    if (drop.claimed) {
      continue;
    }
    const Eligible* nearest = nullptr;
    double distance = pickup_distance;
    for (const auto& e : eligible) {
      const double candidate = (e.position - drop.position).length();
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
    batch->pickups.push_back(drop.id);
  }
  if (!batch->events.empty()) {
    ledger.pending = std::move(batch);
  }
  flush_economy();
}

void Garden::flush_economy() {
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
                  throw std::runtime_error("Garden reward rejected: " +
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
                std::erase_if(room->second.drops, [&](const Room::Drop& drop) {
                  return std::ranges::find(batch->pickups, drop.id) != batch->pickups.end();
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

bool Garden::command(Member& entry, const wire::ReliableAction& action,
                     std::optional<sim::LifeId> acknowledged_life, std::string key) {
  poll_storage();
  if (std::holds_alternative<wire::Craft>(action) || std::holds_alternative<wire::Equip>(action) ||
      std::holds_alternative<wire::Swap>(action)) {
    return economy_command(entry, action, acknowledged_life, std::move(key));
  }
  if (const auto* name = std::get_if<wire::Nickname>(&action)) {
    entry.name = name->value.empty() ? "Flower" : name->value;
  } else if (const auto* create = std::get_if<wire::CreateSquad>(&action)) {
    if (rooms_.size() >= 32) {
      return false;
    }
    leave(entry);
    std::string code;
    do {
      code = random_hex(6);
    } while (rooms_.contains(code));
    auto& room = rooms_[code];
    room.code = code;
    room.private_room = create->private_room;
    entry.room = code;
    room.members.push_back(entry.token);
  } else if (const auto* join_room = std::get_if<wire::JoinSquad>(&action)) {
    return join(entry, join_room->code);
  } else if (std::holds_alternative<wire::Leave>(action)) {
    leave(entry);
  } else if (const auto* ready = std::get_if<wire::Ready>(&action)) {
    if (storage_ && !storage_->jobs.empty()) {
      // Original Equip(12) and Ready can share one reliable batch. Admission
      // uses committed equipment only, so defer Ready without waiting in tick.
      storage_->ready[entry.token] = {ready->value, entry.connection};
      return true;
    }
    if (entry.room.empty()) {
      // The original Ready button also permits a solo local Garden.
      if (!command(entry, wire::CreateSquad{false}, {})) {
        return false;
      }
    }
    auto& room = rooms_.at(entry.room);
    if (room.match) {
      return false;
    }
    entry.ready = ready->value;
    if (std::ranges::all_of(room.members, [this](const auto& token) {
          const auto& m = members_.at(token);
          return m.ready && m.connected;
        })) {
      room.match = std::make_unique<sim::Match>(sim::MatchId{++next_match_}, seed_, rules_);
      if (storage_) {
        room.economy_id = random_hex(32);
      }
      for (std::size_t i = 0; i < room.members.size(); ++i) {
        const auto& m = members_.at(room.members[i]);
        auto selected =
            i < loadouts_.size() ? loadouts_[i] : std::vector<sim::Petal>(5, sim::Petal::basic);
        std::vector<sim::Rarity> rarities;
        if (m.profile && i >= loadouts_.size()) {
          auto equipment = loadout(*m.profile);
          selected = std::move(equipment.first);
          rarities = std::move(equipment.second);
        }
        if (!room.match->add_player(m.id, {double(i) * 24 - 12, 0}, selected, rarities)) {
          throw std::logic_error("Garden admission failed before tick zero");
        }
      }
    }
  } else if (const auto* move = std::get_if<wire::Move>(&action)) {
    const auto it = rooms_.find(entry.room);
    if (it == rooms_.end() || !it->second.match || !acknowledged_life ||
        acknowledged_life->player != entry.id) {
      ++rejected_inputs;
      return false;
    }
    // Local reconstruction: 100 client aim-distance units select full W1 speed.
    const double amount = move->strength < 2 ? 0 : std::min(1.0, double(move->strength) / 100);
    const bool accepted = it->second.match->queue(
        sim::Input{*acknowledged_life,
                   {std::cos(move->angle) * amount, std::sin(move->angle) * amount},
                   (move->buttons & 1) != 0,
                   (move->buttons & 2) != 0});
    if (accepted) {
      ++accepted_inputs;
    } else {
      ++rejected_inputs;
    }
    return accepted;
  }
  return true;
}

void Garden::step() {
  poll_storage();
  for (auto& [code, room] : rooms_) {
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
        trace.push_back(event);
        if (const auto* hit = std::get_if<sim::HealthChange>(&event.data);
            hit && hit->kind != sim::HealthKind::heal) {
          room.hits.push_back({++room.hit_sequence, *hit});
          if (room.hits.size() > 4096) {
            room.hits.pop_front();
          }
        }
      }
      if (trace.size() > 2048) {
        trace.erase(trace.begin(), trace.begin() + (trace.size() - 2048));
      }
    }
  }
  poll_storage();
}

}  // namespace wave::app
