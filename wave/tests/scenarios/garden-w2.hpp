#pragma once

#include "app/garden.hpp"
#include "scenarios/garden-w1.hpp"

#include <sstream>

namespace wave::fixtures {

inline sim::Rules wire_garden_rules() {
  auto rules = short_garden_rules();
  rules.version = "w2-wire-fixture.1";
  rules.player.speed_per_second = 80;
  rules.orbit_radius = 8;
  rules.orbit_rad_per_second = 4;
  rules.petals[0].radius = 2;
  for (auto& mob : rules.mobs) {
    mob.body.contact_damage = 100;
  }
  for (auto& wave : rules.waves) {
    wave.deadline = 20000;
  }
  return rules;
}

inline std::string garden_state(const app::Garden& garden) {
  std::ostringstream out;
  out << "{\"steps\":" << garden.steps << ",\"acceptedInputs\":" << garden.accepted_inputs
      << ",\"rejectedInputs\":" << garden.rejected_inputs << ",\"rooms\":[";
  bool separator = false;
  for (const auto& [code, room] : garden.rooms()) {
    if (separator) {
      out << ',';
    }
    separator = true;
    out << "{\"code\":\"" << code << "\",\"members\":[";
    bool member_separator = false;
    for (const auto& token : room.members) {
      const auto* member = garden.member(token);
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
            << ",\"state\":" << int(p.state) << ",\"connected\":" << p.connected << '}';
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
  for (const auto& event : garden.trace) {
    if (const auto* t = std::get_if<sim::Transition>(&event.data)) {
      if (separator) {
        out << ',';
      }
      separator = true;
      out << "{\"tick\":" << event.tick << ",\"from\":" << t->from
          << ",\"to\":" << t->to.value_or(0) << ",\"reason\":" << int(t->reason) << '}';
    }
  }
  out << "]}";
  return out.str();
}

}  // namespace wave::fixtures
