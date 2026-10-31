void test_domain_profile_snapshot() {
  engine::WorkerApi api;
  api.init(false);
  api.set_default_dense_groups(false);
  CHECK(engine::spawn_player_default(api.world(), "profile", engine::make_default_profile(), false).valid());
  CHECK(api.world().profile().level() == 1U);
  api.world().profile().set_experience(engine::f32(3.0F));
  api.world().loadout().set_score(engine::f32(3.0F));
  const auto bytes = api.domain_snapshot_bytes(42, 0);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1U);
  (void)reader.read_varint32(); // sequence
  (void)reader.read_varint32(); // ack
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 5U); // base + XP + score + level + loadout
  CHECK(reader.read_varint32().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // radius 7
  (void)reader.read_varint32(); (void)reader.read_u16_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // visual y 28
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_u8(); // lifecycle 38
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // visual x 49
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 58U);
  CHECK(reader.read_varint32().value() == 49151U); // trunc(3*65535/4)
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 59U);
  CHECK(reader.read_f32_le().value() == 3.0F);
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 62U);
  CHECK(reader.read_u8().value() == 1U);
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 60U);
  for (unsigned slot = 0; slot < 16; ++slot) {
    CHECK(reader.read_varint32().value() == 1U);
    CHECK(reader.read_u8().value() == (slot < 5 ? 1U : 0U));
  }
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 1U); // field 61
  for (unsigned slot = 0; slot < 8; ++slot) {
    CHECK(reader.read_varint32().value() == 1U);
    CHECK(reader.read_varint32().value() == 0U); // before first loadout tick
  }
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.eof());
}

void test_player_loadout_replication() {
  engine::WorkerApi api;
  api.init(false);
  api.set_default_dense_groups(false);
  auto profile = engine::make_default_profile();
  profile.set_inventory(9U, 3U); // reserve type survives profile restoration
  const auto player = engine::spawn_player_default(api.world(), "inventory", profile, false);
  CHECK(player.valid());
  CHECK(api.world().loadout().slots()[9].type_id == 3U);
  (void)engine::refresh_loadout_petals(api.world(), 0.0);
  const auto basic = api.world().loadout().handle(0U, 0U);
  CHECK(basic.valid());
  CHECK(api.world().entities().get(basic)->radius.value == 14.0F);
  CHECK(api.world().entities().get(basic)->collision_radius.value == 10.0F);
  struct Values {
    unsigned score_count = 0, inventory_count = 0, recharge_count = 0;
    float score = -1.0F;
    std::array<std::uint8_t, 16> inventory{};
    std::array<std::uint16_t, 8> recharge{};
  };
  const auto decode = [&api, player, basic](std::uint32_t sequence) {
    Values values;
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    (void)reader.read_u8(); (void)reader.read_varint32(); (void)reader.read_varint32();
    const auto deleted = reader.read_varint32().value();
    const auto records = reader.read_varint32().value();
    CHECK(reader.read_varint32().value() == 0U);
    for (unsigned index = 0; index < deleted; ++index) {
      const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
      CHECK(api.world().entities().get(handle) == nullptr);
    }
    for (unsigned record = 0; record < records; ++record) {
      const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
      CHECK(reader.read_u8().value() == 55U);
      (void)reader.read_u32_le();
      unsigned field = 0;
      for (auto delta = reader.read_varint32().value(); delta != 0U; delta = reader.read_varint32().value()) {
        field += delta;
        if (field == 60U || field == 61U) {
          CHECK(handle == player);
          unsigned slot = 0;
          for (auto index_delta = reader.read_varint32().value(); index_delta != 0U;
               index_delta = reader.read_varint32().value()) {
            slot += index_delta;
            if (field == 60U) {
              CHECK(slot <= 16U);
              values.inventory[slot - 1U] = reader.read_u8().value();
              ++values.inventory_count;
            } else {
              CHECK(slot <= 8U);
              values.recharge[slot - 1U] = reader.read_varint32().value();
              ++values.recharge_count;
            }
          }
        } else if (field == 8U) (void)reader.read_u16_le();
        else if (field == 58U) (void)reader.read_varint32();
        else if (field == 2U || field == 9U || field == 11U || field == 12U || field == 26U || field == 31U || field == 36U || field == 38U || field == 50U || field == 62U)
          (void)reader.read_u8();
        else {
          const auto value = reader.read_f32_le().value();
          if (field == 59U) { CHECK(handle == player); values.score = value; ++values.score_count; }
          if (field == 7U && handle == basic) CHECK(value == 10.0F);
        }
      }
    }
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
    return values;
  };
  auto values = decode(1U);
  CHECK(values.inventory_count == 16U && values.inventory[9] == 3U);
  CHECK(values.recharge_count == 8U && values.recharge[0] == 65535U);
  CHECK(values.score_count == 1U && values.score == 0.0F);
  values = decode(2U);
  CHECK(values.inventory_count == 0U && values.recharge_count == 0U && values.score_count == 0U);
  api.world().loadout().set_score(engine::f32(3.0F));
  values = decode(3U);
  CHECK(values.score_count == 1U && values.score == 3.0F);
  for (unsigned i = 4U; i <= 10U; ++i) CHECK(decode(i).score_count == 0U);
  CHECK(engine::on_petal_destroyed(api.world(), basic));
  CHECK(api.world().destroy(basic));
  (void)engine::refresh_loadout_petals(api.world(), 50.0);
  values = decode(11U);
  CHECK(values.inventory_count == 0U); // inventory remains authoritative during cooldown
  CHECK(values.recharge_count == 8U && values.recharge[0] == 1310U);
  CHECK(!api.world().loadout().handle(0U, 0U).valid());
  (void)engine::refresh_loadout_petals(api.world(), 1200.0);
  CHECK(decode(12U).recharge[0] == 32767U);
  (void)engine::refresh_loadout_petals(api.world(), 1250.0);
  CHECK(decode(13U).recharge[0] == 65535U);
  CHECK(api.world().loadout().handle(0U, 0U).valid());
  for (std::uint8_t slot = 0; slot < 16U; ++slot) {
    const auto type = api.world().loadout().slots()[slot].type_id;
    if (type != 0U) CHECK(api.world().loadout().discard(api.world().profile(), slot, type));
  }
  api.world().loadout().set_score(engine::f32(0.0F));
  values = decode(14U);
  CHECK(values.inventory_count == 16U);
  for (const auto type : values.inventory) CHECK(type == 0U);
  CHECK(values.score_count == 1U && values.score == 0.0F);
  // Original aggregation takes the least ready missing instance, rather than
  // hiding recharge behind any one surviving petal in a multi-instance slot.
  CHECK(api.world().loadout().equip(0U, 17U));
  api.world().loadout().slots()[0].recharge_remaining_ms = 250.0;
  api.world().loadout().set_pending(0U, 1U, true);
  api.world().loadout().set_pending_timer(0U, 1U, 2000U);
  api.world().loadout().refresh_recharge_progress(api.world());
  values = decode(15U);
  CHECK(values.inventory[0] == 17U);
  CHECK(values.recharge[0] == 13107U);
}

void test_snapshot_angle_quantization() {
  // Values captured from original func94's new-angle packet (8555152).
  CHECK(engine::pack_snapshot_angle(1.0) == 10430U);
  CHECK(engine::pack_snapshot_angle(0.0) == 0U);
  CHECK(engine::pack_snapshot_angle(0.00005) == 0U);
  CHECK(engine::pack_snapshot_angle(-1.0) == 55104U);
  CHECK(engine::pack_snapshot_angle(3.141592653589793) == 32767U);
  CHECK(engine::pack_snapshot_angle(-3.141592653589793) == 32767U);
  CHECK(engine::pack_snapshot_angle(6.283185307179586) == 0U);
  CHECK(engine::pack_snapshot_angle(-0.00005) == 65534U);
}

void test_camera_snapshot_deltas() {
  engine::WorkerApi api;
  api.init(false);
  const auto handle = api.spawn(engine::EntityKind::kMob, 4U,
    engine::Vec2(engine::f32(7.0F), engine::f32(8.0F)));
  const auto check = [&api](unsigned sequence, bool camera_x, bool camera_y, bool dense_expected, bool angle_expected = false) {
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    (void)reader.read_u8(); (void)reader.read_varint32(); (void)reader.read_varint32();
    CHECK(reader.read_varint32().value() == 0U);
    CHECK(reader.read_varint32().value() == (dense_expected ? 2U : 1U));
    CHECK(reader.read_varint32().value() == 0U);
    (void)reader.read_u32_le(); CHECK(reader.read_u8().value() == 55U); (void)reader.read_u32_le();
    unsigned field = 0;
    bool seen_x = false, seen_y = false, visual_x = false, visual_y = false, seen_angle = false;
    for (auto delta = reader.read_varint32().value(); delta != 0U; delta = reader.read_varint32().value()) {
      field += delta;
      if (field == 8U) { (void)reader.read_u16_le(); seen_angle = true; }
      else if (field == 2U || field == 26U || field == 31U || field == 36U || field == 38U) (void)reader.read_u8();
      else {
        (void)reader.read_f32_le();
        if (field == 5U) seen_x = true;
        if (field == 24U) seen_y = true;
        if (field == 28U) visual_y = true;
        if (field == 49U) visual_x = true;
      }
    }
    CHECK(seen_x == camera_x && seen_y == camera_y);
    CHECK(visual_x == camera_x && visual_y == camera_y);
    CHECK(seen_angle == angle_expected);
    if (dense_expected) {
      (void)reader.read_u32_le(); CHECK(reader.read_u8().value() == 62U);
      for (unsigned i = 0; i < 63U; ++i) (void)reader.read_u8();
    }
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
  };
  check(1U, true, true, true, true);
  check(2U, false, false, false);
  api.world().entities().get(handle)->position.y = engine::f32(9.0F);
  check(3U, false, true, false);
  api.world().entities().get(handle)->position.x = engine::f32(6.0F);
  check(4U, true, false, false);
  api.world().entities().get(handle)->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  check(5U, true, true, false);
  api.world().entities().get(handle)->position.x = engine::f32(-0.0F);
  check(6U, true, false, false);
  api.world().entities().get(handle)->angle = engine::f32(1.0F);
  check(7U, false, false, false, true);
  api.world().entities().get(handle)->angle = engine::f32(1.000001F);
  check(8U, false, false, false); // different scalar, same encoded u16
  api.world().entities().get(handle)->angle = engine::f32(2.0F);
  api.world().entities().get(handle)->position = engine::Vec2(engine::f32(3.0F), engine::f32(4.0F));
  check(9U, true, true, true, true);
}

void test_pickup_transfer_snapshot() {
  engine::WorkerApi api;
  api.init(false);
  CHECK(engine::spawn_player(api.world(), "pickup", engine::Vec2{}, engine::PlayerConfig{}).valid());
  const auto drop = engine::spawn_drop(api.world(), 2U, engine::Vec2{});
  CHECK(drop.valid());
  (void)api.domain_snapshot_bytes(1U, 0U);
  // simulation-tick.mjs:925 gates collection at spawn+500ms. The first
  // nine snapshots must retain the drop without publishing a transfer.
  for (std::uint32_t sequence = 2U; sequence <= 10U; ++sequence) {
    api.think();
    const auto waiting = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader waiting_header(waiting);
    (void)waiting_header.read_u8(); (void)waiting_header.read_varint32();
    (void)waiting_header.read_varint32();
    CHECK(waiting_header.read_varint32().value() == 0U);
    CHECK(waiting_header.read_varint32().value() > 0U);
    CHECK(waiting_header.read_varint32().value() == 0U);
    CHECK(!api.world().entities().get(drop)->pickup_collected);
  }
  api.think();
  const auto bytes = api.domain_snapshot_bytes(11U, 0U);
  engine::ByteReader header(bytes);
  (void)header.read_u8(); (void)header.read_varint32(); (void)header.read_varint32();
  CHECK(header.read_varint32().value() == 0U);
  (void)header.read_varint32();
  CHECK(header.read_varint32().value() == 1U);
  engine::ByteReader event(std::span<const std::uint8_t>(bytes).last(6U));
  CHECK(event.read_u8().value() == 14U);
  CHECK(event.read_u32_le().value() == drop.to_wire());
  CHECK(event.read_u8().value() == 0U);
  CHECK(event.eof());
  CHECK(api.world().entities().get(drop)->pickup_collected);
  CHECK(api.world().loadout().slots()[0].type_id == 2U);
  CHECK(api.world().loadout().pickup_transfers().empty());
  const auto next = api.domain_snapshot_bytes(12U, 0U);
  engine::ByteReader next_header(next);
  (void)next_header.read_u8(); (void)next_header.read_varint32(); (void)next_header.read_varint32();
  (void)next_header.read_varint32(); (void)next_header.read_varint32();
  CHECK(next_header.read_varint32().value() == 0U);
}

void test_domain_boot_visibility() {
  engine::WorkerApi api;
  api.init(true);
  const auto population = api.world().entities().active_count();
  CHECK(population > 800U);
  for (std::uint32_t sequence = 1; sequence <= 3; ++sequence) {
    api.think();
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    CHECK(reader.read_u8().value() == 1U);
    CHECK(reader.read_varint32().value() == sequence);
    CHECK(reader.read_varint32().value() == 0U);
    CHECK(reader.read_varint32().value() == 0U); // deletes
    CHECK(reader.read_varint32().value() == 0U); // spatial updates
    CHECK(reader.read_varint32().value() == 0U); // spatial events
    CHECK(api.world().entities().active_count() == population);
  }
  const std::array<std::uint8_t, 3> spawn_packet{{1U, 6U, 0U}};
  CHECK(api.send(spawn_packet, {}));
  api.think();
  const auto player = api.world().player();
  const auto* controlled = api.world().entities().get(player);
  CHECK(controlled != nullptr);
  if (controlled == nullptr) return;
  CHECK(controlled->health.value > 0.0F);
  // Original beginSnapshot uses the live viewer's f32 rectangle, not every
  // simulated body. Compare exact membership, independently of wire count:
  // one handle may have base, dense, profile and loadout records.
  const engine::f32 width = engine::f32(1920.0F) / engine::f32(0.9F) + engine::f32(200.0F);
  const engine::f32 height = engine::f32(1080.0F) / engine::f32(0.9F) + engine::f32(200.0F);
  const engine::f32 left = width * engine::f32(-0.5F) + controlled->position.x;
  const engine::f32 top = height * engine::f32(-0.5F) + controlled->position.y;
  const engine::Aabb query{left, top, left + width, top + height};
  std::set<std::uint32_t> expected{player.raw};
  unsigned nearby_mobs = 0U, remote_mobs = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active) continue;
    const auto bounds = engine::collision_bounds(api.world(), entity.handle);
    const bool intersects = engine::Aabb{bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y}.intersects(query);
    if (intersects) expected.insert(entity.handle.raw);
    if (entity.kind == engine::EntityKind::kMob) {
      if (intersects) ++nearby_mobs;
      else ++remote_mobs;
    }
  }
  CHECK(nearby_mobs > 0U && remote_mobs > 0U);
  CHECK(expected.size() < api.world().entities().active_count());
  const auto bytes = api.domain_snapshot_bytes(4U, 0U);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1U);
  CHECK(reader.read_varint32().value() == 4U);
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 0U);
  const auto records = reader.read_varint32().value();
  CHECK(reader.read_varint32().value() == 0U);
  std::set<std::uint32_t> introduced;
  unsigned dense_records = 0U, base_records = 0U;
  for (std::uint32_t index = 0; index < records; ++index) {
    const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
    CHECK(expected.contains(handle.raw));
    introduced.insert(handle.raw);
    const auto flags = reader.read_u8().value() ^ 54U;
    if (flags == 8U) {
      CHECK(reader.read_bytes(63U).size() == 63U);
      ++dense_records;
      continue;
    }
    CHECK(flags == 1U);
    if (flags != 1U) return;
    const auto component_mask = reader.read_u32_le().value();
    const auto* entity = api.world().entities().get(handle);
    CHECK(component_mask == engine::SnapshotEncoder::kDefaultDenseComponentMask
      || (entity != nullptr && entity->kind == engine::EntityKind::kPetal
          && component_mask == (engine::SnapshotEncoder::kDefaultDenseComponentMask | (1U << 6U))));
    std::uint32_t field = 0U;
    for (auto delta = reader.read_varint32().value(); delta != 0U;
         delta = reader.read_varint32().value()) {
      field += delta;
      switch (field) {
        case 2: ++base_records; [[fallthrough]];
        case 9: case 11: case 12: case 22: case 26: case 31: case 36: case 38: case 54: case 62:
          (void)reader.read_u8().value(); break;
        case 50:
          CHECK(entity != nullptr && entity->kind == engine::EntityKind::kPetal);
          CHECK(reader.read_u8().value() == entity->type_id); break;
        case 5: case 7: case 24: case 28: case 49: case 53: case 55: case 59:
          (void)reader.read_f32_le().value(); break;
        case 8: (void)reader.read_u16_le().value(); break;
        case 58: (void)reader.read_varint32().value(); break;
        case 60: case 61:
          for (auto step = reader.read_varint32().value(); step != 0U;
               step = reader.read_varint32().value()) {
            if (field == 60U) (void)reader.read_u8().value();
            else (void)reader.read_varint32().value();
          }
          break;
        default: CHECK(false); return;
      }
    }
  }
  CHECK(introduced == expected);
  CHECK(base_records == expected.size());
  CHECK(dense_records == expected.size());
  CHECK(reader.error() == engine::ParseError::kNone && reader.eof());
}

void test_domain_snapshot() {
  engine::WorkerApi api;
  api.init();
  api.set_default_dense_groups(false);
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(123.0F), engine::f32(-45.0F)));
  CHECK(mob.valid());
  engine::Entity* entity = api.world().entities().get(mob);
  entity->health = engine::f32(17.0F);
  entity->max_health = engine::f32(25.0F);
  api.world().record_hit(mob, mob, engine::f32(3.0F), engine::f32(17.0F));
  const auto bytes = api.domain_snapshot_bytes(42, 7);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 42);
  CHECK(reader.read_varint32().value() == 7);
  CHECK(reader.read_varint32().value() == 0); // deletes
  CHECK(reader.read_varint32().value() == 1); // updates
  CHECK(reader.read_varint32().value() == 1); // hit clock only; event 14 is a slot transfer
  CHECK(reader.read_u32_le().value() == mob.to_wire());
  CHECK(reader.read_u8().value() == 55); // mask
  constexpr std::uint32_t kMask = (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  CHECK(reader.read_u32_le().value() == kMask);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_u8().value() == 4); // species id
  CHECK(reader.read_varint32().value() == 3);
  CHECK(reader.read_f32_le().value() == 123.0F);
  CHECK(reader.read_varint32().value() == 2); // field 7: radius
  CHECK(reader.read_f32_le().value() == entity->radius.value);
  CHECK(reader.read_varint32().value() == 1);
  (void)reader.read_u16_le(); // angle raw
  CHECK(reader.read_varint32().value() == 16);
  CHECK(reader.read_f32_le().value() == -45.0F);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_u8().value() == 2); // domain kind = mob
  CHECK(reader.read_varint32().value() == 2); // field 28: visual y
  CHECK(reader.read_f32_le().value() == -45.0F);
  CHECK(reader.read_varint32().value() == 3);
  (void)reader.read_u8(); // variant
  CHECK(reader.read_varint32().value() == 5); // field 36: activity
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_varint32().value() == 2); // field 38: lifecycle
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_varint32().value() == 11); // field 49: visual x
  CHECK(reader.read_f32_le().value() == 123.0F);
  CHECK(reader.read_varint32().value() == 4);
  CHECK(reader.read_f32_le().value() == 17.0F);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_f32_le().value() == 25.0F);
  CHECK(reader.read_u8().value() == 0);
  CHECK(reader.read_u8().value() == 11); // hit event opcode
  CHECK(reader.read_u32_le().value() == mob.to_wire());
  CHECK(reader.eof());
}
