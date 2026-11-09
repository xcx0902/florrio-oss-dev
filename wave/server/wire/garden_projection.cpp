#include "wire/garden_projection.hpp"
#include "catalog/catalog.hpp"

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
constexpr std::array<std::array<std::uint8_t, 3>, 3> biome_colors{
    {{30, 167, 97}, {211, 173, 105}, {53, 140, 195}}};

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
std::uint8_t mob_type(sim::Mob mob, sim::Group group, sim::Rarity rarity = sim::Rarity::common) {
  const auto mapped = catalog::client_mob(mob, rarity, group);
  if (!mapped) {
    throw std::logic_error("Mob missing from dated client registry");
  }
  return static_cast<std::uint8_t>(*mapped);
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
    arc_cursor_ = room ? room->arc_sequence : 0;
  }
  std::set<Key> live;
  const auto visible = [](const sim::EntityView& e) {
    const auto* p = e.petal ? catalog::dated().petal(*e.petal, e.rarity) : nullptr;
    return !p || !p->mechanics.hidden;
  };
  std::vector<const app::Room::Drop*> drops;
  if (view && room) {
    for (const auto& drop : room->drops) {
      drops.push_back(&drop);
    }
    // Keep the nearest drops in the old client's bounded entity table.
    constexpr std::size_t drop_limit = 512;
    if (drops.size() > drop_limit) {
      const auto player = std::ranges::find(view->players, viewer.id, &sim::PlayerView::id);
      const auto flower = player != view->players.end() && player->body
                              ? std::ranges::find(view->entities, *player->body, &sim::EntityView::id)
                              : view->entities.end();
      const auto at = flower == view->entities.end() ? sim::Vec2{} : flower->position;
      std::ranges::partial_sort(drops, drops.begin() + drop_limit, {}, [&](const auto* drop) {
        return std::pair{(drop->position - at).length(), drop->serial};
      });
      drops.resize(drop_limit);
    }
    for (const auto* drop : drops) {
      live.emplace(match, UINT32_MAX, drop->serial);
    }
  }
  if (view) {
    for (const auto& e : view->entities) {
      if (!visible(e)) {
        continue;
      }
      live.emplace(e.id.match.value, e.id.slot, e.id.generation);
    }
  }
  for (auto it = handles_.begin(); it != handles_.end();) {
    if (!live.contains(it->first)) {
      const auto cached = rendered_.find(it->first);
      if (view && match == match_ && cached != rendered_.end() && cached->second.fade_on_remove) {
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
      if (!visible(e)) {
        continue;
      }
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
      if (!visible(e)) {
        continue;
      }
      const bool flower = e.group == sim::Group::player;
      Writer body;
      std::uint32_t mask = 1 | 0x400 | 0x1000 | 0x80000;
      body.byte(0);
      if (flower) {
        mask |= 0x20 | 0x100;
        body.byte(0);
        body.byte(0);
        const auto member_it = std::ranges::find_if(room->members, [&](const auto& token) {
          return garden.member(token)->id == e.owner->player;
        });
        const auto* member = member_it == room->members.end() ? nullptr : garden.member(*member_it);
        body.byte(member && member->profile ? std::min(255u, member->profile->level) : 1);
        body.byte(0);
        const auto& owner =
            *std::ranges::find(view->players, e.owner->player, &sim::PlayerView::id);
        // $601/$55: sixteen (type vu, rarity byte) slots; active slots precede reserves.
        for (std::size_t slot = 0; slot < 16; ++slot) {
          const auto count = member && member->profile
                                 ? store::unlocked_main_slots(member->profile->level)
                                 : owner.loadout.size();
          const auto stored = slot < count ? slot : 8 + slot - count;
          if (member && member->profile && slot < 2 * count && member->profile->slots[stored]) {
            const auto item = *member->profile->slots[stored];
            body.integer(item.kind);
            body.byte(item.rarity);
          } else if (!(member && member->profile) && slot < owner.loadout.size()) {
            body.integer(catalog::client_petal(owner.loadout[slot]).value_or(0));
            if (owner.loadout[slot] != sim::Petal::none) {
              body.byte(slot < owner.loadout_rarities.size()
                            ? catalog::client_rarity(owner.loadout_rarities[slot])
                            : 0);
            }
          } else {
            body.integer(0);
          }
        }
        // $126/$998: u16 / 65535, 0 = broken, 1 = fully recharged.
        for (std::size_t slot = 0; slot < 8; ++slot) {
          const auto remaining = slot < owner.petals.size() ? owner.petals[slot].reload_ticks : 0;
          const auto total = slot < owner.petals.size() && owner.petals[slot].reload_total_ticks
                                 ? owner.petals[slot].reload_total_ticks
                                 : view->petal_reload;
          body.integer(static_cast<std::uint32_t>(
              65535 * (1 - std::min(1.0, double(remaining) / std::max<sim::Tick>(1, total)))));
        }
        body.text(player_name(garden, *room, e.owner->player));
      }
      const auto angle = static_cast<std::uint16_t>(
          std::fmod((flower ? 0 : e.heading_rad) + 2 * std::numbers::pi, 2 * std::numbers::pi) *
          65536 / (2 * std::numbers::pi));
      body.byte(angle);
      body.byte(angle >> 8);
      const auto position_offset = body.bytes.size();
      body.real(e.position.x * world_scale);
      body.real(e.position.y * world_scale);
      body.real(e.radius * world_scale);
      if (e.split_particle) {
        // $597 renders 0x4000 as one seed; bit 0 selects the Grapes palette.
        mask |= 0x4000;
        body.byte(e.petal == sim::Petal::grapes ? 1 : 0);
      } else if (e.petal) {
        mask |= 0x10000;
        body.integer(catalog::client_petal(*e.petal, e.rarity).value_or(0));
        body.byte(static_cast<std::uint8_t>(e.rarity));
      }
      const auto flags_offset = body.bytes.size();
      body.byte(0);  // Generic render component ($592).
      if (e.mob || e.group == sim::Group::ant_hole) {
        mask |= 0x100000;
        body.byte(mob_type(e.mob.value_or(sim::Mob::baby_ant), e.group, e.rarity));
        body.byte(e.faction == sim::Faction::team ? 1 : 0);  // Native yellow ally palette.
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
      const Key key{e.id.match.value, e.id.slot, e.id.generation};
      if (e.petal && e.anchor && !rendered_.contains(key)) {
        // $601 snaps all first-frame poses, including duplicate records.
        // Establish the flower center for one broadcast; the next orbit pose
        // then uses $973/$41's native interpolation on the drawn petal.
        const auto anchor = std::ranges::find(view->entities, *e.anchor, &sim::EntityView::id);
        if (anchor == view->entities.end()) {
          throw std::runtime_error("Garden petal anchor missing");
        }
        set_real(record.bytes, 8 + position_offset, anchor->position.x * world_scale);
        set_real(record.bytes, 12 + position_offset, anchor->position.y * world_scale);
      }
      const bool fade = !e.petal || (e.anchor && e.petal != sim::Petal::peas &&
                                     e.petal != sim::Petal::grapes);
      rendered_.insert_or_assign(key,
                                 Rendered{record.bytes, 8 + flags_offset, e.max_health, fade, {}});
      out.bytes.insert(out.bytes.end(), record.bytes.begin(), record.bytes.end());
      if (handle(e.id) == controlled) {
        camera = e.position;
      }
    }
    for (const auto* drop : drops) {
      Writer body;
      body.byte(0);
      body.zeros(2);  // Heading.
      body.real(drop->position.x * world_scale);
      body.real(drop->position.y * world_scale);
      body.real(16);
      body.byte(0);  // Generic render flags.
      body.byte(0);  // Ground item, not in the pickup animation.
      body.integer(0);
      body.integer(drop->item.kind);
      body.byte(drop->item.rarity);
      out.record(handle({view->id, UINT32_MAX, drop->serial}),
                 1 | 0x400 | 0x1000 | 0x80000 | 0x400000, body);
    }
  }
  Writer profile;
  const auto* saved = viewer.profile ? &*viewer.profile : nullptr;
  profile.byte(saved ? std::min(255u, saved->level) : 1);
  profile.byte(saved ? 10 : 0);  // $2350/$2348: economic cache + authoritative level/XP.
  // The first 276 values are legacy craft counters; fresh post-Oct-20 rolls are independent.
  for (unsigned i = 0; i < 276; ++i) {
    profile.integer(0);
  }
  for (unsigned i = 0; i < 4; ++i) {
    profile.integer(0);
  }
  profile.text("");
  profile.real(camera.y * world_scale);
  std::array<std::uint8_t, 27> gallery{};  // $3750: 216 mob-kind/rarity discovery bits.
  if (saved) {
    for (const auto item : saved->discoveries) {
      const auto bit = item.kind * 6 + item.rarity;
      if (bit < gallery.size() * 8) {
        gallery[bit / 8] |= 1u << (bit % 8);
      }
    }
  }
  for (const auto byte : gallery) {
    profile.byte(byte);
  }
  const auto player = view ? std::ranges::find(view->players, viewer.id, &sim::PlayerView::id)
                           : std::vector<sim::PlayerView>::const_iterator{};
  // $601 -> profile+2316; $3384 uses 1920/scale and 1080/scale for the view bounds.
  profile.real(view && player != view->players.end() ? 1 / player->vision_multiplier : 1);
  profile.text("");
  profile.real(0);
  profile.word(controlled);
  profile.real(camera.x * world_scale);
  for (unsigned kind = 0; kind < 46; ++kind) {
    for (unsigned rarity = 0; rarity < 6; ++rarity) {
      const auto it = saved ? saved->inventory.find({kind, static_cast<std::uint8_t>(rarity)})
                            : store::Inventory::const_iterator{};
      const auto count = saved && it != saved->inventory.end() ? it->second : 0;
      profile.integer(static_cast<std::uint32_t>(std::min<std::uint64_t>(count, UINT32_MAX)));
    }
  }
  if (saved) {
    const auto thresholds = catalog::xp_thresholds();
    const auto level = std::min<std::size_t>(saved->level, thresholds.size());
    std::uint32_t fraction = 0;
    if (level && level < thresholds.size()) {
      const auto low = thresholds[level - 1], high = thresholds[level];
      fraction = static_cast<std::uint32_t>(
          65535.0 * std::clamp(double(saved->xp - low) / double(high - low), 0.0, 1.0));
    }
    profile.integer(fraction);
  }
  out.record(8193, 0x8000, profile, saved != nullptr);

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
    for (const auto channel : biome_colors[static_cast<unsigned>(view->biome)]) {
      arena.byte(channel);
    }
    out.record(8196, 16 | 0x2000, arena);
    Writer wave;
    // $828 overlays the red clearing timer on the blue spawning bar.
    // Do not start red while any scheduled spawn is still pending.
    double clearing = 0;
    if (view->wave.spawn_complete_tick) {
      const auto start = *view->wave.spawn_complete_tick;
      const double duration = view->wave.deadline_tick - start;
      const auto tick = view->next_tick ? view->next_tick - 1 : 0;
      clearing = duration > 0 ? (tick - start) / duration : 1;
    }
    wave.byte(static_cast<std::uint8_t>(255 * std::clamp(clearing, 0.0, 1.0)));
    wave.integer(view->wave.number ? view->wave.number - 1 : 0);
    wave.integer(static_cast<unsigned>(view->biome));
    std::array<std::uint32_t, 216> counts{};
    for (const auto& entity : view->entities) {
      if (entity.faction == sim::Faction::garden &&
          (entity.mob || entity.group == sim::Group::ant_hole)) {
        ++counts[mob_type(entity.mob.value_or(sim::Mob::baby_ant), entity.group, entity.rarity) *
                     6 +
                 static_cast<std::size_t>(entity.rarity)];
      }
    }
    for (const auto count : counts) {
      wave.integer(count);
    }
    const auto& c = view->wave.counts;
    wave.byte(c.planned ? static_cast<std::uint8_t>(255.0 * (c.planned - c.pending) / c.planned)
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
    for (const auto& arc : room->arcs) {
      if (arc.sequence <= arc_cursor_) {
        continue;
      }
      commands.integer(1);
      commands.integer(33);  // $988: native lightning between two f32 world points.
      commands.real(arc.effect.from.x * world_scale);
      commands.real(arc.effect.from.y * world_scale);
      commands.real(arc.effect.to.x * world_scale);
      commands.real(arc.effect.to.y * world_scale);
    }
    arc_cursor_ = room->arc_sequence;
  }
  match_ = match;
  result.commands = std::move(commands.bytes);
  result.records = std::move(out.bytes);
  return result;
}

}  // namespace wave::wire
