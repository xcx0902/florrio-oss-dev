#pragma once
#include "florr/server/room_manager.hpp"
#include <cstdlib>
#include <iostream>

#define REQUIRE(x)                                              \
  do {                                                          \
    if (!(x)) {                                                 \
      std::cerr << __func__ << ':' << __LINE__ << ": " #x "\n"; \
      std::exit(1);                                             \
    }                                                           \
  } while (false)
namespace florr::server::test {
struct Recorder {
  std::vector<wire::Message> messages;
  std::vector<wire::ErrorCode> errors;
  std::shared_ptr<Session> session;
  void create(ConnectionId id, const Config& c, Metrics& m, std::uint64_t now = 0) {
    session = std::make_shared<Session>(
        id, c, m,
        PeerSink{[this](Bytes bytes) {
                   auto v = wire::decode_message(bytes, false);
                   REQUIRE(v);
                   messages.push_back(std::move(*v));
                   return true;
                 },
                 [this](wire::ErrorCode code, std::string_view) { errors.push_back(code); }},
        now);
  }
  template <class T>
  const T& last() const {
    for (auto it = messages.rbegin(); it != messages.rend(); ++it) {
      if (auto* value = std::get_if<T>(&it->value)) {
        return *value;
      }
    }
    REQUIRE(false);
    std::abort();
  }
  template <class T>
  std::size_t count() const {
    return std::count_if(messages.begin(), messages.end(),
                         [](const auto& m) { return std::holds_alternative<T>(m.value); });
  }
  template <class T>
  void receive(T v, std::uint64_t now = 0) {
    session->receive({session->epoch(), std::move(v)}, now);
  }
};
inline wire::Hello hello(std::string room = "room", std::string nick = "same") {
  return {2, std::string(wire::kCatalogHash), std::move(room), std::move(nick), {}};
}
inline wire::Command command(unsigned sequence, wire::CommandKind kind, unsigned life = 0) {
  wire::Command c;
  c.commandSeq = sequence;
  c.kind = kind;
  c.lifeEpoch = life;
  if (kind == wire::CommandKind::Spawn) {
    c.text = "same";
  }
  return c;
}
struct Harness {
  Config config;
  Metrics metrics;
  RoomManager rooms;
  std::uint64_t now = 0;
  Harness() : rooms(config, metrics, {.populate = false, .handle_seed = 37}) {}
  void join(Recorder& r, ConnectionId id, wire::Hello h = hello()) {
    r.create(id, config, metrics, now);
    rooms.hello(r.session, std::move(h));
  }
  void step(unsigned count = 1) {
    for (unsigned i = 0; i < count; ++i) {
      now += 50;
      rooms.tick(now);
    }
  }
  const engine::World& world(std::string_view id = "room") const {
    const auto* r = rooms.find(id);
    REQUIRE(r);
    return r->world();
  }
  void spawn(Recorder& r, unsigned seq = 1, unsigned life = 0) {
    r.receive(command(seq, wire::CommandKind::Spawn, life), now);
  }
};
}  // namespace florr::server::test
