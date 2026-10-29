void test_domain_dense_live_values() {
  engine::WorkerApi api;
  api.init();
  api.set_default_dense_groups(false);
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)));
  CHECK(mob.valid());
  const auto compact = api.domain_snapshot_bytes(60, 0);
  engine::ByteReader compact_reader(compact);
  CHECK(compact_reader.read_u8().value() == 1);
  (void)compact_reader.read_varint32();
  (void)compact_reader.read_varint32();
  CHECK(compact_reader.read_varint32().value() == 0);
  CHECK(compact_reader.read_varint32().value() == 1);

  // A configured byte group is appended after the compact domain record.
  CHECK(api.set_snapshot_groups(mob, 1U << 1)); // group 56
  CHECK(api.set_snapshot_byte(mob, 1U, 7U));
  const auto dense = api.domain_snapshot_bytes(61, 0);
  CHECK(!dense.empty()); // unchanged camera targets are now omitted
  engine::ByteReader reader(dense);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 61);
  (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 2);
}
void test_default_dense_groups() {
  engine::WorkerApi api;
  api.init();
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(7.0F), engine::f32(8.0F)));
  CHECK(mob.valid());
  CHECK(api.default_dense_groups());
  const auto bytes = api.domain_snapshot_bytes(62, 0);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 62);
  (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 0);
  // Compact declaration plus a complete mask-selected dense payload.
  CHECK(reader.read_varint32().value() == 2);
  api.set_default_dense_groups(false);
  const auto compact = api.domain_snapshot_bytes(63, 0);
  CHECK(compact.size() < bytes.size());
}

void test_domain_dense_player_wire_boundaries() {
  engine::WorkerApi api;
  api.init(false);
  // Put another entity after the player: the old writer consumed the next
  // handle's first three bytes as the player's missing group-152 payload.
  const auto player = engine::spawn_player_default(api.world(), "wire",
    engine::make_default_profile(), false);
  CHECK(player.valid());
  const auto mob = api.spawn(engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(12345.0F), engine::f32(-321.0F)));
  CHECK(mob.valid());
  CHECK(api.world().loadout().equip(2U, 3U));
  CHECK(api.world().loadout().create_equipped_petal(api.world(), 2U, 0U));
  const auto petal = api.world().loadout().handle(2U, 0U);
  CHECK(petal.valid());
  api.world().profile().set_experience(engine::f32(3.0F));
  api.world().loadout().set_score(engine::f32(9.0F));
  api.world().apply_input(3U, engine::f32(1.0F), engine::f32(0.0F));
  for (std::uint32_t sequence : {127U, 128U, 256U}) {
    if (sequence == 127U) {
      // Health alone is not the visual lifecycle flag.
      api.world().entities().get(petal)->health = engine::f32(0.0F);
      CHECK(!api.world().entities().get(petal)->death_processed);
    } else if (sequence == 128U) {
      engine::kill_entity(api.world(), petal);
      CHECK(api.world().entities().get(petal)->death_processed);
    }
    const auto bytes = api.domain_snapshot_bytes(sequence, 7U);
    engine::ByteReader reader(bytes);
    CHECK(reader.read_u8().value() == 1U);
    CHECK(reader.read_varint32().value() == sequence);
    CHECK(reader.read_varint32().value() == 7U);
    CHECK(reader.read_varint32().value() == 0U); // deletes
    const unsigned expected_records = sequence == 127U ? 13U : 8U;
    CHECK(reader.read_varint32().value() == expected_records);
    CHECK(reader.read_varint32().value() == 0U); // events
    unsigned dense_count = 0;
    unsigned profile_count = 0;
    unsigned loadout_count = 0;
    unsigned lifecycle_count = 0;
    unsigned inventory_count = 0, recharge_count = 0;
    unsigned render_count = 0;
    for (unsigned record = 0; record < expected_records; ++record) {
      const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
      const auto* entity = api.world().entities().get(handle);
      CHECK(entity != nullptr);
      if (entity == nullptr) return;
      const auto flags = reader.read_u8().value() ^ 54U;
      if ((flags & 8U) != 0U) {
        CHECK(flags == 8U); // group 152 base, no profile extension
        const auto start = reader.cursor();
        // Decode by component order, independently of the writer, through EOF.
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->entity_flags));
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->world_flags));
        CHECK(reader.read_u8().value() == entity->ai.activity_flags);
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->world_flags));
        CHECK(reader.read_f32_le().value() == entity->position.x.value);
        CHECK(reader.read_cstring().value().empty());
        for (unsigned index = 0; index < 10; ++index) CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_f32_le().value() == 0.0F);
        CHECK(reader.read_f32_le().value() == entity->position.y.value);
        CHECK(reader.read_f32_le().value() == 0.0F);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u32_le().value() == 0U);
        CHECK(reader.read_f32_le().value() == entity->health.value);
        CHECK(reader.read_f32_le().value() == entity->max_health.value);
        (void)reader.read_u16_le();
        CHECK(reader.read_f32_le().value() == entity->position.y.value); // field 28
        CHECK(reader.read_f32_le().value() == entity->position.x.value); // field 49
        CHECK(reader.read_f32_le().value() == entity->collision_radius.value); // field 7, group 140
        CHECK(reader.read_u8().value() == (handle == player ? 40U : entity->type_id));
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->kind));
        CHECK(reader.read_u8().value() == (handle == player ? 3U : entity->loadout_instance));
        CHECK(reader.cursor() - start == 63U);
        ++dense_count;
      } else {
        CHECK(flags == 1U);
        // All profile records preserve the entire dense declaration, not just
        // bit 29. The last declaration determines the following dense length.
        const auto component_mask = reader.read_u32_le().value();
        CHECK(component_mask == engine::SnapshotWriter::kDefaultDenseComponentMask
          || (handle == petal && component_mask ==
              (engine::SnapshotWriter::kDefaultDenseComponentMask | (1U << 6U))));
        std::uint32_t field = 0;
        for (auto delta = reader.read_varint32().value(); delta != 0U;
             delta = reader.read_varint32().value()) {
          field += delta;
          if (field == 2U || field == 11U || field == 12U || field == 26U || field == 31U || field == 36U || field == 38U || field == 50U || field == 62U) {
            const auto value = reader.read_u8().value();
            if (field == 2U) CHECK(value == (handle == player ? 40U : entity->type_id));
            if (field == 11U) { CHECK(handle == petal); CHECK(value == 2U); ++loadout_count; }
            if (field == 12U) { CHECK(handle == petal); CHECK(value == 0U); ++loadout_count; }
            if (field == 26U) CHECK(value == static_cast<std::uint8_t>(entity->kind));
            if (field == 31U) CHECK(value == (handle == player ? 3U : entity->loadout_instance));
            if (field == 38U) {
              CHECK(value == (entity->death_processed ? 1U : 0U));
              if (handle == petal) CHECK(value == (sequence == 127U ? 0U : 1U));
              ++lifecycle_count;
            }
            if (field == 62U) { CHECK(handle == player); CHECK(value == 1U); ++profile_count; }
            if (field == 50U) {
              CHECK(handle == petal && value == 3U);
              CHECK((component_mask & (1U << 6U)) != 0U);
              ++render_count;
            }
          } else if (field == 5U || field == 7U || field == 24U || field == 28U || field == 49U
                     || field == 53U || field == 55U || field == 59U) {
            const auto value = reader.read_f32_le().value();
            if (field == 7U) CHECK(value == entity->collision_radius.value);
            if (field == 28U) CHECK(value == entity->position.y.value);
            if (field == 49U) CHECK(value == entity->position.x.value);
            if (field == 59U) { CHECK(handle == player); CHECK(value == 9.0F); ++profile_count; }
          } else if (field == 8U) {
            (void)reader.read_u16_le();
          } else if (field == 58U) {
            CHECK(handle == player);
            CHECK(reader.read_varint32().value() == 49151U);
            ++profile_count;
          } else if (field == 60U || field == 61U) {
            CHECK(handle == player);
            unsigned slot = 0;
            for (auto index_delta = reader.read_varint32().value(); index_delta != 0U;
                 index_delta = reader.read_varint32().value()) {
              CHECK(index_delta == 1U);
              const auto value = field == 60U ? reader.read_u8().value() : reader.read_varint32().value();
              if (field == 60U) {
                CHECK(value == api.world().loadout().slots()[slot].type_id);
                ++inventory_count;
              } else { CHECK(value == 0U); ++recharge_count; }
              ++slot;
            }
          } else { CHECK(false); return; }
        }
      }
    }
    CHECK(dense_count == (sequence == 127U ? 3U : 0U));
    CHECK(profile_count == (sequence == 127U ? 3U : 2U));
    CHECK(inventory_count == (sequence == 127U ? 16U : 0U));
    CHECK(recharge_count == (sequence == 127U ? 8U : 0U));
    CHECK(loadout_count == 2U);
    CHECK(lifecycle_count == 3U);
    CHECK(render_count == 1U);
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
  }
}

void test_full_field_framing() {
  engine::WorkerApi api;
  api.init();
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(5.0F), engine::f32(6.0F)));
  CHECK(mob.valid());
  const auto compact = api.domain_snapshot_bytes(70, 0);
  api.set_full_field_framing(true);
  const auto full = api.domain_snapshot_bytes(71, 0);
  CHECK(full.size() > compact.size());
  engine::ByteReader reader(full);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 71);
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 0); // deletes
  const auto updates = reader.read_varint32();
  CHECK(updates.has_value());
  CHECK(updates.value() > 75); // full nonplayer fields; player arrays are not fabricated
  CHECK(reader.read_varint32().value() == 0); // events
}

void test_full_field_effect_flags() {
  engine::WorkerApi api;
  api.init(false);
  api.set_full_field_framing(true);
  api.set_default_dense_groups(false);
  const auto mob = api.spawn(engine::EntityKind::kMob, 4U, {});
  auto* entity = api.world().entities().get(mob);
  entity->spawn_band = 7U;
  for (const std::uint8_t flags : {0U, 1U, 4U}) {
    entity->effect_flags = flags;
    const auto packet = api.domain_snapshot_bytes(1U);
    // Every full sparse field is a self-contained mask record. Match the exact
    // field14 record including handle/mask, rather than an unrelated byte.
    engine::ByteWriter expected;
    expected.write_u32_le(mob.to_wire()); expected.write_u8(55U);
    expected.write_u32_le((1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29));
    expected.write_varint32(14U); expected.write_u8(flags); expected.write_u8(0U);
    CHECK(std::search(packet.begin(), packet.end(), expected.bytes().begin(), expected.bytes().end()) != packet.end());
  }
}

void test_input_discard_deletion_then_swap() {
  engine::WorkerApi api;
  api.init(false);
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  const auto send = [&api, &key](engine::ByteWriter& writer) {
    auto packet = writer.bytes(); engine::apply_packet_xor(packet, key);
    CHECK(api.send(packet, key));
  };
  engine::ByteWriter spawn;
  spawn.write_varint32(1U); spawn.write_varint32(6U);
  for (const char byte : std::string("deletion")) spawn.write_u8(static_cast<std::uint8_t>(byte));
  spawn.write_u8(0U); send(spawn);
  (void)api.domain_snapshot_bytes(1U);
  const auto discarded = api.world().loadout().handle(2U, 0U);
  CHECK(discarded.valid());
  engine::ByteWriter discard;
  discard.write_varint32(2U); discard.write_varint32(8U);
  discard.write_varint32(2U); discard.write_varint32(1U); send(discard);
  // Original125 damages the slot occupant through43. Its healthless body
  // remains visible for1000ms, then the ordinary removal is replicated.
  const auto* discarded_body = api.world().entities().get(discarded);
  CHECK(discarded_body != nullptr);
  CHECK(discarded_body != nullptr && discarded_body->health.value == 0.0F);
  for (int tick = 0; tick < 19; ++tick) api.think();
  CHECK(api.world().entities().get(discarded) != nullptr);
  api.think();
  CHECK(api.world().entities().get(discarded) == nullptr);
  api.enqueue_domain_snapshot(2U);
  const auto output = api.flush();
  CHECK(output.size() == 1U);
  engine::ByteReader reader(output.front().payload);
  CHECK(reader.read_u8().value() == 1U);
  (void)reader.read_varint32(); (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 1U);
  (void)reader.read_varint32(); (void)reader.read_varint32(); // update/event counts precede delete payload
  CHECK(reader.read_u32_le().value() == discarded.to_wire());
  const auto moved = api.world().loadout().handle(0U, 0U);
  engine::ByteWriter swap;
  swap.write_varint32(3U); swap.write_varint32(10U);
  for (const unsigned value : {0U, 1U, 2U, 0U}) swap.write_varint32(value);
  send(swap);
  api.think();
  // Original swap is two changeSlotType calls: the old slot-0 petal is retired
  // and the incoming slot-2 petal waits out a full recharge before spawning.
  CHECK(!api.world().loadout().handle(2U, 0U).valid());
  CHECK(api.world().loadout().pending(2U, 0U));
  CHECK(api.world().loadout().slots()[2].type_id == 1U);
  unsigned count = 0U, slot2 = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F || entity.kind != engine::EntityKind::kPetal) continue;
    ++count; if (entity.loadout_slot == 2U) ++slot2;
    CHECK(entity.handle != discarded);
    CHECK(entity.handle != moved);
  }
  CHECK(count == 3U && slot2 == 0U);
  CHECK(engine::refresh_loadout_petals(api.world(), 3000.0) == 1U);
  CHECK(api.world().loadout().handle(2U, 0U).valid());
  count = 0U; slot2 = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F || entity.kind != engine::EntityKind::kPetal) continue;
    ++count; if (entity.loadout_slot == 2U) ++slot2;
  }
  CHECK(count == 4U && slot2 == 1U);
  const auto next = api.domain_snapshot_bytes(3U);
  engine::ByteReader next_reader(next);
  (void)next_reader.read_u8(); (void)next_reader.read_varint32(); (void)next_reader.read_varint32();
  CHECK(next_reader.read_varint32().value() == 0U);
}
