// Independent archived transport decoder: deliberately does not call the
// writer's decrypt, record reader or any domain decoder. Original key bytes
// come from the separately generated protocol contract.
#include "engine/net/packet_key.hpp"

namespace archived_adapter_tests {
using namespace engine;
struct Record {
  std::uint32_t flags = 0, mask = 0;
  std::map<std::uint32_t, double> values;
  std::map<std::uint32_t, std::vector<std::uint32_t>> arrays;
  std::map<std::uint32_t, std::string> strings;
};
struct Packet {
  std::uint32_t sequence = 0, ack = 0;
  std::map<std::uint32_t, Record> records;
  std::vector<std::uint32_t> removed;
  std::vector<std::pair<std::uint32_t, std::uint32_t>> events;
};
Packet decode(std::vector<std::uint8_t> bytes) {
  Packet packet;
  ByteReader header(bytes);
  CHECK(header.read_u8().value() == 1U);
  packet.sequence = header.read_varint32().value();
  const auto start = header.cursor();
  for (std::size_t i = start; i < bytes.size(); ++i)
    bytes[i] ^= net::kPacketXorKey[(i - start) % net::kPacketXorKey.size()];
  ByteReader reader(std::span<const std::uint8_t>(bytes).subspan(start));
  packet.ack = reader.read_varint32().value();
  const auto length = reader.read_varint32().value();
  const auto end = reader.cursor() + length;
  const auto removed = reader.read_varint32().value();
  CHECK(reader.read_u16_le().value() == 0U);
  for (std::uint32_t i = 0; i < removed; ++i)
    packet.removed.push_back(reader.read_u32_le().value());
  CHECK(reader.read_u16_le().value() == 0U);
  for (auto wire = reader.read_u32_le().value(); wire != 0U; wire = reader.read_u32_le().value()) {
    auto& record = packet.records[wire];
    record.flags = reader.read_u8().value() ^ 54U;
    CHECK((record.flags & 8U) == 0U); // sparse only
    if ((record.flags & 2U) == 0U) {
      CHECK((record.flags & 1U) != 0U);
      record.mask = reader.read_u32_le().value();
    }
    std::uint32_t field = 0;
    for (;;) {
      const auto delta = reader.read_varint32().value() ^ 1U;
      if (delta == 0U) break;
      field += delta;
      CHECK(field <= 63U);
      switch (field) {
        case 1: case 2: case 9: case 11: case 12: case 14: case 17:
        case 20: case 22: case 26: case 31: case 34: case 36: case 38:
        case 43: case 46: case 47: case 50: case 54: case 62: case 63:
          record.values[field] = reader.read_u8().value(); break;
        case 5: case 7: case 19: case 21: case 24: case 28: case 32:
        case 42: case 45: case 49: case 53: case 55: case 59:
          record.values[field] = reader.read_f32_le().value(); break;
        case 8: record.values[field] = reader.read_u16_le().value(); break;
        case 23: case 56: case 57:
          record.values[field] = reader.read_u32_le().value(); break;
        case 30: case 52: case 58:
          record.values[field] = reader.read_varint32().value(); break;
        case 6: case 48:
          record.strings[field] = reader.read_cstring().value(); break;
        case 3: case 10: case 16: case 39: case 60: case 61: {
          std::uint32_t index = 0;
          auto& elements = record.arrays[field];
          const auto count = field == 60U ? 16U : field == 61U ? 8U : 10U;
          elements.resize(count);
          for (;;) {
            const auto step = reader.read_varint32().value() ^ 1U;
            if (step == 0U) break;
            index += step;
            CHECK(index >= 1U && index <= count);
            if (field == 10U) (void)reader.read_cstring().value();
            else elements.at(index - 1U) = field == 3U ? reader.read_u32_le().value()
              : field == 61U || field == 39U ? reader.read_varint32().value() : reader.read_u8().value();
          }
          break;
        }
        default: CHECK(false); return packet;
      }
    }
    CHECK(reader.cursor() < end);
  }
  CHECK(reader.cursor() == end);
  CHECK(reader.read_u8().value() == 0U);
  for (auto index = reader.read_varint32().value(); index != 0U; index = reader.read_varint32().value()) {
    CHECK(index == 1U);
    const auto opcode = reader.read_varint32().value();
    if (opcode == 9U) { (void)reader.read_cstring().value(); packet.events.push_back({opcode, 0U}); }
    else {
      CHECK(opcode == 11U || opcode == 14U);
      const auto wire = reader.read_u32_le().value();
      packet.events.push_back({opcode, wire});
      if (opcode == 14U) CHECK(reader.read_u8().value() < 16U);
    }
  }
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.eof());
  return packet;
}
void join(WorkerApi& api) {
  const std::array<std::uint8_t, 4> input{1U, 6U, 'A', 0U};
  CHECK(api.send(input, {}));
}
void metadata_and_fields() {
  WorkerApi api; api.init();
  CHECK(api.flush_original_client().empty());
  api.think(); api.enqueue_domain_snapshot(1U);
  const auto boot = api.flush_original_client(); CHECK(boot.size() == 1U);
  const auto packet = decode(boot.front().payload);
  const auto world = api.original_client_world_handle().to_wire();
  const auto controller = api.original_client_controller_handle().to_wire();
  CHECK(packet.records.size() == 2U);
  CHECK(packet.records.at(world).mask == (1U << 15U));
  CHECK(packet.records.at(world).values.at(19U) == 50000.0);
  CHECK(packet.records.at(world).values.at(42U) == 4000.0);
  CHECK(packet.records.at(controller).mask == (1U << 5U));
  CHECK(packet.records.at(controller).values.at(56U) == 0U);
  join(api);
  const auto body = api.world().player();
  auto joined = decode(api.original_client_snapshot_bytes(128U));
  CHECK(joined.ack == 1U);
  CHECK(joined.records.at(controller).values.at(56U) == body.to_wire());
  const auto& player = joined.records.at(body.to_wire());
  CHECK((player.mask & (1U << 5U)) == 0U);
  CHECK(player.values.at(26U) == 0U);
  CHECK(player.values.at(57U) == controller);
  CHECK(player.values.at(49U) == api.world().entities().get(body)->position.x.value);
  CHECK(player.values.at(28U) == api.world().entities().get(body)->position.y.value);
  CHECK(player.values.at(53U) == 100.0);
  CHECK(player.arrays.at(60U).size() == 16U);
  CHECK(player.arrays.at(60U).at(0) == api.world().loadout().slots()[0].type_id);
  CHECK(!player.values.contains(5U) && !player.values.contains(24U));
  for (const auto& [wire, record] : joined.records) {
    if (wire == controller) continue;
    CHECK((record.mask & (1U << 5U)) == 0U);
    if (record.values.contains(50U)) {
      CHECK(record.values.at(23U) == 0U);
      CHECK(record.values.at(57U) == body.to_wire());
    }
  }
  const auto unchanged = decode(api.original_client_snapshot_bytes(129U));
  CHECK(unchanged.records.empty());
  auto* entity = api.world().entities().get(body);
  const auto x = entity->position.x;
  entity->set_position_x(x + f32(1.0F)); entity->set_position_x(x);
  const auto revision = decode(api.original_client_snapshot_bytes(130U));
  CHECK(revision.records.at(body.to_wire()).values.contains(49U));
  CHECK(!revision.records.contains(controller));
  api.world().loadout().slots()[0].type_id = 0U;
  const auto cleared = decode(api.original_client_snapshot_bytes(131U));
  CHECK(cleared.records.at(body.to_wire()).arrays.at(60U).at(0) == 0U);
}
void sequence_boundaries() {
  for (const std::uint32_t sequence : {127U, 128U, 16383U, 16384U}) {
    OriginalClientSnapshotWriter writer; writer.begin(sequence, 3U);
    const auto bytes = writer.finish();
    ByteReader header(bytes); (void)header.read_u8(); (void)header.read_varint32();
    CHECK(bytes.at(header.cursor()) == (3U ^ 0x37U));
    CHECK(bytes.at(header.cursor() + 1U) == (9U ^ 0x0DU));
    const auto decoded = decode(bytes);
    CHECK(decoded.sequence == sequence && decoded.ack == 3U);
    CHECK(decoded.records.empty() && decoded.removed.empty() && decoded.events.empty());
  }
}
void removals_and_events() {
  WorkerApi api; api.init(); join(api);
  (void)api.flush_original_client(); api.think(); api.enqueue_domain_snapshot(1U);
  (void)api.flush_original_client();
  const auto body = api.world().player();
  const auto position = api.world().entities().get(body)->position;
  const auto drop = api.spawn(EntityKind::kDrop, 7U, position);
  const auto first = decode(api.original_client_snapshot_bytes(2U));
  CHECK(first.records.at(drop.to_wire()).values.at(22U) == 7U);
  CHECK(!first.records.at(drop.to_wire()).values.contains(26U));
  api.think();
  api.world().record_hit(body, drop, f32(1.0F), f32(99.0F));
  api.world().loadout().record_pickup_transfer(drop, 2U);
  api.enqueue_domain_snapshot(2U); // archive captures before domain consumes
  const auto packets = api.flush_original_client(); CHECK(packets.size() == 1U);
  const auto with_events = decode(packets.front().payload);
  CHECK(std::find(with_events.events.begin(), with_events.events.end(), std::pair{11U, body.to_wire()}) != with_events.events.end());
  CHECK(std::find(with_events.events.begin(), with_events.events.end(), std::pair{14U, drop.to_wire()}) != with_events.events.end());
  CHECK(decode(api.original_client_snapshot_bytes(3U)).events.empty());
  CHECK(api.despawn(drop));
  const auto removed = decode(api.original_client_snapshot_bytes(4U));
  CHECK(std::find(removed.removed.begin(), removed.removed.end(), drop.to_wire()) != removed.removed.end());
  CHECK(decode(api.original_client_snapshot_bytes(5U)).removed.empty());
}
void corpse_and_restart() {
  WorkerApi api; api.init(); join(api);
  const auto body = api.world().player();
  const auto controller = api.original_client_controller_handle().to_wire();
  (void)api.original_client_snapshot_bytes(1U);
  const std::array<std::uint8_t, 3> suicide{2U, 3U, 0U}; CHECK(api.send(suicide, {}));
  api.think();
  const auto corpse = decode(api.original_client_snapshot_bytes(2U));
  CHECK(api.world().player() == body);
  CHECK(corpse.records.at(body.to_wire()).values.at(53U) == 0.0);
  CHECK(!corpse.records.contains(controller) || !corpse.records.at(controller).values.contains(56U));
  for (int i = 0; i < 18; ++i) api.think();
  CHECK(api.world().entities().get(body) != nullptr);
  for (int i = 0; i < 3; ++i) api.think();
  const auto removed = decode(api.original_client_snapshot_bytes(3U));
  CHECK(removed.records.at(controller).values.at(56U) == 0U);
  CHECK(std::find(removed.removed.begin(), removed.removed.end(), body.to_wire()) != removed.removed.end());
  const std::array<std::uint8_t, 2> restart{3U, 4U}; CHECK(api.send(restart, {}));
  const auto reopened = decode(api.original_client_snapshot_bytes(4U));
  CHECK(api.world().player() != body);
  CHECK(reopened.records.at(controller).values.at(56U) == api.world().player().to_wire());
  CHECK((reopened.records.at(controller).flags & 2U) != 0U);
  CHECK(reopened.records.at(api.world().player().to_wire()).values.at(57U) == controller);
}
} // namespace archived_adapter_tests
