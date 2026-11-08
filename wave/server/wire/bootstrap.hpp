#pragma once

#include <array>
#include <utility>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace wave::wire {

using Bytes = std::vector<std::uint8_t>;
inline constexpr std::size_t max_frame_bytes = 4096;

struct Identify {
  std::string agent;
  std::string token;
  std::string locale;
};
struct Nickname {
  std::string value;
};
struct CreateSquad {
  bool private_room;
};
struct Ready {
  bool value;
};
struct JoinSquad {
  std::string code;
};
struct Move {
  std::uint32_t buttons;
  float angle;
  float strength;
};
struct Leave {};
// October $436 and $939/$997; zero kinds omit the rarity byte.
struct Craft {
  bool all;
  std::uint64_t keep;
  std::uint32_t kind;
  std::uint8_t rarity;
};
struct Equip {
  std::array<std::pair<std::uint32_t, std::uint8_t>, 16> slots{};
};
struct Swap {
  std::uint8_t first, second;
  std::pair<std::uint32_t, std::uint8_t> first_item, second_item;
};

using ReliableAction = std::variant<std::monostate, Identify, Nickname, CreateSquad, Ready,
                                    JoinSquad, Move, Leave, Craft, Equip, Swap>;
struct ReliableRequest {
  std::uint32_t sequence;
  ReliableAction action;
};
struct Startup {
  std::uint32_t first_sequence;
  std::uint32_t last_sequence;
  std::vector<ReliableRequest> requests;
};

struct WorldAck {
  std::uint32_t tick;
};

using Command = std::variant<Startup, WorldAck>;

bool is_hello(std::span<const std::uint8_t> bytes);
std::optional<std::string> hello_guest(std::span<const std::uint8_t> bytes);

class Bootstrap {
 public:
  std::optional<Command> receive(Bytes bytes);
  Bytes guest_id(std::string_view id);
  Bytes world(std::uint32_t tick, std::uint32_t acknowledged_request, bool initial_profile = false);
  Bytes snapshot(std::uint32_t tick, std::uint32_t acknowledged_request,
                 std::span<const std::uint8_t> records, std::span<const std::uint32_t> removed = {},
                 std::span<const std::uint8_t> commands = {});
  Bytes disconnect();

 private:
  std::uint32_t client_state_ = 0x99df460b;
  std::uint32_t server_state_ = 0x13bde6d7;
};

}  // namespace wave::wire
