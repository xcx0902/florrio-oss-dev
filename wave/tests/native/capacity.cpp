#include "app/client_session.hpp"
#include "scenarios/wire_match.hpp"
#include <cstdlib>
#include <iostream>

namespace {
void check(bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    std::exit(1);
  }
}
}

int main() {
  using namespace wave;
  app::RoomLimits limits{4, 2, std::chrono::seconds(60)};
  app::RoomManager rooms(fixtures::wire_fixture_rules(), 1, {}, {}, sim::Biome::desert, limits);
  for (unsigned i = 1; i <= 1000; ++i) {
    auto& m = rooms.admit("", i);
    const auto token = m.token;
    rooms.disconnect(token, i);
    check(rooms.guest_count() <= limits.guests, "Guest churn stays bounded");
  }
  rooms.reap_disconnected(true);
  check(rooms.guest_count() == 0, "Disconnected lobby guests release admission capacity");
  auto& a = rooms.admit("", 1001);
  const auto token = a.token;
  const auto id = a.id;
  check(rooms.command(a, wire::Ready{true}, {}), "Reconnect fixture starts");
  rooms.step();
  const auto code = a.room;
  rooms.disconnect(token, 1001);
  rooms.reap_disconnected(true);
  check(rooms.member(token) && rooms.member(token)->room == code,
        "Pressure preserves match reconnect grace");
  check(rooms.admit(token, 1002).id == id, "Reconnect preserves player identity");
  rooms.disconnect(token, 1002);
  // A retained session pointer must survive even an expired reconnect grace.
  a.session_refs = 1;
  rooms.reap_disconnected(false, std::chrono::steady_clock::now() + std::chrono::minutes(2));
  check(rooms.member(token), "Session references pin a disconnected member");
  a.session_refs = 0;
  rooms.reap_disconnected(false, std::chrono::steady_clock::now() + std::chrono::minutes(2));
  check(!rooms.member(token) && rooms.rooms().empty(),
        "Expired disconnected matches and guests are reclaimed");
  for (unsigned i = 0; i < limits.guests; ++i) {
    rooms.admit("", 2000 + i);
  }
  bool denied = false;
  try {
    rooms.admit("", 3000);
  } catch (const std::runtime_error&) {
    denied = true;
  }
  check(denied && rooms.guest_count() == limits.guests,
        "Full capacity rejects without corrupting active guests");
  std::cout << "Guest churn, grace, session pinning and bounded admission passed\n";
}
