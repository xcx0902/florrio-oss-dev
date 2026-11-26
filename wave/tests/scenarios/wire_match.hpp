#pragma once

#include "app/room_manager.hpp"
#include "catalog/catalog.hpp"
#include "scenarios/short_match.hpp"

#include <sstream>

namespace wave::sim {
// Compiled only into the acceptance host. Real hosts expose no fixture commands.
struct FixtureAccess {
  static bool scenario(Match& match, std::string_view action, PlayerId id) {
    auto* p = match.player(id);
    if (!p || !p->view.body) {
      return false;
    }
    auto* body = match.entities_.get(*p->view.body);
    if (!body) {
      return false;
    }
    if (action == "hole" || action == "fire") {
      (void)match.spawn_mob(action == "fire" ? Mob::fire_ant_burrow : Mob::ant_hole, Rarity::rare,
                            body->view.position + Vec2{85, 0}, Group::main_mob, {},
                            match.wave_.number);
    } else if (action == "clear") {
      const auto source = match.damage_source(*body);
      std::vector<EntityId> targets;
      for (const auto slot : match.entities_.active()) {
        const auto& e = match.entities_.at(slot).view;
        if (e.area == p->view.area && e.faction == Faction::hostile && e.mob) {
          targets.push_back(e.id);
        }
      }
      for (const auto target : targets) {
        (void)match.apply_health(target, source, HealthKind::contact, 1e12);
      }
    } else if (action == "timeout") {
      for (auto& h : match.ant_holes_) {
        if (h.area == p->view.area) {
          h.deadline_tick = match.tick_ + 1;
        }
      }
    } else if (action == "duel") {
      if (match.rules_.mode != Mode::pvp) {
        return false;
      }
      unsigned n = 0;
      for (auto& participant : match.players_) {
        if (!participant.view.body) {
          continue;
        }
        auto* flower = match.entities_.get(*participant.view.body);
        if (!flower) {
          continue;
        }
        flower->view.position = Vec2{n ? 26.0 : 0.0, 0};
        flower->view.health = n ? 1 : flower->view.max_health;
        participant.move = {};
        participant.attack = participant.defend = false;
        participant.view.score = n ? 300 : 10;
        ++n;
      }
      for (const auto slot : match.entities_.active()) {
        auto& e = match.entities_.at(slot);
        if (e.view.faction == Faction::hostile) {
          e.view.position = {0, 200};
        }
      }
    } else {
      return false;
    }
    return true;
  }
};
}  // namespace wave::sim

namespace wave::fixtures {

inline sim::Rules wire_fixture_rules() {
  using namespace sim;
  // Fixed encounters keep the original client death and survivor tests reproducible.
  static const auto mobs = [] {
    const auto source = catalog::dated().mobs;
    std::vector result(source.begin(), source.end());
    for (auto& mob : result) {
      if (mob.rarity != Rarity::common || (mob.kind != Mob::bee && mob.kind != Mob::ladybug)) {
        continue;
      }
      mob.body.health = 10;
      mob.body.speed_per_second = 0;
      mob.body.contact_damage = 100;
      mob.ai = catalog::MobAI::stationary;
    }
    return result;
  }();
  static const auto petals = [] {
    const auto source = catalog::dated().petals;
    std::vector result(source.begin(), source.end());
    for (auto& petal : result) {
      if (petal.kind == Petal::basic && petal.rarity == Rarity::common) {
        // Observe the full break/recharge cycle in a few manual steps.
        petal.reload_seconds = .05;
        petal.mechanics.attack_distance = 15;
      }
      if (petal.kind == Petal::rose && petal.rarity == Rarity::common) {
        petal.body.contact_damage = 0;
      }
    }
    return result;
  }();
  static const catalog::Catalog definitions{
      .version = "wire-fixture.1", .petals = petals, .mobs = mobs};
  auto rules = short_match_rules(definitions);
  rules.version = "w2-wire-fixture.1";
  rules.player.speed_per_second = 80;
  rules.orbit_radius = 10;
  rules.orbit_rad_per_second = 4;
  for (auto& wave : rules.waves) {
    wave.deadline = 20000;
  }
  return rules;
}

inline std::string fixture_state(const app::RoomManager& rooms) {
  std::ostringstream out;
  out << "{\"steps\":" << rooms.steps << ",\"acceptedInputs\":" << rooms.accepted_inputs
      << ",\"rejectedInputs\":" << rooms.rejected_inputs << ",\"rooms\":[";
  bool separator = false;
  for (const auto& [code, room] : rooms.rooms()) {
    if (separator) {
      out << ',';
    }
    separator = true;
    out << "{\"code\":\"" << code << "\",\"members\":[";
    bool member_separator = false;
    for (const auto& token : room.members) {
      const auto* member = rooms.member(token);
      if (member_separator) {
        out << ',';
      }
      member_separator = true;
      // User nicknames and bearer tokens are intentionally absent from telemetry.
      out << "{\"id\":" << member->id.value << ",\"ready\":" << member->ready
          << ",\"connected\":" << member->connected << '}';
    }
    out << ']';
    if (room.match) {
      const auto view = room.match->view();
      out << ",\"match\":" << view.id.value << ",\"tick\":" << view.next_tick
          << ",\"mode\":" << int(view.mode) << ",\"arenaRadius\":" << view.arena_radius
          << ",\"phase\":" << int(view.phase) << ",\"wave\":" << view.wave.number
          << ",\"deadlineTick\":" << view.wave.deadline_tick
          << ",\"pending\":" << view.wave.counts.pending
          << ",\"spawned\":" << view.wave.counts.spawned
          << ",\"defeated\":" << view.wave.counts.defeated << ",\"players\":[";
      bool item_separator = false;
      for (const auto& p : view.players) {
        if (item_separator) {
          out << ',';
        }
        item_separator = true;
        out << "{\"id\":" << p.id.value << ",\"life\":" << p.life.generation
            << ",\"area\":" << p.area << ",\"score\":" << p.score << ",\"state\":" << int(p.state)
            << ",\"connected\":" << p.connected;
        if (p.death_position) {
          out << ",\"deathX\":" << p.death_position->x << ",\"deathY\":" << p.death_position->y;
        }
        if (p.killer) {
          out << ",\"killerId\":" << catalog::client_mob(p.killer->kind, p.killer->rarity).value();
        }
        out << '}';
      }
      out << "],\"entities\":[";
      item_separator = false;
      for (const auto& e : view.entities) {
        if (item_separator) {
          out << ',';
        }
        item_separator = true;
        out << "{\"slot\":" << e.id.slot << ",\"generation\":" << e.id.generation
            << ",\"area\":" << e.area << ",\"mob\":" << (e.mob ? int(*e.mob) : -1)
            << ",\"group\":" << int(e.group)
            << ",\"owner\":" << (e.owner ? e.owner->player.value : 0) << ",\"x\":" << e.position.x
            << ",\"y\":" << e.position.y << ",\"radius\":" << e.radius << ",\"health\":" << e.health
            << '}';
      }
      out << "],\"antHoles\":[";
      item_separator = false;
      for (const auto& h : view.ant_holes) {
        if (item_separator) {
          out << ',';
        }
        item_separator = true;
        out << "{\"area\":" << h.area << ",\"x\":" << h.position.x << ",\"y\":" << h.position.y
            << ",\"radius\":" << h.radius << ",\"deadline\":" << h.deadline_tick << '}';
      }
      out << "],\"drops\":[";
      item_separator = false;
      for (const auto& drop : room.drops) {
        if (item_separator) {
          out << ',';
        }
        item_separator = true;
        out << "{\"area\":" << drop.area << ",\"kind\":" << drop.item.kind
            << ",\"rarity\":" << unsigned(drop.item.rarity) << ",\"x\":" << drop.position.x
            << ",\"y\":" << drop.position.y << '}';
      }
      out << ']';
    }
    out << '}';
  }
  out << "],\"transitions\":[";
  separator = false;
  for (const auto& [tick, transition] : rooms.transitions) {
    if (separator) {
      out << ',';
    }
    separator = true;
    out << "{\"tick\":" << tick << ",\"from\":" << transition.from
        << ",\"to\":" << transition.to.value_or(0) << ",\"reason\":" << int(transition.reason)
        << '}';
  }
  out << "]}";
  return out.str();
}

}  // namespace wave::fixtures
