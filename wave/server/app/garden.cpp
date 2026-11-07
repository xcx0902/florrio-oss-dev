#include "app/garden.hpp"

#include <algorithm>
#include <cmath>
#include <random>
#include <stdexcept>

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
}  // namespace

Garden::Garden(sim::Rules rules, std::uint32_t seed, std::vector<std::vector<sim::Petal>> loadouts)
    : rules_(std::move(rules)), seed_(seed), loadouts_(std::move(loadouts)) {}

Member& Garden::admit(std::string_view token, std::uint64_t connection) {
  auto found = members_.find(token);
  if (found == members_.end()) {
    if (members_.size() >= 256) {
      throw std::runtime_error("Garden guest capacity reached");
    }
    std::string id;
    do {
      id = random_hex(32);
    } while (members_.contains(id));
    found = members_.emplace(id, Member{.id = {++next_player_}, .token = id}).first;
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

bool Garden::command(Member& entry, const wire::ReliableAction& action,
                     std::optional<sim::LifeId> acknowledged_life) {
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
      for (std::size_t i = 0; i < room.members.size(); ++i) {
        const auto& m = members_.at(room.members[i]);
        const auto loadout =
            i < loadouts_.size() ? loadouts_[i] : std::vector<sim::Petal>(5, sim::Petal::basic);
        if (!room.match->add_player(m.id, {double(i) * 24 - 12, 0}, loadout)) {
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
    const bool accepted = it->second.match->queue(sim::Input{
        *acknowledged_life, {std::cos(move->angle) * amount, std::sin(move->angle) * amount}});
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
  for (auto& [code, room] : rooms_) {
    if (room.match && room.match->step()) {
      ++steps;
      for (const auto& event : room.match->events()) {
        trace.push_back(event);
      }
      if (trace.size() > 2048) {
        trace.erase(trace.begin(), trace.begin() + (trace.size() - 2048));
      }
    }
  }
}

}  // namespace wave::app
