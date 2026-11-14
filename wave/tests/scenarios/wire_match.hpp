#pragma once

#include "app/room_manager.hpp"
#include "catalog/catalog.hpp"
#include "scenarios/short_match.hpp"

#include <sstream>

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
            << ",\"state\":" << int(p.state) << ",\"connected\":" << p.connected;
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
            << ",\"group\":" << int(e.group)
            << ",\"owner\":" << (e.owner ? e.owner->player.value : 0) << ",\"x\":" << e.position.x
            << ",\"y\":" << e.position.y << ",\"radius\":" << e.radius << ",\"health\":" << e.health
            << '}';
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
