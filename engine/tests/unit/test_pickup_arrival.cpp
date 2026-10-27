#include "engine/core/byte_reader.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/net/original_snapshot.hpp"
#include "engine/sim/loot.hpp"
#include <algorithm>
#include <array>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#include <cstdio>

#define CHECK(condition) do { if (!(condition)) throw std::runtime_error(#condition); } while (false)
#include "test_original_client_adapter.hpp"

int main() {
  using namespace engine;
  using archived_adapter_tests::decode;
  WorkerApi api; api.init(); archived_adapter_tests::join(api);
  const Vec2 position = api.world().entities().get(api.world().player())->position;
  const auto fresh = spawn_loot_drop(api.world(), 7U, position, Vec2{});
  const auto first = decode(api.original_client_snapshot_bytes(1U));
  CHECK((first.records.at(fresh.to_wire()).flags & 128U) != 0U);
  api.world().entities().get(fresh)->set_position(position + Vec2(f32(1.0F), f32(0.0F)));
  const auto delta = decode(api.original_client_snapshot_bytes(2U));
  CHECK((delta.records.at(fresh.to_wire()).flags & 128U) == 0U);
  CHECK((delta.records.at(fresh.to_wire()).flags & 2U) != 0U);

  const auto old = spawn_loot_drop(api.world(), 7U, position + Vec2(f32(5000.0F), f32(0.0F)), Vec2{});
  for (int i = 0; i < 3; ++i) api.think();
  api.world().entities().get(old)->set_position(position);
  const auto entering = decode(api.original_client_snapshot_bytes(3U));
  CHECK((entering.records.at(old.to_wire()).flags & 128U) == 0U);
  CHECK((entering.records.at(old.to_wire()).flags & 2U) == 0U);

  // The live page consumes the domain stream, not original_client_snapshot_bytes.
  // Its first record for a newly visible pickup must carry the same arrival bit.
  const auto domain_fresh = spawn_loot_drop(api.world(), 7U, position + Vec2(f32(100.0F), f32(0.0F)), Vec2{});
  const auto marked = api.domain_snapshot_bytes(4U, 0U);
  const auto has_marked_record = [](const std::vector<std::uint8_t>& bytes, std::uint32_t wire) {
    for (std::size_t index = 0; index + 4 < bytes.size(); ++index) {
      if (bytes[index] != static_cast<std::uint8_t>(wire & 255U)
          || bytes[index + 1] != static_cast<std::uint8_t>((wire >> 8U) & 255U)
          || bytes[index + 2] != static_cast<std::uint8_t>((wire >> 16U) & 255U)
          || bytes[index + 3] != static_cast<std::uint8_t>((wire >> 24U) & 255U)) continue;
      if (bytes[index + 4] == 183U) return true; // flags = (1 | 128) XOR 54
    }
    return false;
  };
  CHECK(has_marked_record(marked, domain_fresh.to_wire()));
  CHECK(!has_marked_record(marked, old.to_wire()));
  std::puts("ok 1 - pickup creation marker and old viewport arrival\n1..1");
}
