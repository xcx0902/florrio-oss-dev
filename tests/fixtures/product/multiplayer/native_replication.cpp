#include "engine/net/peer_session.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/loot.hpp"
#include "../../../../engine/tests/support/multiplayer.hpp"
#include <fstream>
#include <iostream>
using namespace engine;
using namespace engine::net;
namespace {
ViewerContext context(PlayerId player, unsigned session = 7, bool dense = true) {
  RoomEpoch room{};
  room[0] = 23;
  return {player, room, session, dense};
}
Welcome welcome(PlayerId player, unsigned session = 7) {
  Welcome w;
  w.roomId = "fixture";
  w.roomEpoch = context(player).roomEpoch;
  w.playerId = player.raw;
  w.sessionEpoch = session;
  w.tickMs = 50;
  w.resumeToken[0] = session;
  return w;
}
}
int main(int argc, char** argv) {
  if (argc == 4 && std::string_view(argv[1]) == "--decode") {
    std::string hex = argv[3];
    if (hex.size() % 2) {
      return 2;
    }
    std::vector<std::uint8_t> bytes;
    for (std::size_t i = 0; i < hex.size(); i += 2) {
      unsigned value = 0;
      for (unsigned j = 0; j < 2; j++) {
        const char c = hex[i + j];
        if (c >= '0' && c <= '9') {
          value = value * 16 + c - '0';
        } else if (c >= 'a' && c <= 'f') {
          value = value * 16 + c - 'a' + 10;
        } else {
          return 2;
        }
      }
      bytes.push_back(value);
    }
    const auto m = decode_message(bytes, std::string_view(argv[2]) == "client");
    if (!m) {
      return 1;
    }
    const auto roundtrip =
        std::visit([&](const auto& v) { return encode_message(v, m->sessionEpoch); }, m->value);
    if (!roundtrip) {
      return 1;
    }
    const char* digits = "0123456789abcdef";
    for (auto b : *roundtrip) {
      std::cout << digits[b >> 4] << digits[b & 15];
    }
    std::cout << '\n';
    return 0;
  }
  if (argc != 2) {
    return 2;
  }
  auto world = test::make_world();
  const auto a = test::join_player(*world, "Alice", {f32(-200), {}}),
             b = test::join_player(*world, "Bob", {f32(200), {}});
  auto* pa = world->players().get(a);
  auto* pb = world->players().get(b);
  pa->profile().set_level(5);
  pb->profile().set_level(9);
  pa->profile().set_experience(f32(123));
  pb->profile().set_experience(f32(456));
  pa->loadout().set_score(f32(1234));
  pb->loadout().set_score(f32(5678));
  pa->loadout().slots()[8].type_id = engine::catalog::PetalId::kCornEpic;
  pb->loadout().slots()[8].type_id = engine::catalog::PetalId::kFastCommon;
  const auto mob = spawn_entity(*world, EntityKind::kMob, engine::catalog::SpeciesId::kRock,
                                {f32(0), f32(200)}, f32(10));
  PeerSession peer(*world, context(a));
  net::ReplicationSession sb;
  std::vector<std::vector<std::uint8_t>> frames;
  auto append = [&](const auto& message, unsigned epoch) {
    const auto bytes = encode_message(message, epoch);
    if (!bytes) {
      std::exit(3);
    }
    frames.push_back(*bytes);
  };
  auto emit = [&](ViewerContext viewer, net::ReplicationSession& session,
                  const TickChanges& changes) {
    auto p = publish(*world, changes, viewer, session);
    if (!p) {
      std::exit(4);
    }
    frames.push_back(std::move(p->bytes));
  };
  append(welcome(a), 7);
  append(welcome(b), 7);
  auto changes = *freeze_tick_changes(*world);
  emit(context(a), peer.replication, changes);
  emit(context(b), sb, changes);
  finish_tick_changes(*world);
  if (peer.receive_input(*world, Input{1, 1, 0, 1, 0, 200}, 7) != ResultCode::Ok) {
    return 5;
  }
  peer.prepare_tick(*world);
  advance_world(*world);
  world->record_hit(pa->player(), pb->player(), f32(7), f32(93));
  if (!world->destroy(mob)) {
    return 6;
  }
  std::vector<ChatRecord> chats{{b, "shared room message"}};
  changes = *freeze_tick_changes(*world, chats);
  emit(context(a), peer.replication, changes);
  emit(context(b), sb, changes);
  finish_tick_changes(*world);
  peer.replication.request_full();
  emit(context(a), peer.replication, *freeze_tick_changes(*world));
  const auto old = pa->player();
  kill_entity(*world, old, pb->player());
  emit(context(a), peer.replication, *freeze_tick_changes(*world));
  finish_tick_changes(*world);
  if (!world->destroy(old)) {
    return 7;
  }
  emit(context(a), peer.replication, *freeze_tick_changes(*world));
  finish_tick_changes(*world);
  test::advance_ticks(*world, 50);
  if (!spawn_registered_player(*world, a, 1, "Alice").valid()) {
    return 8;
  }
  emit(context(a), peer.replication, *freeze_tick_changes(*world));
  finish_tick_changes(*world);
  append(welcome(a, 8), 8);
  net::ReplicationSession reconnected;
  emit(context(a, 8), reconnected, *freeze_tick_changes(*world));
  net::ReplicationSession sparse;
  emit(context(b, 7, false), sparse, *freeze_tick_changes(*world));
  (void)spawn_loot_drop(*world, engine::catalog::PetalId::kStingerUnusual,
                        world->entities().get(pb->player())->position + Vec2{f32(150), {}}, {});
  auto pickup = publish(*world, *freeze_tick_changes(*world), context(b, 7, false), sparse);
  if (!pickup) {
    return 10;
  }
  frames.push_back(std::move(pickup->bytes));
  frames.push_back(std::move(pickup->leaderboardBytes));
  ByteWriter output;
  output.write_bytes(std::array<std::uint8_t, 4>{'M', '0', '4', 'F'});
  output.write_u32_le(frames.size());
  for (const auto& bytes : frames) {
    output.write_u32_le(bytes.size());
    output.write_bytes(bytes);
  }
  std::ofstream file(argv[1], std::ios::binary);
  file.write(reinterpret_cast<const char*>(output.bytes().data()), output.bytes().size());
  return file ? 0 : 9;
}
