#pragma once

#include "sim/match.hpp"
#include "store/store.hpp"
#include "wire/bootstrap.hpp"

#include <map>
#include <deque>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <chrono>
#include <functional>

namespace wave::app {

struct Member {
  sim::PlayerId id;
  std::string token;
  std::string name = "Flower";
  std::string room;
  std::uint64_t connection = 0;
  bool connected = false;
  bool ready = false;
  sim::Biome biome = sim::Biome::garden;
  std::optional<store::Profile> profile;
  std::deque<std::pair<std::uint64_t, store::Result>> craft_results;
  std::uint64_t craft_sequence = 0;
};

struct Room {
  std::string code;
  bool private_room = true;
  sim::Biome biome = sim::Biome::garden;
  std::vector<std::string> members;
  std::unique_ptr<sim::Match> match;
  struct Hit {
    std::uint64_t sequence;
    sim::HealthChange change;
  };
  // Survives the ticks between broadcasts; each socket advances its own cursor.
  std::deque<Hit> hits;
  std::uint64_t hit_sequence = 0;
  struct Arc {
    std::uint64_t sequence;
    sim::LightningArc effect;
  };
  std::deque<Arc> arcs;
  std::uint64_t arc_sequence = 0;
  struct Drop {
    std::string id;
    store::Item item;
    sim::Vec2 position;
    std::uint64_t serial;
    sim::Tick available_tick;
    bool claimed = false;
  };
  std::deque<Drop> drops;
  struct Pickup {
    static constexpr auto duration = std::chrono::milliseconds(700);
    Drop drop;
    sim::EntityId target;
    sim::Vec2 destination;
    std::chrono::steady_clock::time_point started;
  };
  std::deque<Pickup> pickups;
  std::uint64_t drop_sequence = 0;
  // Independent of the process-local MatchId: durable reward keys never repeat
  // when a host restarts with match number one again.
  std::string economy_id;
};

// Owned by the single Asio executor. A room advances once per host tick,
// independently of the number of sockets, ACKs, or retransmitted requests.
class Garden {
 public:
  explicit Garden(sim::Rules rules = sim::garden_rules(), std::uint32_t seed = 20221030,
                  std::vector<std::vector<sim::Petal>> loadouts = {},
                  std::shared_ptr<store::Store> storage = {});
  ~Garden();
  Member& admit(std::string_view token, std::uint64_t connection,
                sim::Biome biome = sim::Biome::garden);
  bool active(std::string_view token, std::uint64_t connection) const;
  void disconnect(std::string_view token, std::uint64_t connection);
  bool command(Member& member, const wire::ReliableAction& action,
               std::optional<sim::LifeId> acknowledged_life, std::string key = "");
  void step();
  // Call on the Garden executor before publishing too; neither step nor poll
  // waits for SQLite. wait_storage is a timed admission/test barrier.
  void poll_storage();
  bool request_profile(std::string token,
                       std::function<void(std::optional<store::Profile>)> callback,
                       bool admit = true);
  bool debug_inventory(std::string token, store::Command command, store::Item item,
                       store::Count count, std::function<void(store::Result)> callback);
  bool wait_storage(std::chrono::milliseconds timeout = std::chrono::seconds(5));
  // Shutdown barrier: no deadline for slow successful I/O. Throws after eight
  // failed attempts on one job, retaining pending work for an explicit retry.
  // Destruction calls this and terminates with a diagnostic if draining fails.
  void drain_storage();
  [[nodiscard]] std::size_t storage_pending() const;
  [[nodiscard]] std::shared_ptr<store::Store> storage() const;
  [[nodiscard]] const std::string& storage_error() const;
  static constexpr std::size_t storage_capacity = 64;
  static constexpr double pickup_distance = 16;
  const Member* member(std::string_view token) const;
  const Room* room(const Member& member) const;
  std::span<const sim::Petal> default_loadout(std::size_t seat) const;
  const auto& rooms() const { return rooms_; }
  std::uint64_t accepted_inputs = 0;
  std::uint64_t rejected_inputs = 0;
  std::uint64_t steps = 0;
  std::vector<sim::Event> trace;

 private:
  void leave(Member& member);
  bool create_room(Member& member, bool private_room);
  bool join(Member& member, std::string_view code);
  bool find_public(Member& member);
  bool economy_command(Member&, const wire::ReliableAction&, std::optional<sim::LifeId>,
                       std::string key);
  void apply_profile(const store::Profile&);
  void settle_economy(Room&, const sim::MatchView& after);
  void flush_economy();
  struct StorageState;
  sim::Rules rules_;
  std::uint32_t seed_;
  std::vector<std::vector<sim::Petal>> loadouts_;
  std::uint64_t next_player_ = 0;
  std::uint64_t next_match_ = 0;
  std::map<std::string, Member, std::less<>> members_;
  std::map<std::string, Room, std::less<>> rooms_;
  std::unique_ptr<StorageState> storage_;
};

}  // namespace wave::app
