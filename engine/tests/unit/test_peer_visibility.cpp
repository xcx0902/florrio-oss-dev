// Standalone publisher regressions. Build against engine_core; deliberately
// separate from test_main.cpp, which other implementation work owns.
#include "engine/core/byte_reader.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/net/packet_key.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <set>
#include <stdexcept>
#include <string>

namespace {
using namespace engine;

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

struct Record {
  std::set<std::uint32_t> fields;
  std::map<std::uint32_t, double> values;
  std::map<std::uint32_t, std::uint32_t> field_counts;
  std::map<std::uint32_t, double> dense_values;
  std::uint32_t dense_count = 0;
};
struct Packet {
  std::map<std::uint32_t, Record> entities;
  std::vector<std::uint32_t> deleted;
  std::uint32_t events = 0;
  bool has(EntityHandle handle) const { return entities.contains(handle.raw); }
  bool removes(EntityHandle handle) const {
    return std::find(deleted.begin(), deleted.end(), handle.raw) != deleted.end();
  }
  const Record& at(EntityHandle handle) const { return entities.at(handle.raw); }
};

// Decode every emitted record through EOF, independently of visibility code.
// Decode the default dense schema and every full-framing sparse type, so
// duplicate target writes or a bad record boundary cannot masquerade as a pass.
Packet snapshot(WorkerApi& api, std::uint32_t sequence = 1U) {
  const auto bytes = api.domain_snapshot_bytes(sequence);
  ByteReader reader(bytes);
  require(reader.read_u8().value() == 1U, "snapshot opcode");
  require(reader.read_varint32().value() == sequence, "snapshot sequence");
  require(reader.read_varint32().value() == 0U, "snapshot acknowledgement");
  const auto deletes = reader.read_varint32().value();
  const auto updates = reader.read_varint32().value();
  Packet packet;
  packet.events = reader.read_varint32().value();
  for (std::uint32_t index = 0; index < deletes; ++index)
    packet.deleted.push_back(EntityHandle::from_wire(reader.read_u32_le().value()).raw);
  for (std::uint32_t index = 0; index < updates; ++index) {
    auto& record = packet.entities[EntityHandle::from_wire(reader.read_u32_le().value()).raw];
    const auto flags = reader.read_u8().value() ^ 54U;
    if (flags == 8U) {
      const auto start = reader.cursor();
      const auto byte = [&](std::uint32_t field) {
        record.dense_values[field] = reader.read_u8().value();
      };
      const auto scalar = [&](std::uint32_t field) {
        record.dense_values[field] = reader.read_f32_le().value();
      };
      byte(22U); byte(54U); byte(36U);
      byte(1U); scalar(5U);
      (void)reader.read_cstring().value(); // 6
      require(reader.read_bytes(10U).size() == 10U, "complete dense field16 array");
      byte(20U); scalar(21U); scalar(24U); scalar(32U);
      byte(34U); byte(47U);
      record.dense_values[56U] = reader.read_u32_le().value();
      scalar(53U); scalar(55U);
      record.dense_values[8U] = reader.read_u16_le().value();
      scalar(28U); scalar(49U); scalar(7U);
      byte(2U); byte(26U); byte(31U);
      require(reader.cursor() - start == 63U, "complete default dense payload");
      ++record.dense_count;
      continue;
    }
    require(flags == 1U, "domain sparse component declaration");
    (void)reader.read_u32_le().value();
    std::uint32_t field = 0U;
    for (auto delta = reader.read_varint32().value(); delta != 0U;
         delta = reader.read_varint32().value()) {
      field += delta;
      record.fields.insert(field);
      ++record.field_counts[field];
      switch (field) {
        case 1: case 2: case 9: case 11: case 12: case 14: case 17:
        case 20: case 22: case 26: case 29: case 31: case 33: case 34:
        case 36: case 37: case 38: case 40: case 43: case 46: case 47:
        case 50: case 54: case 62: case 63:
          record.values[field] = reader.read_u8().value(); break;
        case 5: case 7: case 13: case 19: case 21: case 24: case 27:
        case 28: case 32: case 42: case 45: case 49: case 53: case 55: case 59:
          record.values[field] = reader.read_f32_le().value(); break;
        case 8: record.values[field] = reader.read_u16_le().value(); break;
        case 18: case 35:
          record.values[field] = reader.read_f64_le().value(); break;
        case 15: case 30: case 41: case 44: case 51: case 52: case 58:
          record.values[field] = reader.read_varint32().value(); break;
        case 23: case 56: case 57:
          record.values[field] = reader.read_u32_le().value(); break;
        case 4: case 6: case 48: (void)reader.read_cstring().value(); break;
        case 3: case 10: case 16: case 25: case 39: case 60: case 61:
          for (auto step = reader.read_varint32().value(); step != 0U;
               step = reader.read_varint32().value()) {
            if (field == 3U) (void)reader.read_u32_le().value();
            else if (field == 10U || field == 25U) (void)reader.read_cstring().value();
            else if (field == 16U || field == 60U) (void)reader.read_u8().value();
            else (void)reader.read_varint32().value();
          }
          break;
        default: throw std::runtime_error("unexpected domain sparse field " + std::to_string(field));
      }
    }
  }
  for (std::uint32_t index = 0; index < packet.events; ++index) {
    switch (reader.read_u8().value()) {
      case 9: (void)reader.read_cstring().value(); break;
      case 11: (void)reader.read_u32_le().value(); break;
      case 14: (void)reader.read_u32_le().value(); (void)reader.read_u8().value(); break;
      default: throw std::runtime_error("unexpected domain event");
    }
  }
  require(reader.error() == ParseError::kNone && reader.eof(), "snapshot decoded exactly through EOF");
  return packet;
}

Vec2 point(float x, float y = 0.0F) { return {f32(x), f32(y)}; }

void empty_populated(WorkerApi& api) {
  api.init(true);
  api.world().set_auto_populate(false);
  std::vector<EntityHandle> handles;
  for (const auto& entity : api.world().entities().entities())
    if (entity.active) handles.push_back(entity.handle);
  for (const auto handle : handles) require(api.despawn(handle), "remove unseen population fixture");
}

EntityHandle join(WorkerApi& api, float x = -5000.0F, float y = 0.0F) {
  api.configure_player_spawn(PlayerConfig{}, point(x, y));
  const std::array<std::uint8_t, 3> input{{1U, 6U, 0U}};
  require(api.send(input, {}), "join accepted");
  const auto handle = api.world().player();
  require(api.world().entities().get(handle) != nullptr, "controlled player spawned");
  return handle;
}

EntityHandle mob(WorkerApi& api, float x, float y = 0.0F, float radius = 10.0F) {
  const auto handle = api.spawn(EntityKind::kMob, 4U, point(x, y));
  auto* entity = api.world().entities().get(handle);
  require(entity != nullptr, "mob spawned");
  entity->collision_radius = f32(radius);
  entity->health = entity->max_health = f32(10.0F);
  return handle;
}

Aabb view(float x, float y = 0.0F, float scale = 0.9F) {
  const f32 width = f32(1920.0F) / f32(scale) + f32(200.0F);
  const f32 height = f32(1080.0F) / f32(scale) + f32(200.0F);
  const f32 left = width * f32(-0.5F) + f32(x);
  const f32 top = height * f32(-0.5F) + f32(y);
  return {left, top, left + width, top + height};
}

// Native fields 5/49 and 24/28 feed distinct camera/visual scalar clocks.
// Inspect write counts, not just final values: even an identical second write
// can sample and restart the client's interpolation history.
void require_targets(const Record& record, Vec2 position, bool camera_x, bool camera_y,
                     bool visual_x, bool visual_y,
                     bool angle, std::uint16_t angle_raw, bool dense) {
  for (const auto field : {5U, 8U, 24U, 28U, 49U}) {
    const bool expected = field == 5U ? camera_x : field == 24U ? camera_y
      : field == 49U ? visual_x : field == 28U ? visual_y : angle;
    const auto count = record.field_counts.find(field);
    require((count == record.field_counts.end() ? 0U : count->second) == (expected ? 1U : 0U),
            "each dirty interpolation target is written once; unchanged targets are absent");
    if (!expected) continue;
    const double value = field == 8U ? static_cast<double>(angle_raw)
      : (field == 5U || field == 49U ? position.x.value : position.y.value);
    require(record.values.at(field) == value, "sparse target preserves authoritative f32/angle value");
  }
  require(record.dense_count == (dense ? 1U : 0U),
          "default dense requires both axes and packed angle to be dirty");
  if (dense) {
    require(record.dense_values.at(5U) == position.x.value
            && record.dense_values.at(49U) == position.x.value
            && record.dense_values.at(24U) == position.y.value
            && record.dense_values.at(28U) == position.y.value
            && record.dense_values.at(8U) == angle_raw,
            "dense and sparse interpolation targets agree exactly");
  }
}

template<bool FullFraming, bool DefaultDense>
void test_per_axis_dirty_targets() {
  WorkerApi api;
  empty_populated(api);
  api.set_full_field_framing(FullFraming);
  api.set_default_dense_groups(DefaultDense);
  const auto player = join(api);
  const auto target = mob(api, -4900.0F, 17.0F);
  api.world().entities().get(target)->angle = f32(0.0F);
  std::uint32_t sequence = 0U;
  const auto check = [&](bool x, bool y, bool angle, std::uint16_t raw, bool dense) {
    const auto packet = snapshot(api, ++sequence);
    require(packet.has(target), "dirty-target fixture remains visible");
    require_targets(packet.at(target), api.world().entities().get(target)->position,
                    x, y, x, y, angle, raw, dense);
    if constexpr (FullFraming) {
      for (const auto field : {3U, 4U, 10U, 16U, 18U, 23U, 25U, 29U, 35U, 39U, 63U})
        require(packet.at(target).fields.contains(field), "full framing types are emitted and decoded");
    }
  };
  check(true, true, true, 0U, DefaultDense); // introduction
  check(false, false, false, 0U, false); // unchanged

  // One representable f32 step must dirty only that axis, even though its
  // movement is far smaller than a typical rendered pixel.
  auto* entity = api.world().entities().get(target);
  entity->position.x = f32(std::nextafter(entity->position.x.value, INFINITY));
  check(true, false, false, 0U, false);
  entity->position.y = f32(std::nextafter(entity->position.y.value, INFINITY));
  check(false, true, false, 0U, false);
  entity->position = point(-4899.0F, 18.0F);
  check(true, true, false, 0U, false); // angle unchanged must suppress dense

  // pi/2 packs to floor(65535/4), and a smaller-than-bin change keeps that
  // packed value. The baseline is the actual wire angle, not the source float.
  entity->angle = f32(1.5707963705062866F);
  check(false, false, true, 16383U, false);
  entity->angle = f32(std::nextafter(entity->angle.value, INFINITY));
  check(false, false, false, 16383U, false);
  entity->position.x = f32(-4898.0F);
  entity->angle = f32(0.0F);
  check(true, false, true, 0U, false); // Y unchanged must suppress dense
  entity->position.y = f32(19.0F);
  entity->angle = f32(1.5707963705062866F);
  check(false, true, true, 16383U, false); // X unchanged must suppress dense
  entity->position = point(-4897.0F, 20.0F);
  entity->angle = f32(0.0F);
  check(true, true, true, 0U, DefaultDense);
  check(false, false, false, 0U, false);

  api.world().entities().get(player)->position = point(-10000.0F);
  const auto left = snapshot(api, ++sequence);
  require(left.removes(target) && !left.has(target), "leaving visibility clears the axis baselines");
  const auto still_outside = snapshot(api, ++sequence);
  require(!still_outside.has(target) && !still_outside.removes(target), "visibility delete is not repeated");
  api.world().entities().get(player)->position = point(-5000.0F);
  check(true, true, true, 0U, DefaultDense); // unchanged body reintroduced
  check(false, false, false, 0U, false);
}

template<bool FullFraming, bool DefaultDense>
void test_clamped_visual_dirty_targets() {
  // Native garden evidence: intermediate movement changes the visual scalar
  // revision even when arena clamping restores the last published value.
  // The controller camera compares that final value instead. Exercise both
  // signs of each arena limit through real integration, without synthesizing
  // revisions or manually restoring the position after movement.
  for (const float direction : {-1.0F, 1.0F}) {
    WorkerApi api;
    empty_populated(api);
    api.set_full_field_framing(FullFraming);
    api.set_default_dense_groups(DefaultDense);
    const Vec2 limit = point(direction * (api.world().width().value * 0.5F - 10.0F),
                             direction * (api.world().height().value * 0.5F - 10.0F));
    const Vec2 viewer = point(limit.x.value - direction * 100.0F,
                              limit.y.value - direction * 100.0F);
    const auto player = join(api, viewer.x.value, viewer.y.value);
    const auto target = mob(api, limit.x.value, limit.y.value);
    auto* entity = api.world().entities().get(target);
    entity->angle = f32(0.0F);
    entity->angular_velocity = f32(0.0F);
    entity->velocity = {};
    entity->acceleration = {};
    std::uint32_t sequence = 0U;
    const auto check = [&](bool introduced, bool visual_x, bool visual_y) {
      const auto packet = snapshot(api, ++sequence);
      require(packet.has(target), "clamped boundary fixture remains visible");
      require_targets(packet.at(target), limit, introduced, introduced,
                      visual_x, visual_y, introduced, 0U, introduced && DefaultDense);
    };
    check(true, true, true);
    check(false, false, false);

    const auto push = [&](bool x, bool y) {
      const auto previous_x_revision = entity->position_x_revision;
      const auto previous_y_revision = entity->position_y_revision;
      entity->velocity.x = x ? static_cast<double>(direction) : 0.0;
      entity->velocity.y = y ? static_cast<double>(direction) : 0.0;
      integrate_movement(api.world(), 50.0);
      require(entity->position.x.bits() == limit.x.bits()
              && entity->position.y.bits() == limit.y.bits(),
              "real outward integration clamps back to identical published f32 coordinates");
      require(entity->velocity.x == 0.0 && entity->velocity.y == 0.0,
              "arena clamp clears outward velocity");
      require((entity->position_x_revision != previous_x_revision) == x
              && (entity->position_y_revision != previous_y_revision) == y,
              "intermediate integration and clamp dirty only the moved visual axes");
      check(false, x, y); // 49/28 present; camera 5/24 and dense absent
      integrate_movement(api.world(), 50.0);
      check(false, false, false); // no residual dirty after publishing
    };
    push(true, false);
    push(false, true);
    push(true, true);

    api.world().entities().get(player)->set_position(point(0.0F));
    const auto left = snapshot(api, ++sequence);
    require(left.removes(target) && !left.has(target), "clamped body leaves peer visibility");
    const auto still_outside = snapshot(api, ++sequence);
    require(!still_outside.has(target) && !still_outside.removes(target),
            "clamped body removal is published once");
    api.world().entities().get(player)->set_position(viewer);
    check(true, true, true); // unchanged body still resets every re-entry target
    check(false, false, false);
  }
}

void test_boot_and_fixture_bypass() {
  WorkerApi api;
  api.init(true);
  const auto boot = snapshot(api);
  require(boot.entities.empty() && boot.deleted.empty() && boot.events == 0U,
          "populated menu has no controlled spatial viewer");
  api.init(false);
  const auto far = mob(api, 24000.0F, 4000.0F);
  require(snapshot(api).has(far), "explicit unpopulated fixtures remain unfiltered");
  require(api.world().destroy(far), "fixture may remove bodies directly");
  require(snapshot(api, 2U).deleted.empty(), "unpopulated fixtures keep their explicit-delete contract");
}

void test_joined_population() {
  WorkerApi api;
  api.init(true);
  const auto player = join(api, -15000.0F, 1500.0F);
  const auto packet = snapshot(api);
  require(packet.has(player), "joined controlled player is always introduced");
  std::size_t mobs = 0U;
  const auto query = view(-15000.0F, 1500.0F);
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active || entity.kind != EntityKind::kMob) continue;
    if (packet.has(entity.handle)) ++mobs;
    const f32 diameter = entity.collision_radius + entity.collision_radius;
    const f32 left = entity.position.x - entity.collision_radius;
    const f32 top = entity.position.y - entity.collision_radius;
    if (Aabb{left, top, left + diameter, top + diameter}.intersects(query))
      require(packet.has(entity.handle), "every nearby mob is published");
    if (entity.children.empty())
      require(packet.has(entity.handle) == Aabb{left, top, left + diameter, top + diameter}.intersects(query),
              "unattached population body publication follows rectangle intersection");
  }
  require(mobs > 0U && packet.entities.size() < api.world().entities().active_count(),
          "joined view includes nearby mobs and excludes remote population");
}

void test_rectangle_edges() {
  WorkerApi api;
  empty_populated(api);
  (void)join(api);
  const auto box = view(-5000.0F);
  const auto right = mob(api, box.max_x.value + 10.0F);
  const auto outside = mob(api, std::nextafter(box.max_x.value + 10.0F, INFINITY));
  const auto corner = mob(api, box.min_x.value - 10.0F, box.min_y.value - 10.0F);
  const auto bottom = mob(api, -5000.0F, box.max_y.value + 10.0F);
  const auto packet = snapshot(api);
  require(packet.has(right) && packet.has(corner) && packet.has(bottom),
          "inclusive rectangle edges and AABB corners are visible");
  require(!packet.has(outside), "one f32 step outside the rectangle is excluded");
  require(packet.deleted.empty(), "never-introduced population removals are not published");
}

void test_attached_bounds() {
  WorkerApi api;
  empty_populated(api);
  (void)join(api);
  const auto parent = mob(api, -9000.0F);
  const auto child = mob(api, -5000.0F);
  const auto remote_child = mob(api, -10000.0F);
  attach_child(api.world(), parent, child);
  attach_child(api.world(), child, remote_child);
  require(snapshot(api).has(parent), "recursive attached geometry brings a remote root into view");
  detach_child(api.world(), parent, child);
  const auto detached = snapshot(api, 2U);
  require(!detached.has(parent) && detached.removes(parent), "detaching geometry removes the root from peer known");
}

void test_exit_delete_and_sparse_reentry() {
  WorkerApi api;
  empty_populated(api);
  api.set_default_dense_groups(false);
  const auto player = join(api);
  const auto nearby = mob(api, -4900.0F);
  const auto first = snapshot(api);
  for (const auto field : {5U, 8U, 24U})
    require(first.at(nearby).fields.contains(field), "initial sparse interpolation target is present");
  const auto unchanged = snapshot(api, 2U);
  for (const auto field : {5U, 8U, 24U, 59U, 60U, 61U})
    require(!unchanged.at(player).fields.contains(field), "unchanged targets do not reset client clocks");
  api.world().entities().get(player)->position = point(-10000.0F);
  const auto left = snapshot(api, 3U);
  require(left.removes(nearby) && !left.has(nearby), "leaving the query publishes a delete");
  require(!snapshot(api, 4U).removes(nearby), "out-of-view delete is emitted once");
  api.world().entities().get(player)->position = point(-5000.0F);
  const auto returned = snapshot(api, 5U);
  require(returned.has(nearby), "unchanged body re-enters visible set");
  for (const auto field : {5U, 8U, 24U})
    require(returned.at(nearby).fields.contains(field), "re-entry restores every sparse interpolation target");
}

void test_dense_and_profile_reentry() {
  WorkerApi api;
  empty_populated(api);
  const auto controlled = join(api);
  const auto other = spawn_entity(api.world(), EntityKind::kPlayer, 0U, point(-4900.0F), f32(25.0F));
  require(other.valid(), "remote player fixture spawned");
  api.world().loadout().set_score(f32(7.0F));
  const auto first = snapshot(api);
  require(first.at(other).dense_count == 1U, "first introduction contains the default dense block");
  for (const auto field : {59U, 60U, 61U})
    require(first.at(other).fields.contains(field), "initial profile and loadout targets are present");
  const auto stable = snapshot(api, 2U);
  require(stable.at(other).dense_count == 0U, "unchanged dense group is omitted");
  api.world().entities().get(controlled)->position = point(-10000.0F);
  require(snapshot(api, 3U).removes(other), "remote player leaves known set");
  api.world().entities().get(controlled)->position = point(-5000.0F);
  const auto returned = snapshot(api, 4U);
  require(returned.at(other).dense_count == 1U, "re-entry initializes the dense interpolation block");
  for (const auto field : {5U, 8U, 24U, 59U, 60U, 61U})
    require(returned.at(other).fields.contains(field), "re-entry resets sparse and profile baseline");
  require(returned.at(other).values.at(59U) == 7.0, "reintroduced score uses authoritative state");
}

void test_destroy_known_and_unseen() {
  WorkerApi api;
  empty_populated(api);
  (void)join(api);
  const auto known = mob(api, -4900.0F);
  const auto unseen = mob(api, 10000.0F);
  (void)snapshot(api);
  require(api.despawn(known) && api.despawn(unseen), "destroy both fixtures");
  const auto removed = snapshot(api, 2U);
  require(removed.deleted.size() == 1U && removed.removes(known), "only known destruction produces a delete");
  require(snapshot(api, 3U).deleted.empty(), "destroy delete is not repeated");
}

void test_death_retains_last_view_and_restart_replaces_it() {
  WorkerApi api;
  empty_populated(api);
  const auto player = join(api);
  const auto old_nearby = mob(api, -4900.0F);
  const auto origin = mob(api, 0.0F);
  const auto new_nearby = mob(api, 10000.0F);
  (void)snapshot(api);
  auto* body = api.world().entities().get(player);
  body->health = f32(0.0F);
  body->position = point(0.0F);
  const auto dying = snapshot(api, 2U);
  require(dying.has(old_nearby) && !dying.has(origin), "dead body cannot reset the retained viewer");
  require(api.despawn(player), "remove controlled body");
  const auto dead = snapshot(api, 3U);
  require(dead.has(old_nearby) && !dead.has(origin) && dead.removes(player), "post-death peer retains its final viewport");
  const std::array<std::uint8_t, 2> restart{{2U, 4U}};
  require(api.send(restart, {}), "restart input accepted");
  const auto next = api.world().player();
  require(next.valid() && next != player, "restart creates a new controlled handle");
  api.world().entities().get(next)->position = point(10000.0F);
  const auto respawn = snapshot(api, 4U);
  require(respawn.has(next) && respawn.has(new_nearby) && !respawn.has(old_nearby)
          && respawn.removes(old_nearby), "restart replaces the retained query and known set");
  for (const auto field : {5U, 8U, 24U, 59U, 60U, 61U})
    require(respawn.at(next).fields.contains(field), "new controlled handle gets initial clock and profile fields");
}

void test_active_wide_view_slot() {
  WorkerApi api;
  empty_populated(api);
  (void)join(api);
  const auto wide_only = mob(api, -3500.0F);
  require(!snapshot(api).has(wide_only), "default view excludes wide-only mob");
  require(api.world().loadout().equip(5U, 25U), "reserve view petal equipped");
  require(!snapshot(api, 2U).has(wide_only), "reserve slot does not widen view");
  require(api.world().loadout().equip(0U, 25U), "active view petal equipped");
  api.world().loadout().set_pending(0U, 0U, true);
  require(snapshot(api, 3U).has(wide_only), "active type25 widens view even while pending");
  require(api.world().loadout().equip(0U, 1U), "restore Basic slot");
  require(snapshot(api, 4U).removes(wide_only), "view contraction removes former edge entity");
}

void test_reset_clears_peer_baselines() {
  WorkerApi api;
  empty_populated(api);
  (void)join(api);
  (void)snapshot(api);
  api.init(true);
  const auto reset = snapshot(api, 2U);
  require(reset.entities.empty() && reset.deleted.empty(), "new session has neither viewer nor old known removals");
  const auto next = join(api);
  const auto introduced = snapshot(api, 3U);
  require(introduced.has(next) && introduced.at(next).dense_count == 1U, "new session initializes dense baseline");
  for (const auto field : {5U, 8U, 24U, 59U, 60U, 61U})
    require(introduced.at(next).fields.contains(field), "new session initializes sparse and profile baseline");
}
// The source oracle drives this mode with captured, encrypted production
// input. Membership comes from real publisher packets, decoded above; no
// fixture spawn or expected-membership constants are used in this replay.
int replay(const char* input_path, unsigned ticks) {
  std::ifstream input(input_path, std::ios::binary);
  require(input.good(), "open production replay input");
  const std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(input), {}};
  ByteReader reader(bytes);
  struct Input { unsigned at; std::vector<std::uint8_t> bytes; };
  std::vector<Input> packets;
  const auto count = reader.read_u32_le().value();
  require(count <= 100000U && ticks > 0U && ticks <= 100000U, "bounded replay input");
  for (unsigned index = 0; index < count; ++index) {
    const auto at = reader.read_u32_le().value();
    const auto size = reader.read_u32_le().value();
    const auto packet = reader.read_bytes(size);
    require(packet.size() == size, "complete replay input packet");
    packets.push_back({at, {packet.begin(), packet.end()}});
  }
  require(reader.error() == ParseError::kNone && reader.eof(), "complete replay input stream");
  WorkerApi api;
  api.init(true);
  std::size_t next = 0U;
  for (unsigned tick = 1U; tick <= ticks; ++tick) {
    while (next < packets.size() && packets[next].at <= tick * 50U) {
      require(api.send(packets[next].bytes, net::kPacketXorKey), "production input accepted");
      ++next;
    }
    api.think();
    const auto packet = snapshot(api, tick);
    std::printf("{\"tick\":%u,\"rng\":%u,\"player\":%u,\"visible\":[",
                tick, api.world().random().state(), api.world().player().raw);
    bool separator = false;
    for (const auto& [raw, record] : packet.entities) {
      (void)record;
      std::printf("%s%u", separator ? "," : "", raw);
      separator = true;
    }
    std::printf("],\"deleted\":[");
    separator = false;
    for (const auto raw : packet.deleted) {
      std::printf("%s%u", separator ? "," : "", raw);
      separator = true;
    }
    std::printf("]}\n");
  }
  return 0;
}
} // namespace

int main(int argc, char** argv) {
  if (argc == 4 && std::string(argv[1]) == "--replay") {
    try { return replay(argv[2], static_cast<unsigned>(std::stoul(argv[3]))); }
    catch (const std::exception& error) { std::fprintf(stderr, "%s\n", error.what()); return 1; }
  }
  const std::array tests{
    std::pair{"boot and unpopulated fixture", test_boot_and_fixture_bypass},
    std::pair{"joined population", test_joined_population},
    std::pair{"inclusive f32 rectangle edges", test_rectangle_edges},
    std::pair{"recursive attached bounds", test_attached_bounds},
    std::pair{"per-axis dirty targets, sparse", test_per_axis_dirty_targets<false, false>},
    std::pair{"per-axis dirty targets, default dense", test_per_axis_dirty_targets<false, true>},
    std::pair{"per-axis dirty targets, full framing", test_per_axis_dirty_targets<true, false>},
    std::pair{"per-axis dirty targets, full framing and dense", test_per_axis_dirty_targets<true, true>},
    std::pair{"clamped visual dirty targets, sparse", test_clamped_visual_dirty_targets<false, false>},
    std::pair{"clamped visual dirty targets, default dense", test_clamped_visual_dirty_targets<false, true>},
    std::pair{"clamped visual dirty targets, full framing", test_clamped_visual_dirty_targets<true, false>},
    std::pair{"clamped visual dirty targets, full framing and dense", test_clamped_visual_dirty_targets<true, true>},
    std::pair{"exit delete and sparse re-entry", test_exit_delete_and_sparse_reentry},
    std::pair{"dense and profile re-entry", test_dense_and_profile_reentry},
    std::pair{"known and unseen destruction", test_destroy_known_and_unseen},
    std::pair{"death retention and restart", test_death_retains_last_view_and_restart_replaces_it},
    std::pair{"active wide-view slot", test_active_wide_view_slot},
    std::pair{"session reset", test_reset_clears_peer_baselines},
  };
  std::printf("TAP version 13\n");
  unsigned failed = 0U, index = 0U;
  for (const auto& [name, run] : tests) {
    try { run(); std::printf("ok %u - %s\n", ++index, name); }
    catch (const std::exception& error) {
      ++failed;
      std::printf("not ok %u - %s\n  ---\n  message: %s\n  ...\n", ++index, name, error.what());
    }
  }
  std::printf("1..%zu\n", tests.size());
  return failed == 0U ? 0 : 1;
}
