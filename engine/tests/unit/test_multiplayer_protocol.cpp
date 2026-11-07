#include "../support/multiplayer.hpp"
#include "engine/catalog/ids.hpp"
#include "engine/net/peer_session.hpp"
#include <iostream>
#include <cstdlib>
using namespace engine;
using namespace engine::net;
#define CHECK(x)                                                \
  do {                                                          \
    if (!(x)) {                                                 \
      std::cerr << __func__ << ':' << __LINE__ << ": " #x "\n"; \
      std::exit(1);                                             \
    }                                                           \
  } while (false)
namespace {
ViewerContext viewer(PlayerId id, unsigned epoch = 7) {
  RoomEpoch room{};
  room[0] = 1;
  return {id, room, epoch};
}
void wire_vectors_and_boundaries() {
  // Authored directly from the 16-byte envelope and six LE input fields.
  const std::vector<std::uint8_t> bytes = {70, 76, 82, 50, 2, 0, 3,   0,  7, 0, 0,  0, 24, 0,
                                           0,  0,  1,  0,  0, 0, 1,   0,  0, 0, 10, 0, 0,  0,
                                           3,  0,  0,  0,  0, 0, 192, 63, 0, 0, 72, 67};
  const auto message = decode_message(bytes, true);
  CHECK(message);
  const auto& input = std::get<Input>(message->value);
  CHECK(input.inputSeq == 1 && input.lifeEpoch == 1 && input.targetTick == 10 &&
        input.buttons == 3 && input.angle == 1.5F && input.strength == 200);
  CHECK(encode_message(input, 7) == bytes);
  CHECK(!decode_message(bytes, false));
  for (std::size_t n = 0; n < bytes.size(); ++n) {
    CHECK(!decode_message(std::span(bytes).first(n), true));
  }
  for (auto index : {0U, 4U, 6U, 7U, 12U}) {
    auto bad = bytes;
    bad[index] = 255;
    CHECK(!decode_message(bad, true));
  }
  auto bad = bytes;
  bad.push_back(0);
  CHECK(!decode_message(bad, true));
  bad = bytes;
  bad[16] = 0;
  CHECK(!decode_message(bad, true));
  bad = bytes;
  bad[34] = 128;
  bad[35] = 127;
  CHECK(!decode_message(bad, true));  // +infinity angle
  CHECK(!encode_message(input, 0));
  const std::array<std::uint8_t, 5> overflowBytes{255, 255, 255, 255, 31};
  WireReader overflow(overflowBytes);
  (void)overflow.varint();
  CHECK(!overflow.done());
  const std::array<std::uint8_t, 2> overlongBytes{128, 0};
  WireReader overlong(overlongBytes);
  (void)overlong.varint();
  CHECK(!overlong.done());
}
void strict_text_and_all_message_roundtrips() {
  Hello hello;
  hello.protocolVersion = 2;
  hello.catalogHash = std::string(kCatalogHash);
  hello.roomId = "room_A-1";
  hello.nickname = "  玩家😀  ";
  auto bytes = encode_message(hello, 0);
  CHECK(bytes);
  const auto decoded = decode_message(*bytes, true);
  CHECK(decoded);
  CHECK(!validate_hello(hello));
  auto mismatch = hello;
  mismatch.protocolVersion = 1;
  CHECK(validate_hello(mismatch) == ErrorCode::Version);
  mismatch = hello;
  mismatch.catalogHash = std::string(64, '0');
  CHECK(validate_hello(mismatch) == ErrorCode::Catalog);
  CHECK(std::get<Hello>(decoded->value).nickname == "玩家😀");
  hello.nickname = std::string("\xc0\xaf", 2);
  CHECK(!encode_message(hello, 0));
  hello.nickname = "a\nb";
  CHECK(!encode_message(hello, 0));
  hello.nickname = std::string(33, 'x');
  CHECK(!encode_message(hello, 0));
  hello.nickname = "ok";
  hello.roomId = "../room";
  CHECK(!encode_message(hello, 0));
  Welcome welcome;
  welcome.roomId = "a";
  welcome.playerId = 1;
  welcome.sessionEpoch = 7;
  welcome.tickMs = 50;
  welcome.roomEpoch[0] = 1;
  welcome.resumeToken[0] = 99;
  CHECK(decode_message(*encode_message(welcome, 7), false));
  Command command;
  command.commandSeq = 1;
  CHECK(decode_message(*encode_message(command, 7), true));
  CommandResult result{1, ResultCode::Cooldown, 50};
  CHECK(decode_message(*encode_message(result, 7), false));
  ResyncRequest resync{1, 1, ResyncReason::Gap};
  CHECK(decode_message(*encode_message(resync, 7), true));
  CHECK(decode_message(*encode_message(Ping{1, 2, 3}, 7), true));
  CHECK(decode_message(*encode_message(Pong{1, 2, 3}, 7), false));
  CHECK(decode_message(*encode_message(net::Error{ErrorCode::RoomFull, "full", true}, 0), false));
  CHECK(decode_message(*encode_message(CloseReason{ErrorCode::Stopping, "stop", false}, 7), false));
  Leaderboard leaderboard{welcome.roomEpoch, 2, {{1, "Alice", 10}, {2, "玩家😀", 25}}};
  const auto roster = encode_message(leaderboard, 7);
  CHECK(roster);
  CHECK(std::get<Leaderboard>(decode_message(*roster, false)->value).entries[1].score == 25);
  CHECK(!decode_message(*roster, true) && !encode_message(leaderboard, 0));
  leaderboard.entries.resize(9);
  CHECK(!encode_message(leaderboard, 7));
  SelfState self;
  WireWriter w;
  self.backpack.resize(17);
  writeSelfState(w, self);
  CHECK(!w.frame(6, 7, kMaxServerFrameBytes));
}
void independent_receipt_adoption_and_ttl() {
  auto world = test::make_world();
  const auto a = test::join_player(*world, "A", {f32(-400), f32(0)}),
             b = test::join_player(*world, "B", {f32(400), f32(0)});
  PeerSession pa(*world, viewer(a)), pb(*world, viewer(b));
  Input input{1, 1, 0, 1, 0, 200};
  CHECK(pa.receive_input(*world, input, 7) == ResultCode::Ok &&
        pb.receive_input(*world, input, 7) == ResultCode::Ok);
  CHECK(pa.last_received_input_seq() == 1 &&
        world->players().get(a)->last_applied_input_sequence == 0);
  const auto before = publish(*world, *freeze_tick_changes(*world), viewer(a), pa.replication);
  CHECK(before);
  CHECK(before->snapshot.lastReceivedInputSeq == 1 && before->snapshot.lastAppliedInputSeq == 0);
  pa.prepare_tick(*world);
  pb.prepare_tick(*world);
  CHECK(world->players().get(a)->last_applied_input_sequence == 0);
  advance_world(*world);
  CHECK(world->players().get(a)->last_applied_input_sequence == 1 &&
        world->players().get(b)->last_applied_input_sequence == 1);
  CHECK(pa.receive_input(*world, input, 7) == ResultCode::InvalidSequence);
  const auto expires = world->players().get(a)->input_valid_until_tick;
  for (unsigned i = 0; i < 5; i++) {
    pa.prepare_tick(*world);
    advance_world(*world);
  }
  CHECK(world->players().get(a)->input().strength.value == 0 &&
        world->players().get(a)->last_applied_input_sequence == 1);
  CHECK(expires == 5 && world->players().get(a)->last_control_tick == 5);
  const auto reused = publish(*world, *freeze_tick_changes(*world), viewer(a), pa.replication);
  CHECK(reused);
  CHECK(reused->snapshot.lastAppliedInputSeq == 1 && reused->snapshot.inputAppliedTick == 0);
  CHECK(reused->snapshot.selfState.inputNeutral &&
        reused->snapshot.selfState.inputExpiresTick == 0);
  CHECK(reused->snapshot.selfState.positionX ==
        world->entities().get(world->players().get(a)->player())->position.x.value);
}
void input_windows_and_life_revalidation() {
  auto world = test::make_world();
  const auto id = test::join_player(*world, "A", {});
  PeerSession peer(*world, viewer(id));
  CHECK(peer.receive_input(*world, Input{0, 1, 0, 0, 0, 0}, 7) == ResultCode::InvalidSequence);
  CHECK(peer.receive_input(*world, Input{1025, 1, 0, 0, 0, 0}, 7) == ResultCode::InvalidSequence);
  CHECK(peer.receive_input(*world, Input{1, 1, 3, 0, 0, 0}, 7) == ResultCode::InvalidState);
  CHECK(peer.receive_input(*world, Input{1, 1, 0, 0, 0, 0}, 6) == ResultCode::InvalidSequence);
  CHECK(peer.receive_input(*world, Input{1, 1, 2, 1, 0, 200}, 7) == ResultCode::Ok);
  CHECK(peer.receive_input(*world, Input{2, 1, 2, 2, 0, 100}, 7) ==
        ResultCode::Ok);  // Latest target-tick input wins.
  peer.prepare_tick(*world);
  CHECK(world->players().get(id)->input_sequence == 0);
  test::advance_ticks(*world, 2);
  peer.prepare_tick(*world);
  advance_world(*world);
  CHECK(world->players().get(id)->last_applied_input_sequence == 2 &&
        world->players().get(id)->input().buttons == 2);
  CHECK(peer.receive_input(*world, Input{3, 1, 4, 1, 0, 200}, 7) == ResultCode::Ok);
  ++world->players().get(id)->life_epoch;
  test::advance_ticks(*world, 2);
  peer.prepare_tick(*world);
  CHECK(world->players().get(id)->input_sequence != 3);
  CHECK(peer.receive_input(*world, Input{4, 1, 5, 0, 0, 0}, 7) == ResultCode::StaleLife);
  CHECK(peer.receive_input(*world, Input{UINT32_MAX, 2, 5, 0, 0, 0}, 7) ==
        ResultCode::InvalidSequence);
  test::advance_ticks(*world, 10);
  CHECK(peer.receive_input(*world, Input{4, 2, 0, 0, 0, 0}, 7) == ResultCode::InvalidState);
}
void commands_are_bounded_idempotent_and_life_scoped() {
  auto world = test::make_world();
  const auto id = test::join_player(*world, "A", {});
  PeerSession peer(*world, viewer(id));
  std::vector<ChatRecord> chats;
  Command c;
  c.commandSeq = 1;
  c.kind = CommandKind::Chat;
  c.text = "hello";
  CHECK(peer.queue_command(*world, c, 7).code == ResultCode::Ok);
  CHECK(peer.queue_command(*world, c, 7).code == ResultCode::Duplicate);
  CHECK(peer.execute_commands(*world, chats).front().code == ResultCode::Ok && chats.size() == 1);
  CHECK(peer.queue_command(*world, c, 7).result->code == ResultCode::Ok);
  CHECK(peer.execute_commands(*world, chats).empty() && chats.size() == 1);
  c.commandSeq = 2;
  c.kind = CommandKind::Discard;
  c.text.clear();
  c.lifeEpoch = 1;
  c.typeA = 1;
  CHECK(peer.queue_command(*world, c, 7).code == ResultCode::Ok);
  ++world->players().get(id)->life_epoch;
  CHECK(peer.execute_commands(*world, chats).front().code == ResultCode::StaleLife);
  CHECK(world->players().get(id)->loadout().slots()[0].type_id == catalog::PetalId::kBasicCommon);
  c.kind = CommandKind::Chat;
  c.text = "x";
  for (unsigned i = 3; i < 131; i++) {
    c.commandSeq = i;
    CHECK(peer.queue_command(*world, c, 7).code == ResultCode::Ok);
  }
  c.commandSeq = 131;
  CHECK(peer.queue_command(*world, c, 7).code == ResultCode::QueueFull);
  CHECK(peer.execute_commands(*world, chats).size() == 4);
  for (unsigned i = 0; i < 32; i++) {
    (void)peer.execute_commands(*world, chats);
  }
  c.commandSeq = 1;
  CHECK(peer.queue_command(*world, c, 7).code == ResultCode::InvalidSequence);
}
void reconnect_resets_sequences_and_invalidates_old_bindings() {
  auto world = test::make_world();
  const auto id = test::join_player(*world, "A", {});
  PeerSession old(*world, viewer(id));
  CHECK(old.receive_input(*world, Input{100, 1, 0, 1, 0, 200}, 7) == ResultCode::Ok);
  old.prepare_tick(*world);
  advance_world(*world);
  CHECK(world->players().get(id)->last_applied_input_sequence == 100);
  PeerSession fresh(*world, viewer(id, 8));
  CHECK(world->players().get(id)->last_applied_input_sequence == 0);
  CHECK(old.receive_input(*world, Input{101, 1, 1, 1, 0, 200}, 7) == ResultCode::InvalidSequence);
  CHECK(fresh.receive_input(*world, Input{1, 1, 1, 2, 0, 100}, 8) == ResultCode::Ok);
  fresh.prepare_tick(*world);
  advance_world(*world);
  CHECK(world->players().get(id)->last_applied_input_sequence == 1);
  auto other = test::make_world();
  CHECK(test::join_player(*other, "B", {}) == id);
  PeerSession elsewhere(*other, viewer(id, 8));
  CHECK(fresh.receive_input(*other, Input{2, 1, 2, 0, 0, 0}, 8) == ResultCode::InvalidSequence);
  fresh.invalidate();
  CHECK(fresh.receive_input(*world, Input{2, 1, 2, 0, 0, 0}, 8) == ResultCode::InvalidSequence);
}
}
int main() {
  wire_vectors_and_boundaries();
  strict_text_and_all_message_roundtrips();
  independent_receipt_adoption_and_ttl();
  input_windows_and_life_revalidation();
  commands_are_bounded_idempotent_and_life_scoped();
  reconnect_resets_sequences_and_invalidates_old_bindings();
  std::cout << "6 multiplayer protocol scenarios passed\n";
}
