void test_world_initialize() {
  engine::World world;
  world.initialize();
  CHECK(world.initialized());
  CHECK(world.entities().active_count() == 0);
  CHECK(world.entities().entities()[0].handle.raw == 1048936448U);
  CHECK(world.entities().entities()[0].handle.index() == 0);
  std::set<std::uint32_t> handles;
  for (const auto& entity : world.entities().entities()) {
    CHECK(entity.handle.index() < engine::kEntitySlotCount);
    CHECK(entity.handle.generation() != 0);
    handles.insert(entity.handle.raw);
  }
  CHECK(handles.size() == engine::kEntitySlotCount);
  engine::MinstdRng expected(0);
  for (std::uint32_t index = 0; index < engine::kEntitySlotCount; ++index) {
    std::uint32_t generation = 0;
    do { generation = expected.next_generation(); } while ((generation & 262143U) == 0U);
  }
  CHECK(world.rng().state() == expected.state());
  CHECK(world.rng().state() == 11065635568950165505ULL); // frozen initial RNG state
  CHECK(world.random().state() == 285456437U); // post-constructor RNG state
  CHECK(!world.components().has(0));
  world.apply_input(3, engine::f32(7000.0F), engine::f32(-2.0F));
  CHECK(world.input().buttons == 3);
  CHECK(std::fabs(world.input().normalized_angle.value - 0.5315678F) < 1e-6F);
  CHECK(world.input().strength.value == 0.0F);
  CHECK(world.input().direction == 21U);
  CHECK(engine::pack_direction(engine::f32(0.0F)) == 0U);
  CHECK(engine::pack_direction(engine::f32(1.0F)) == 40U);
  CHECK(engine::pack_direction(engine::f32(-1.0F)) == 214U);
  CHECK(engine::pack_direction(engine::f32(3.141592653589793F)) == 127U);
}

void test_player_input_appearance() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  world.apply_input(3U, engine::f32(1.0F), engine::f32(0.0F));
  const auto player = engine::spawn_player_default(world, "appearance",
    engine::make_default_profile(), false);
  auto* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->player_look == 0U);
  CHECK(entity->player_expression == 0U);
  entity->player_expression = 0xA0U;
  for (std::uint32_t buttons : {0U, 1U, 2U, 3U, 4U, 5U, 0U, 0x10000000U}) {
    world.apply_input(buttons, engine::f32(1.0F), engine::f32(0.0F));
    CHECK(entity->player_look == 40U);
    CHECK(entity->player_expression == (0xA0U | (buttons & 3U)));
    CHECK(entity->type_id == 0U);
  }
  world.apply_input(2U, engine::f32(-1.0F), engine::f32(0.0F));
  CHECK(entity->player_look == 214U);
  CHECK(entity->player_expression == 0xA2U);
  CHECK(world.destroy(player));
  const auto respawned = engine::spawn_player_default(world, "appearance",
    engine::make_default_profile(), false);
  entity = world.entities().get(respawned);
  CHECK(entity != nullptr);
  CHECK(entity->player_look == 0U);
  CHECK(entity->player_expression == 0U);
}

void test_state_dump() {
  engine::WorkerApi api;
  api.init();
  CHECK(api.dump_state(nullptr, 0) == 0U);
  const auto spawned = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(12.5F), engine::f32(-3.25F)));
  CHECK(spawned.valid());
  CHECK(api.dump_state(nullptr, 0) == 1U);
  std::array<std::uint8_t, 48> record{};
  CHECK(api.dump_state(record.data(), 1) == 1U);
  std::uint32_t handle = 0;
  std::uint16_t type = 0;
  std::uint8_t kind = 0;
  float x = 0.0F, y = 0.0F;
  std::memcpy(&handle, record.data(), 4);
  std::memcpy(&type, record.data() + 4, 2);
  std::memcpy(&kind, record.data() + 6, 1);
  std::memcpy(&x, record.data() + 8, 4);
  std::memcpy(&y, record.data() + 12, 4);
  CHECK(handle == spawned.raw);
  CHECK(type == 4U);
  CHECK(kind == static_cast<std::uint8_t>(engine::EntityKind::kMob));
  CHECK(x == 12.5F);
  CHECK(y == -3.25F);
  // R01 diagnostic tail: velocity/acceleration are exposed for the state trace.
  float vx = 0.0F, vy = 0.0F, ax = 0.0F, ay = 0.0F;
  std::memcpy(&vx, record.data() + 32, 4);
  std::memcpy(&vy, record.data() + 36, 4);
  std::memcpy(&ax, record.data() + 40, 4);
  std::memcpy(&ay, record.data() + 44, 4);
  CHECK(vx == 0.0F && vy == 0.0F && ax == 0.0F && ay == 0.0F);
}

void test_worker_api() {
  engine::WorkerApi populated;
  populated.init(true);
  CHECK(populated.world().initialized());
  CHECK(populated.world().entities().active_count() == 866U);
  CHECK(populated.world().random().state() == 787621659U);

  engine::WorkerApi api;
  api.init();
  CHECK(api.world().initialized());
  api.think();
  CHECK(api.flush().empty());

  engine::ByteWriter writer;
  writer.write_varint32(1);
  writer.write_varint32(12);
  writer.write_varint32(5);
  writer.write_f32_le(0.0F);
  writer.write_f32_le(1.0F);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  CHECK(api.send(packet, key));
  CHECK(api.world().input().buttons == 5);
  CHECK(api.world().input().strength.value == 1.0F);
  CHECK(api.world().input().direction == 0U);
  CHECK(api.last_sequence() == 1);
  CHECK(api.send(packet, key)); // duplicate sequence is ignored, not a decode failure

  for (int tick = 0; tick < 1000; ++tick) api.think();
  CHECK(api.world().initialized());
  CHECK(api.world().entities().active_count() == 0);

  const auto spawned = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(spawned.valid());
  CHECK(api.occupied(engine::Vec2(engine::f32(100.0F), engine::f32(0.0F))));
  CHECK(!api.occupied(engine::Vec2(engine::f32(2000.0F), engine::f32(0.0F))));
  CHECK(!api.spawn(engine::EntityKind::kMob, 0, engine::Vec2(engine::f32(5000.0F), engine::f32(0.0F))).valid());
  const auto bytes = api.domain_snapshot_bytes(7, 0);
  CHECK(bytes.size() > 2);
  engine::ByteReader domain_reader(bytes);
  CHECK(domain_reader.read_u8().value() == 1);
  CHECK(domain_reader.read_varint32().value() == 7);

  CHECK(api.despawn(spawned));
  CHECK(!api.occupied(engine::Vec2(engine::f32(0.0F), engine::f32(0.0F))));
}

void test_rock_construction() {
  engine::ServerRng rng(1383144482U);
  (void)rng.next(); // function 144's three pre-configure draws
  (void)rng.next();
  (void)rng.next();
  const engine::RockBody body = engine::configure_rock(rng, false);
  CHECK(body.radius.value == 39.513580322265625F);
  CHECK(body.health.value == 15.805432319641113F);
  CHECK(rng.state() == 2095254635U);

  engine::World world;
  world.initialize();
  engine::ServerRng spawn_rng(1383144482U);
  (void)spawn_rng.next();
  (void)spawn_rng.next();
  (void)spawn_rng.next();
  const auto handle = engine::spawn_rock(world, engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), false, spawn_rng);
  CHECK(handle.valid());
  const auto* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->type_id == 1);
  CHECK(entity->radius.value == 39.513580322265625F);
  CHECK(entity->health.value == 15.805432319641113F);
  CHECK(entity->contact_damage.value == 10.0F);
  CHECK(entity->world_flags == 75);
  CHECK(entity->entity_flags == 96);
  CHECK(entity->component_flags92 == 4);

  engine::World band_world;
  band_world.initialize();
  band_world.random().seed(787621659U);
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  const auto band_handle = engine::spawn_from_band_with_component_draws(band_world, table, 0,
    [](const engine::SpawnPosition&) { return false; });
  CHECK(band_handle.valid());
  const auto* band_entity = band_world.entities().get(band_handle);
  CHECK(band_entity != nullptr);
  CHECK(band_entity->type_id == 1);
  CHECK(band_entity->radius.value == 39.513580322265625F);
  CHECK(band_world.random().state() == 2095254635U);
}

void test_entity_spawn_defaults() {
  const auto* cactus = engine::Catalog::instance().spawn_defaults(3);
  CHECK(cactus != nullptr);
  CHECK(cactus->radius == 49.99694061279297F);
  CHECK(cactus->contactDamage == 30.0F);
  CHECK(cactus->flags95 == 75);
  CHECK(cactus->flags93 == 96);
  CHECK(cactus->dynamicRadius);

  engine::World world;
  world.initialize();
  CHECK(engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 3,
    engine::Vec2(engine::f32(10.0F), engine::f32(20.0F))).valid());
  CHECK(engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F))).valid());
}

void test_spatial_query() {
  engine::SpatialQuery query;
  engine::CollisionBody body;
  body.position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  body.radius = engine::f32(10.0F);
  body.world_flags = 32;
  query.add(body);
  const engine::SpawnPosition origin{engine::f32(0.0F), engine::f32(0.0F)};
  CHECK(query.occupied(origin));
  CHECK(query.occupied({engine::f32(500.0F), engine::f32(0.0F)}));
  CHECK(!query.occupied({engine::f32(700.0F), engine::f32(0.0F)}));
  query.rebuild();
  CHECK(query.occupied(origin));
  CHECK(query.size() == 1);

  // The index must cover the whole 50000x4000 arena, not just the origin box.
  engine::SpatialQuery far;
  far.add({{engine::f32(20000.0F), engine::f32(1000.0F)}, engine::f32(10.0F), 32, 32});
  CHECK(far.occupied({engine::f32(20000.0F), engine::f32(1000.0F)}));
  CHECK(!far.occupied(origin));
  std::vector<engine::EntityHandle> circle_hits;
  far.query_circle(engine::Vec2(engine::f32(20000.0F), engine::f32(1000.0F)),
                   engine::f32(100.0F), circle_hits);
  CHECK(circle_hits.size() == 1U);

  query.clear();
  body.world_flags = 0;
  body.entity_flags = 0;
  query.add(body);
  CHECK(!query.occupied({engine::f32(50.0F), engine::f32(0.0F)}));
  body.entity_flags = 32;
  query.clear();
  query.add(body);
  CHECK(query.occupied({engine::f32(50.0F), engine::f32(0.0F)}));
  CHECK(!query.occupied({engine::f32(200.0F), engine::f32(0.0F)}));

  engine::World world;
  world.initialize();
  const auto entity = engine::spawn_entity(world, engine::EntityKind::kMob, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::f32(10.0F), 32, 32);
  CHECK(entity.valid());
  const engine::SpatialQuery from_world = engine::SpatialQuery::from_world(world);
  CHECK(from_world.size() == 1);
  CHECK(from_world.occupied({engine::f32(0.0F), engine::f32(0.0F)}));
  CHECK(from_world.occupied({engine::f32(500.0F), engine::f32(0.0F)}));
  CHECK(!from_world.occupied({engine::f32(700.0F), engine::f32(0.0F)}));

  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  engine::World empty_world;
  empty_world.initialize();
  const engine::SpatialQuery empty_query;
  int spawned_calls = 0;
  const auto live_spawn = engine::spawn_from_band(empty_world, table, 0, empty_query,
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      ++spawned_calls;
      return engine::spawn_entity(empty_world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F), 32, 32);
    });
  CHECK(live_spawn.valid());
  CHECK(spawned_calls == 1);

  engine::SpatialQuery blocked;
  blocked.add({{engine::f32(0.0F), engine::f32(0.0F)}, engine::f32(100000.0F), 32, 32});
  engine::World blocked_world;
  blocked_world.initialize();
  int blocked_calls = 0;
  const auto blocked_spawn = engine::spawn_from_band(blocked_world, table, 0, blocked,
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      ++blocked_calls;
      return engine::spawn_entity(blocked_world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F), 32, 32);
    });
  CHECK(!blocked_spawn.valid());
  CHECK(blocked_calls == 0);
}

void test_component_store() {
  engine::ComponentStore store;
  CHECK(!store.has(4));
  auto& positions = store.pool<engine::Vec2>(4);
  CHECK(store.has(4));
  const auto first = positions.attach(engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)));
  CHECK(first.has_value());
  CHECK(store.has(4));
  CHECK(positions.capacity() == 1);
  CHECK(positions.get(*first)->x.value == 1.0F);
  positions.release(*first);
  CHECK(positions.free_count() == 1);
  const auto reused = positions.attach(engine::Vec2(engine::f32(3.0F), engine::f32(4.0F)));
  CHECK(reused.has_value());
  CHECK(*reused == *first);
  CHECK(positions.get(*reused)->y.value == 4.0F);
}

void test_catalog() {
  const engine::Catalog& catalog = engine::Catalog::instance();
  CHECK(catalog.petals().size() == 39);
  CHECK(catalog.entities().size() == 23);
  CHECK(catalog.spawn_rules().size() == 20);
  const auto* basic = catalog.petal(1);
  CHECK(basic != nullptr);
  CHECK(std::strcmp(basic->name, "Basic") == 0);
  CHECK(basic->rechargeMilliseconds == 2500.0F);
  CHECK(basic->labelFontSize == 14.0F);
  CHECK(basic->drawRadius == 14.0F);
  CHECK(basic->collisionRadius == 10.0F);
  CHECK(basic->descriptionCount == 1);
  const auto* rock = catalog.entity(1);
  CHECK(rock != nullptr);
  CHECK(std::strcmp(rock->name, "Rock") == 0);
  CHECK(rock->petalTypeIdCount == 3);
  CHECK(rock->petalTypeIds[0] == 2);
  CHECK(rock->petalTypeIds[2] == 4);
  int rose_count = 0;
  for (const auto& petal : catalog.petals()) if (std::strcmp(petal.name, "Rose") == 0) ++rose_count;
  CHECK(rose_count == 3);
  CHECK(catalog.spawn_rules()[0].weight == 0.5F);
  CHECK(catalog.spawn_rules()[0].entityTypeId == 1);
  CHECK(catalog.petal(39) == nullptr);
  const auto* rock_drops = catalog.drop_table(1);
  CHECK(rock_drops != nullptr);
  CHECK(rock_drops->dropCount == 3);
  CHECK(rock_drops->drops[0].petalTypeId == 4);
  CHECK(rock_drops->drops[2].petalTypeId == 3);
  CHECK(catalog.drop_table(0) != nullptr);
  CHECK(catalog.drop_table(0)->dropCount == 0);
  CHECK(catalog.drop_table(22) != nullptr);
  CHECK(catalog.petals().size() == 39);
  CHECK(catalog.petals()[1].typeId == 1);
  CHECK(catalog.petals()[1].rechargeMilliseconds == 2500.0F);
  CHECK(catalog.petals()[1].labelFontSize == 14.0F);
  CHECK(catalog.petals()[3].rechargeMilliseconds == 5500.0F);
}

void test_protocol_constants() {
  CHECK(engine::kMaxInputPacketBytes == 65536);
  CHECK(engine::kOutputQueueCapacity == 16);
  CHECK(engine::kPacketHeaderBytes == 16);
  CHECK(engine::kInlinePayloadBytes == 4096);
  CHECK(engine::kPacketXorKeyBytes == 256);
  engine::OutputQueue queue;
  for (std::size_t index = 0; index < engine::kOutputQueueCapacity; ++index) {
    CHECK(queue.enqueue(engine::OutputPacket{}));
  }
  CHECK(queue.full());
  CHECK(!queue.enqueue(engine::OutputPacket{}));
  CHECK(queue.drain().size() == engine::kOutputQueueCapacity);
  CHECK(queue.empty());
}

} // namespace

void test_quadtree() {
  engine::QuadTree tree(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                                     engine::f32(600.0F), engine::f32(600.0F)}, 2, 5);
  std::vector<engine::Aabb> boxes;
  for (int index = 0; index < 100; ++index) {
    const float x = -500.0F + static_cast<float>(index % 10) * 111.0F;
    const float y = -500.0F + static_cast<float>(index / 10) * 111.0F;
    boxes.push_back(engine::Aabb{engine::f32(x - 2.0F), engine::f32(y - 2.0F),
                                 engine::f32(x + 2.0F), engine::f32(y + 2.0F)});
    tree.insert(static_cast<std::size_t>(index), boxes.back());
  }
  CHECK(tree.size() == 100);
  CHECK(tree.node_count() > 1);
  const engine::Aabb area{engine::f32(-100.0F), engine::f32(-100.0F),
                          engine::f32(100.0F), engine::f32(100.0F)};
  std::vector<std::size_t> indexed;
  tree.query(area, indexed);
  std::vector<std::size_t> linear;
  for (std::size_t index = 0; index < boxes.size(); ++index)
    if (boxes[index].intersects(area)) linear.push_back(index);
  std::sort(indexed.begin(), indexed.end());
  CHECK(indexed == linear);
  std::vector<std::size_t> outside;
  tree.query(engine::Aabb{engine::f32(700.0F), engine::f32(700.0F),
                          engine::f32(800.0F), engine::f32(800.0F)}, outside);
  CHECK(outside.empty());

  tree.update(42, engine::Aabb{engine::f32(-3.0F), engine::f32(-3.0F),
                               engine::f32(3.0F), engine::f32(3.0F)});
  CHECK(tree.size() == 100);
  tree.insert(42, engine::Aabb{engine::f32(-3.0F), engine::f32(-3.0F),
                               engine::f32(3.0F), engine::f32(3.0F)});
  CHECK(tree.size() == 100);
  std::vector<std::size_t> updated;
  tree.query(engine::Aabb{engine::f32(-4.0F), engine::f32(-4.0F),
                          engine::f32(4.0F), engine::f32(4.0F)}, updated);
  CHECK(std::find(updated.begin(), updated.end(), 42) != updated.end());

  tree.remove(42);
  CHECK(tree.size() == 99);
  std::vector<std::size_t> all;
  tree.query(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                          engine::f32(600.0F), engine::f32(600.0F)}, all);
  CHECK(all.size() == 99);
  CHECK(std::find(all.begin(), all.end(), 42) == all.end());

  std::vector<bool> present(100, true);
  present[0] = false;
  tree.remove_missing(present);
  CHECK(tree.size() == 98);
  tree.query(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                          engine::f32(600.0F), engine::f32(600.0F)}, all);
  CHECK(all.size() == 98);
  CHECK(std::find(all.begin(), all.end(), 0) == all.end());

  tree.clear();
  CHECK(tree.size() == 0);
  tree.insert(0, boxes[0]);
  std::vector<std::size_t> after_clear;
  tree.query(engine::Aabb{engine::f32(-501.0F), engine::f32(-501.0F),
                          engine::f32(-499.0F), engine::f32(-499.0F)}, after_clear);
  CHECK(after_clear == std::vector<std::size_t>{0});
}
