#include "wire/garden_projection.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <numbers>
#include <set>
#include <stdexcept>

namespace wave::wire {
namespace {
// Shared local calibration for positions, collision radii, camera and arena.
constexpr double world_scale = 5;

struct Writer {
  Bytes bytes;
  void byte(std::uint8_t value) { bytes.push_back(value); }
  void zeros(std::size_t count) { bytes.insert(bytes.end(), count, 0); }
  void integer(std::uint32_t value) {
    while (value >= 128) {
      byte((value & 127) | 128);
      value >>= 7;
    }
    byte(value);
  }
  void word(std::uint32_t value) {
    for (unsigned i = 0; i < 4; ++i) {
      byte(value >> (8 * i));
    }
  }
  void real(float value) { word(std::bit_cast<std::uint32_t>(value)); }
  void text(std::string_view value) {
    bytes.insert(bytes.end(), value.begin(), value.end());
    byte(0);
  }
  void record(std::uint32_t id, std::uint32_t mask, const Writer& body, bool equipment = false) {
    word(id);
    byte(equipment ? 0xc4 : 0xcc);  // $601: header XOR 0xac; bit 3 includes equipment.
    byte(mask);
    byte(mask >> 8);
    byte(mask >> 16);
    bytes.insert(bytes.end(), body.bytes.begin(), body.bytes.end());
  }
};

void set_word(Bytes& bytes, std::size_t offset, std::uint32_t value) {
  for (unsigned i = 0; i < 4; ++i) {
    bytes.at(offset + i) = value >> (8 * i);
  }
}
void set_real(Bytes& bytes, std::size_t offset, float value) {
  set_word(bytes, offset, std::bit_cast<std::uint32_t>(value));
}
std::string player_name(const app::Garden& garden, const app::Room& room, sim::PlayerId id) {
  for (const auto& token : room.members) {
    if (const auto* m = garden.member(token); m && m->id == id) {
      return m->name;
    }
  }
  return "Flower";
}
std::uint8_t mob_type(sim::Mob mob, sim::Group group) {
  // $22's 216-byte catalog entries in the October Wasm, not the later schema.
  constexpr std::uint8_t types[]{4, 3, 5, 1, 12, 6, 19, 14, 7, 21, 11};
  if (group == sim::Group::ant_hole) {
    return 9;
  }
  const auto type = types[static_cast<std::size_t>(mob)];
  return group == sim::Group::segment && (type == 12 || type == 14) ? type + 1 : type;
}
}  // namespace

std::uint32_t GardenProjection::handle(const sim::EntityId& id) {
  const Key key{id.match.value, id.slot, id.generation};
  if (const auto found = handles_.find(key); found != handles_.end()) {
    return found->second;
  }
  std::uint32_t slot;
  if (!free_.empty()) {
    slot = free_.back();
    free_.pop_back();
  } else {
    if (next_slot_ >= 8192) {
      throw std::runtime_error("Garden projection entity limit");
    }
    slot = next_slot_++;
    if (generations_.size() <= slot) {
      generations_.resize(slot + 1, 1);
    }
  }
  const auto result = generations_[slot] * 8192 + slot;
  handles_.emplace(key, result);
  return result;
}

GardenSnapshot GardenProjection::build(const app::Garden& garden, const app::Member& viewer,
                                       std::chrono::steady_clock::time_point now) {
  GardenSnapshot result;
  Writer out;
  const auto* room = garden.room(viewer);
  std::optional<sim::MatchView> view;
  if (room && room->match) {
    view = room->match->view();
  }
  const auto match = view ? view->id.value : 0;
  if (match != match_) {
    hit_cursor_ = room ? room->hit_sequence : 0;
  }
  std::set<Key> live;
  if (view) {
    for (const auto& e : view->entities) {
      live.emplace(e.id.match.value, e.id.slot, e.id.generation);
    }
  }
  for (auto it = handles_.begin(); it != handles_.end();) {
    if (!live.contains(it->first)) {
      const auto cached = rendered_.find(it->first);
      if (view && match == match_ && cached != rendered_.end()) {
        auto& ghost = cached->second;
        if (!ghost.expires) {
          ghost.expires = now + std::chrono::milliseconds(400);
          ghost.record.at(ghost.flags_offset) |= 1;  // $597: native 150 ms fade and expansion.
        }
        if (now < *ghost.expires) {
          out.bytes.insert(out.bytes.end(), ghost.record.begin(), ghost.record.end());
          ++it;
          continue;
        }
      }
      const auto slot = it->second & 8191;
      result.removed.push_back(it->second);
      if (++generations_[slot] >= 524288) {
        throw std::runtime_error("Garden handle exhausted");
      }
      free_.push_back(slot);
      rendered_.erase(it->first);
      it = handles_.erase(it);
    } else {
      ++it;
    }
  }
  std::uint32_t controlled = 0;
  sim::Vec2 camera;
  if (view) {
    for (const auto& e : view->entities) {
      handle(e.id);
    }
    for (const auto& p : view->players) {
      if (p.id == viewer.id && p.body) {
        controlled = handle(*p.body);
        result.control = p.life;
      }
    }
    // Put bodies before profiles: references resolve in the original reader.
    for (const auto& e : view->entities) {
      const bool flower = e.group == sim::Group::player;
      Writer body;
      std::uint32_t mask = 1 | 0x400 | 0x1000 | 0x80000;
      body.byte(0);
      if (flower) {
        mask |= 0x20 | 0x100;
        body.byte(0);
        body.byte(0);
        body.byte(1);  // Level-one W2 guest, matching the profile.
        body.byte(0);
        const auto& owner =
            *std::ranges::find(view->players, e.owner->player, &sim::PlayerView::id);
        // $601/$55: sixteen (type vu, rarity byte) slots; active slots precede reserves.
        for (std::size_t slot = 0; slot < 16; ++slot) {
          if (slot < owner.loadout.size()) {
            body.integer(owner.loadout[slot] == sim::Petal::basic ? 1 : 5);
            body.byte(0);
          } else {
            body.integer(0);
          }
        }
        // $126/$998: u16 / 65535, 0 = broken, 1 = fully recharged.
        for (std::size_t slot = 0; slot < 8; ++slot) {
          const auto remaining = slot < owner.petals.size() ? owner.petals[slot].reload_ticks : 0;
          body.integer(static_cast<std::uint32_t>(
              65535 * (1 - std::min(1.0, double(remaining) / view->petal_reload))));
        }
        body.text(player_name(garden, *room, e.owner->player));
      }
      const auto angle = static_cast<std::uint16_t>(
          std::fmod((flower ? 0 : e.heading_rad) + 2 * std::numbers::pi, 2 * std::numbers::pi) *
          65536 / (2 * std::numbers::pi));
      body.byte(angle);
      body.byte(angle >> 8);
      body.real(e.position.x * world_scale);
      body.real(e.position.y * world_scale);
      body.real(e.radius * world_scale);
      if (e.petal) {
        mask |= 0x10000;
        body.integer(*e.petal == sim::Petal::basic ? 1 : 5);
        body.byte(static_cast<std::uint8_t>(e.rarity));
      }
      const auto flags_offset = body.bytes.size();
      body.byte(0);  // Generic render component ($592).
      if (e.mob || e.group == sim::Group::ant_hole) {
        mask |= 0x100000;
        body.byte(mob_type(e.mob.value_or(sim::Mob::baby_ant), e.group));
        body.byte(0);
        body.byte(static_cast<std::uint8_t>(e.rarity));
      }
      if (flower) {
        mask |= 0x200000;
        body.byte(0);
        body.byte(0);
        body.byte(static_cast<std::uint8_t>(255 * std::clamp(e.health / e.max_health, 0.0, 1.0)));
      }
      Writer record;
      record.record(handle(e.id), mask, body, flower);
      rendered_.insert_or_assign(Key{e.id.match.value, e.id.slot, e.id.generation},
                                 Rendered{record.bytes, 8 + flags_offset, e.max_health, {}});
      out.bytes.insert(out.bytes.end(), record.bytes.begin(), record.bytes.end());
      if (handle(e.id) == controlled) {
        camera = e.position;
      }
    }
  }
  Writer profile;
  profile.zeros(607);
  profile.bytes[0] = 1;  // Original $140 default level; W2 has no XP progression.
  // $991: profile +2264 is camera Y; +2376 is camera X (not wire order X/Y).
  set_real(profile.bytes, 283, camera.y * world_scale);
  set_real(profile.bytes, 314, 1);
  set_word(profile.bytes, 323, controlled);
  set_real(profile.bytes, 327, camera.x * world_scale);
  out.record(8193, 0x8000, profile);

  if (room && !view) {
    Writer roster;
    for (std::size_t i = 0; i < 4; ++i) {
      roster.text(i < room->members.size() ? garden.member(room->members[i])->name : "");
    }
    roster.zeros(21);
    roster.text(room->code);
    roster.zeros(84);
    for (std::size_t i = 0; i < 4; ++i) {
      roster.byte(i < room->members.size() ? 1 : 0);
    }
    out.record(8194, 0x200, roster);
    had_roster_ = true;
  } else if (had_roster_) {
    result.removed.push_back(8194);
    had_roster_ = false;
  }
  if (view) {
    Writer leaderboard;
    leaderboard.integer(view->players.size());
    leaderboard.zeros(61);
    out.record(8195, 8, leaderboard);
    Writer arena;
    arena.integer(static_cast<std::uint32_t>(view->arena_radius * 2 * world_scale));
    arena.integer(static_cast<std::uint32_t>(view->arena_radius * 2 * world_scale));
    arena.real(1);
    arena.byte(0);
    // 0x2000 is the singleton circular arena radius and RGB, not entity health.
    arena.real(view->arena_radius * world_scale);
    arena.byte(30);
    arena.byte(167);
    arena.byte(97);
    out.record(8196, 16 | 0x2000, arena);
    Writer wave;
    // $828 consumes two normalized bars. Local convention: elapsed deadline and clear progress.
    const double duration = view->wave.deadline_tick - view->wave.start_tick;
    wave.byte(static_cast<std::uint8_t>(
        255 * std::clamp(duration > 0 ? (view->next_tick - view->wave.start_tick) / duration : 0,
                         0.0, 1.0)));
    wave.integer(view->wave.number ? view->wave.number - 1 : 0);
    wave.integer(0);  // Garden biome index, not the alive count.
    std::array<std::uint32_t, 216> counts{};
    for (const auto& entity : view->entities) {
      if (entity.mob || entity.group == sim::Group::ant_hole) {
        ++counts[mob_type(entity.mob.value_or(sim::Mob::baby_ant), entity.group) * 6 +
                 static_cast<std::size_t>(entity.rarity)];
      }
    }
    for (const auto count : counts) {
      wave.integer(count);
    }
    const auto& c = view->wave.counts;
    wave.byte(c.planned ? static_cast<std::uint8_t>(
                              255.0 * (c.defeated + c.exhausted + c.cancelled) / c.planned)
                        : 0);
    out.record(8197, 2048, wave);
    had_world_ = true;
  } else if (had_world_) {
    result.removed.insert(result.removed.end(), {8195, 8196, 8197});
    had_world_ = false;
  }
  Writer commands;
  if (view && room) {
    for (const auto& hit : room->hits) {
      if (hit.sequence <= hit_cursor_) {
        continue;
      }
      const auto& e = hit.change.target;
      const Key key{e.match.value, e.slot, e.generation};
      const auto cached = rendered_.find(key);
      if (cached == rendered_.end()) {
        continue;  // Never flash an entity this socket has not seen.
      }
      commands.integer(1);   // $601: unsequenced command envelope, 0 terminates the list.
      commands.integer(32);  // $988 -> $51: native 150 ms hit flash.
      commands.word(handles_.at(key));
      commands.byte(static_cast<std::uint8_t>(
          std::clamp(255 * hit.change.amount / cached->second.max_health, 1.0, 255.0)));
    }
    hit_cursor_ = room->hit_sequence;
  }
  match_ = match;
  result.commands = std::move(commands.bytes);
  result.records = std::move(out.bytes);
  return result;
}

}  // namespace wave::wire
