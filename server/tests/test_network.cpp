#include "network_support.hpp"
using namespace florr::server;
using namespace florr::server::test;
namespace {
void health_origin_and_paths() {
  auto config = network_config();
  config.allowMissingOrigin = false;
  config.allowedOrigins = {"https://ui.test"};
  RunningServer server(config);
  REQUIRE(request(server.port).result() == http::status::ok);
  REQUIRE(request(server.port, "/readyz").body() == "{\"ready\":true}");
  REQUIRE(request(server.port, "/ws").result() == http::status::forbidden);
  REQUIRE(request(server.port, "/ws", "https://evil.test").result() == http::status::forbidden);
  REQUIRE(request(server.port, "/ws", "https://ui.test", true).result() == http::status::forbidden);
  REQUIRE(request(server.port, "/ws?token=bad", "https://ui.test").result() ==
          http::status::not_found);
  REQUIRE(request(server.port, "/debug").result() == http::status::not_found);
  Client allowed(server.port, "https://ui.test");
  allowed.join();
  REQUIRE(allowed.welcome.playerId == 1);
  REQUIRE(request(server.port, "/metrics").body().find("resumeToken") == std::string::npos);
}
void real_two_clients_input_and_chat() {
  RunningServer server;
  Client a(server.port), b(server.port);
  a.join();
  b.join();
  REQUIRE(a.welcome.playerId != b.welcome.playerId && a.welcome.roomEpoch == b.welcome.roomEpoch &&
          a.welcome.resumeToken != b.welcome.resumeToken);
  auto sa = a.spawn(), sb = b.spawn();
  REQUIRE(sa.controlledHandle != sb.controlledHandle);
  const auto roster =
      a.next<wire::Leaderboard>([](const auto& value) { return value.entries.size() == 2; });
  REQUIRE(roster.roomEpoch == a.welcome.roomEpoch);
  REQUIRE(roster.entries[0].playerId == a.welcome.playerId &&
          roster.entries[1].playerId == b.welcome.playerId);
  a.send(wire::Input{1, sa.selfState.lifeEpoch, sa.serverTick, 1, 0, 100});
  b.send(wire::Input{1, sb.selfState.lifeEpoch, sb.serverTick, 2, 3, 200});
  sa = a.next<wire::Snapshot>([](const auto& s) { return s.lastAppliedInputSeq == 1; });
  sb = b.next<wire::Snapshot>([](const auto& s) { return s.lastAppliedInputSeq == 1; });
  REQUIRE(sa.selfState.buttons == 1 && sb.selfState.buttons == 2 &&
          sa.controlledHandle != sb.controlledHandle);
  auto chat = command(2, wire::CommandKind::Chat);
  chat.text = "two real sockets";
  a.send(chat);
  const auto observed = b.next<wire::Snapshot>([](const auto& s) {
    return !s.events.empty() && s.events.back().kind == wire::EventKind::Chat;
  });
  REQUIRE(observed.events.back().actorPlayerId == a.welcome.playerId &&
          observed.events.back().text == chat.text);
  std::cout << "identities " << a.welcome.playerId << '/' << a.welcome.sessionEpoch << " and "
            << b.welcome.playerId << '/' << b.welcome.sessionEpoch << '\n';
}
void real_capacity_rooms_and_resume() {
  RunningServer server;
  Client a(server.port), b(server.port);
  a.join();
  b.join();
  a.spawn();
  Client full(server.port);
  full.send(hello(), 0);
  REQUIRE(full.next<wire::Error>().code == wire::ErrorCode::RoomFull);
  full.drain_close();
  Client other(server.port);
  other.join(hello("other"));
  REQUIRE(other.welcome.roomEpoch != a.welcome.roomEpoch);
  Client third(server.port);
  third.send(hello("third"), 0);
  REQUIRE(third.next<wire::Error>().code == wire::ErrorCode::RoomFull);
  auto resume = hello();
  resume.resumeToken = a.welcome.resumeToken;
  Client replacement(server.port);
  replacement.join(resume);
  REQUIRE(replacement.welcome.playerId == a.welcome.playerId &&
          replacement.welcome.sessionEpoch != a.welcome.sessionEpoch);
  const auto fresh = replacement.next<wire::Snapshot>();
  REQUIRE(fresh.full && fresh.snapshotSeq == 1 && fresh.controlledHandle);
  REQUIRE(a.next<wire::Error>().code == wire::ErrorCode::Session);
  a.drain_close();
  Client replay(server.port);
  replay.send(resume, 0);
  REQUIRE(replay.next<wire::Error>().code == wire::ErrorCode::Session);
  REQUIRE(server.metrics().players == 3 && server.metrics().resumes == 1);
}
void prehello_and_malformed_are_transactional() {
  RunningServer server;
  {
    Client c(server.port);
    c.send(wire::Input{1, 1, 0, 0, 0, 0}, 7);
    REQUIRE(c.next<wire::Error>().code == wire::ErrorCode::Protocol);
    c.drain_close();
  }
  {
    Client c(server.port);
    c.socket.text(true);
    c.socket.write(asio::buffer(std::string("debug teleport")));
    c.socket.binary(true);
    REQUIRE(c.next<wire::Error>().code == wire::ErrorCode::Protocol);
    c.drain_close();
  }
  {
    Client c(server.port);
    const Bytes bad(20, 0);
    c.socket.write(asio::buffer(bad));
    REQUIRE(c.next<wire::Error>().code == wire::ErrorCode::Protocol);
    c.drain_close();
  }
  {
    Client c(server.port);
    auto value = hello();
    value.catalogHash = std::string(64, '0');
    c.send(value, 0);
    REQUIRE(c.next<wire::Error>().code == wire::ErrorCode::Catalog);
    c.drain_close();
  }
  REQUIRE(server.metrics().players == 0 && server.metrics().rooms == 0);
  Client healthy(server.port);
  healthy.join();
  auto snapshot = healthy.spawn();
  auto bad = *wire::encode_message(wire::Input{1, 1, snapshot.serverTick, 0, 0, 0},
                                   healthy.welcome.sessionEpoch);
  // Input buttons start after inputSeq/lifeEpoch/targetTick; unknown bits fail
  // before any received/applied sequence or domain state can change.
  bad[28] = 4;
  healthy.socket.write(asio::buffer(bad));
  REQUIRE(healthy.next<wire::Error>().code == wire::ErrorCode::Protocol);
}
void message_limit_and_handshake_deadlines() {
  auto config = network_config();
  config.httpTimeoutMs = 40;
  config.helloTimeoutMs = 40;
  RunningServer server(config);
  {
    asio::io_context io;
    tcp::socket socket(io);
    socket.connect({asio::ip::make_address("127.0.0.1"), server.port});
    std::array<char, 8> data{};
    Error ec;
    (void)socket.read_some(asio::buffer(data), ec);
    REQUIRE(ec);
  }
  {
    Client silent(server.port);
    silent.drain_close();
  }
  {
    Client large(server.port);
    Bytes bytes(4097, 0);
    Error ec;
    large.socket.write(asio::buffer(bytes), ec);
    large.drain_close();
  }
  REQUIRE(server.metrics().players == 0 && server.metrics().teardowns == 3);
}
void connection_and_pending_limits() {
  auto config = network_config();
  config.maxPendingHandshakes = 1;
  config.maxConnections = 2;
  config.httpTimeoutMs = 1000;
  RunningServer server(config);
  asio::io_context io;
  tcp::socket pending(io);
  pending.connect({asio::ip::make_address("127.0.0.1"), server.port});
  // Ensure the first accept has run before testing the bound.
  server.after(5);
  tcp::socket refused(io);
  refused.connect({asio::ip::make_address("127.0.0.1"), server.port});
  std::array<char, 1> bytes{};
  Error ec;
  (void)refused.read_some(asio::buffer(bytes), ec);
  REQUIRE(ec);
  REQUIRE(server.metrics().rejected == 1);
  pending.close();
  server.after(5);
  Client a(server.port);
  a.join();
  Client b(server.port);
  b.join();
  tcp::socket third(io);
  third.connect({asio::ip::make_address("127.0.0.1"), server.port});
  (void)third.read_some(asio::buffer(bytes), ec);
  REQUIRE(ec);
  REQUIRE(server.metrics().connections == 2 && server.metrics().pending == 0);
}
void wall_clock_heartbeat() {
  auto config = network_config();
  config.pingIntervalMs = 60;
  config.pongTimeoutMs = 180;
  RunningServer server(config);
  Client c(server.port);
  c.join();
  // Send no binary Pong. Snapshots and WebSocket control frames cannot renew it.
  Error ec;
  for (unsigned i = 0; i < 100 && !ec; ++i) {
    beast::flat_buffer buffer;
    c.socket.read(buffer, ec);
  }
  REQUIRE(ec);
  server.after(5);
  REQUIRE(server.metrics().teardowns == 1);
}
void graceful_stop_is_bounded_and_once() {
  RunningServer server;
  Client c(server.port);
  c.join();
  c.spawn();
  server.call([&] {
    server.server.stop();
    server.server.stop();
  });
  REQUIRE(c.next<wire::Error>().code == wire::ErrorCode::Stopping);
  c.drain_close();
  server.stop();
  REQUIRE(server.server.metrics().connections == 0 && server.server.metrics().players == 0 &&
          server.server.metrics().teardowns == 1);
}
}
int main() {
  const std::pair<const char*, void (*)()> tests[] = {
      {"health_origin_and_paths", health_origin_and_paths},
      {"real_two_clients_input_and_chat", real_two_clients_input_and_chat},
      {"real_capacity_rooms_and_resume", real_capacity_rooms_and_resume},
      {"prehello_and_malformed_are_transactional", prehello_and_malformed_are_transactional},
      {"message_limit_and_handshake_deadlines", message_limit_and_handshake_deadlines},
      {"connection_and_pending_limits", connection_and_pending_limits},
      {"wall_clock_heartbeat", wall_clock_heartbeat},
      {"graceful_stop_is_bounded_and_once", graceful_stop_is_bounded_and_once}};
  unsigned i = 0;
  for (const auto& [name, run] : tests) {
    run();
    std::cout << "ok " << ++i << " - " << name << std::endl;
  }
  std::cout << "1.." << i << '\n';
}
