#pragma once

#include "sim/match.hpp"
#include "wire/bootstrap.hpp"

#include <map>
#include <deque>
#include <memory>
#include <optional>
#include <string>

namespace wave::app {

struct Member {
  sim::PlayerId id;
  std::string token;
  std::string name = "Flower";
  std::string room;
  std::uint64_t connection = 0;
  bool connected = false;
  bool ready = false;
};

struct Room {
  std::string code;
  bool private_room = true;
  std::vector<std::string> members;
  std::unique_ptr<sim::Match> match;
  struct Hit {
    std::uint64_t sequence;
    sim::HealthChange change;
  };
  // Survives the ticks between broadcasts; each socket advances its own cursor.
  std::deque<Hit> hits;
  std::uint64_t hit_sequence = 0;
};

// Owned by the single Asio executor. A room advances once per host tick,
// independently of the number of sockets, ACKs, or retransmitted requests.
class Garden {
 public:
  explicit Garden(sim::Rules rules = sim::garden_rules(), std::uint32_t seed = 20221030,
                  std::vector<std::vector<sim::Petal>> loadouts = {});
  Member& admit(std::string_view token, std::uint64_t connection);
  bool active(std::string_view token, std::uint64_t connection) const;
  void disconnect(std::string_view token, std::uint64_t connection);
  bool command(Member& member, const wire::ReliableAction& action,
               std::optional<sim::LifeId> acknowledged_life);
  void step();
  const Member* member(std::string_view token) const;
  const Room* room(const Member& member) const;
  const auto& rooms() const { return rooms_; }
  std::uint64_t accepted_inputs = 0;
  std::uint64_t rejected_inputs = 0;
  std::uint64_t steps = 0;
  std::vector<sim::Event> trace;

 private:
  void leave(Member& member);
  bool join(Member& member, std::string_view code);
  sim::Rules rules_;
  std::uint32_t seed_;
  std::vector<std::vector<sim::Petal>> loadouts_;
  std::uint64_t next_player_ = 0;
  std::uint64_t next_match_ = 0;
  std::map<std::string, Member, std::less<>> members_;
  std::map<std::string, Room, std::less<>> rooms_;
};

}  // namespace wave::app
