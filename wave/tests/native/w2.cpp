#include "app/bootstrap_session.hpp"

#include <cstdlib>
#include <iostream>
#include <string_view>

namespace {

void check(bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    std::exit(1);
  }
}

wave::wire::Bytes bytes(std::string_view hex) {
  wave::wire::Bytes result;
  for (std::size_t i = 0; i < hex.size(); i += 2) {
    const auto nibble = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    result.push_back(static_cast<std::uint8_t>(nibble(hex[i]) * 16 + nibble(hex[i + 1])));
  }
  return result;
}

}  // namespace

int main() {
  using namespace wave;
  const std::string build = "b632797f0ee487dd99df460b13bde6d7ce5c9773";
  wire::Bytes hello{48};
  hello.insert(hello.end(), build.begin(), build.end());
  hello.insert(hello.end(), 2, 0);
  check(wire::is_hello(hello), "Captured build hello");
  auto truncated = hello;
  truncated.pop_back();
  check(!wire::is_hello(truncated), "Truncated build hello");
  auto wrong_build = hello;
  wrong_build[1] ^= 1;
  check(!wire::is_hello(wrong_build), "Wrong build hello");

  wire::Bootstrap connection;
  const auto ack = connection.receive({0x20, 0x1e, 0xb8});
  check(ack && std::holds_alternative<wire::WorldAck>(*ack) &&
            std::get<wire::WorldAck>(*ack).tick == 1,
        "First captured world acknowledgement");
  const auto second = connection.receive({0x37, 0x05, 0xa0});
  check(second && std::holds_alternative<wire::WorldAck>(*second) &&
            std::get<wire::WorldAck>(*second).tick == 2,
        "Second captured world acknowledgement");
  wire::Bootstrap independent;
  check(independent.receive({0x20, 0x1e, 0xb8}).has_value(), "Connection cipher isolation");
  check(!independent.receive(wire::Bytes(wire::max_frame_bytes + 1)), "Oversized frame");
  wire::Bootstrap bad;
  check(!bad.receive({0x20, 0x1e}), "Truncated acknowledgement");

  // Captured from the untouched October client with fixture User-Agent and locale.
  const auto startup_frame =
      bytes("1705b09d51ed3631dffbf0d0ea92040375425c94ca7554135a3a71f6e6439e7a"
            "02bb39b32ee351683424b43e63e0068cb5eedf2b93ff5760fe6f461e988bf5fb"
            "c8d27c798b356a80986380e42e7dabce056ddfd6eb84743db33ef0d775876f37"
            "80b9dcccf77a824e8692735b2fb90c4f7fdfe028232098598ac6d28dbdfab9b1"
            "9cf4288c50c1775b89");
  wire::Bootstrap login;
  check(login.receive({0x20, 0x1e, 0xb8}).has_value(), "ACK precedes startup commands");
  const auto startup = login.receive(startup_frame);
  check(startup && std::holds_alternative<wire::Startup>(*startup), "Captured startup batch");
  const auto& sequence = std::get<wire::Startup>(*startup);
  check(sequence.first_sequence == 1 && sequence.last_sequence == 3, "Startup sequence range");
  check(sequence.requests.size() == 3 &&
            std::holds_alternative<wire::Identify>(sequence.requests[1].action),
        "Preserve the original identification command for session admission");
  check(std::get<wire::Identify>(sequence.requests[1].action).agent == "Wave W2 fixture",
        "Decode the captured client agent without losing its value");
  wire::Bootstrap malformed;
  check(malformed.receive({0x20, 0x1e, 0xb8}).has_value(), "ACK before bad batch");
  auto short_frame = startup_frame;
  short_frame.pop_back();
  check(!malformed.receive(short_frame), "Startup blob truncated within declared length");

  app::BootstrapSession early_session("guest-early");
  const auto early = early_session.receive({0x20, 0x1e, 0xb8});
  check(early.close && early.frames == std::vector<wire::Bytes>{{0, 0}}, "Reject early ACK");
  app::BootstrapSession session("guest-test");
  const auto greeting = session.receive(hello);
  check(!greeting.close && greeting.frames.size() == 1, "Greet the archive build");
  check(greeting.frames.front() == bytes("29c6f693ae9ff0bb7480b345de"),
        "First world frame accepted by the original client");
  check(session.receive(hello).close, "Reject repeated hello");

  app::BootstrapSession guest("guest-test");
  check(!guest.receive(hello).close, "New connection after protocol error");
  check(!guest.receive({0x20, 0x1e, 0xb8}).close, "Accept current world ACK");
  const auto profile = guest.receive(startup_frame);
  check(!profile.close && profile.frames.size() == 4, "Guest ID, profile, and buffered ticks");
}
