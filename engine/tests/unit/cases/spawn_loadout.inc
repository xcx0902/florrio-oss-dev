void test_petals() {
  engine::World world;
  world.set_initialized(true);
  CHECK(engine::petal_radius(1).to_float() == 14.0F);
  CHECK(engine::petal_radius(999).to_float() == 0.0F);
  const auto handle = engine::spawn_petal(world, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::f32(10.0F), engine::f32(0.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPetal);
  CHECK(entity->type_id == 1);
  CHECK(entity->radius.to_float() == 14.0F);
  // Original 397 spawns the petal at the owner's position; the orbit spring
  // pulls it outward afterwards.
  CHECK(entity->position.x.to_float() == 0.0F);
  CHECK(std::fabs(entity->position.y.to_float()) < 1e-6F);
  CHECK(world.petals().size() == 1);
  CHECK(world.petals()[0].handle == handle);
  CHECK(world.petals()[0].type_id == 1);
  CHECK(world.petals()[0].orbit_radius.to_float() == 10.0F);
  entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  entity->velocity = engine::Vec2d(0.0, 0.0);
  engine::update_petal_orbit(world, world.petals()[0], 16.0);
  CHECK(entity->velocity.x > 0.0);
  CHECK(std::fabs(entity->velocity.y) < 1e-6);
  entity->health = engine::f32(0.0F);
  engine::tick(world, 50.0);
  CHECK(world.petals().empty());
  world.reset();
  CHECK(world.petals().empty());
  const auto drop = engine::spawn_drop(world, 1, engine::Vec2(engine::f32(3.0F), engine::f32(4.0F)));
  CHECK(drop.valid());
  const engine::Entity* drop_entity = world.entities().get(drop);
  CHECK(drop_entity != nullptr);
  CHECK(drop_entity->kind == engine::EntityKind::kDrop);
  CHECK(drop_entity->type_id == 1);
  CHECK(drop_entity->radius.to_float() == 14.0F);
  engine::PetalSlot slot = engine::make_petal_slot(1);
  CHECK(slot.count == 1);
  CHECK(slot.ready());
  slot.recharge_remaining_ms = 2500.0;
  CHECK(!slot.ready());
  CHECK(!slot.advance(2499.0));
  CHECK(slot.advance(1.0));
  CHECK(slot.ready());
  CHECK(slot.recharge_remaining_ms == 0.0);
}

void test_populate_world() {
  engine::World world;
  world.set_initialized(true);
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  std::array<std::uint8_t, 8> counts{};
  counts[0] = 2;
  const auto spawned = engine::populate_world(world, table, counts);
  CHECK(!spawned.empty());
  CHECK(world.entities().active_count() >= spawned.size());
  for (const auto handle : spawned) CHECK(world.entities().get(handle) != nullptr);
}

void test_player_loadout() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 1));
  CHECK(loadout.equip(1, 2));
  CHECK(loadout.slots()[0].type_id == 1);
  CHECK(loadout.slots()[1].type_id == 2);
  CHECK(loadout.swap(0, 1, 1, 2));
  CHECK(loadout.slots()[0].type_id == 2);
  CHECK(loadout.slots()[1].type_id == 1);
  CHECK(!loadout.swap(0, 1, 1, 2));
  CHECK(loadout.discard(0, 2));
  CHECK(loadout.slots()[0].count == 0);
  CHECK(!loadout.discard(0, 2));
  loadout.clear();
  CHECK(loadout.slots()[1].count == 0);
}

void test_profile_discard_and_swap() {
  engine::PlayerProfile profile;
  profile.set_inventory(0, 4);
  profile.set_inventory(1, 2);
  profile.set_inventory_count(2);
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 4));
  CHECK(loadout.equip(1, 2));
  CHECK(loadout.discard(profile, 0, 4));
  CHECK(profile.backpack_count() == 1);
  CHECK(profile.backpack()[0] == 4);
  CHECK(profile.inventory(0) == 0);
  CHECK(profile.level() > 0);
  CHECK(loadout.slots()[0].count == 0);
  CHECK(loadout.swap(profile, 1, 2, 0, 0));
  CHECK(profile.inventory(1) == 0);
  CHECK(loadout.slots()[1].count == 0);

  engine::PlayerProfile fifo;
  for (std::uint16_t item = 1; item <= 16; ++item) fifo.push_backpack(item);
  fifo.push_backpack(17);
  CHECK(fifo.backpack_count() == 16);
  CHECK(fifo.backpack()[0] == 2);
  CHECK(fifo.backpack()[15] == 17);
}

void test_discard_removes_petals() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "discard", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 1);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 1));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  CHECK(petal.valid());
  CHECK(world.loadout().discard(world.profile(), 0, 1));
  engine::remove_slot_petals(world, 0);
  CHECK(world.entities().get(petal) == nullptr);
  CHECK(world.petals().empty());
}

void test_cactus_construction() {
  engine::ServerRng rng(1383144482U);
  const engine::CactusBody body = engine::configure_cactus(rng);
  CHECK(body.radius.value >= 40.0F && body.radius.value <= 60.0F);
  CHECK(body.health.value == body.radius.value * 0.7F);
  engine::World world;
  world.initialize();
  engine::ServerRng spawn_rng(1383144482U);
  const auto handle = engine::spawn_cactus_with_component_draws(world,
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), spawn_rng);
  CHECK(handle.valid());
  const auto* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->type_id == 3);
  CHECK(entity->contact_damage.value == 30.0F);
  CHECK(entity->world_flags == 75);
  CHECK(entity->entity_flags == 96);
  CHECK(entity->component_flags92 == 0);
  CHECK(std::fabs(entity->health.value - entity->radius.value * 0.7F) < 1e-5F);
}

void test_player_spawn() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F), engine::f32(0.0F)};
  const auto player = engine::spawn_player(world, "tester",
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), config);
  CHECK(player.valid());
  CHECK(world.player() == player);
  CHECK(world.player_name() == "tester");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(!engine::spawn_player(world, "again",
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config).valid());
  world.apply_input(0, engine::f32(0.0F), engine::f32(23913.0F));
  engine::tick(world, 50.0);
  CHECK(entity->position.x.to_float() > 5.0F);
  CHECK(entity->position.x.to_float() < 7.0F);
  CHECK(std::fabs(entity->position.y.to_float() - 2.0F) < 1e-3F);
}

void test_drop_pickup() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F), engine::f32(0.0F)};
  CHECK(engine::spawn_player(world, "p", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config).valid());
  const auto drop = engine::spawn_drop(world, 1, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  // Original pickup+48 stores spawn time; collection is gated until +500ms.
  // Keep the transfer assertions, and also reject any premature publication.
  for (unsigned step = 0; step < 9U; ++step) {
    engine::tick(world, 50.0);
    CHECK(!world.entities().get(drop)->pickup_collected);
    CHECK(world.loadout().pickup_transfers().empty());
  }
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) != nullptr);
  CHECK(world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
  if (world.loadout().pickup_transfers().size() != 1U) return;
  CHECK(world.loadout().pickup_transfers()[0].drop == drop);
  CHECK(world.loadout().pickup_transfers()[0].slot == 0U);
  CHECK(world.loadout().slots()[0].type_id == 1);
  CHECK(world.loadout().slots()[0].count == 1);
  engine::tick(world, 1950.0);
  CHECK(world.entities().get(drop) != nullptr);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) == nullptr);
}

void test_spawn_table() {
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  const float expected_totals[8] = {
    0.7942009568214417F, 0.8192009329795837F, 0.7390009760856628F, 0.8190009593963623F,
    0.48900100588798523F, 0.4140009880065918F, 0.5140010118484497F, 0.4140009880065918F,
  };
  const std::uint8_t expected_counts[8] = {8, 9, 9, 12, 10, 9, 10, 9};
  for (std::uint8_t band = 0; band < 8; ++band) {
    CHECK(table.band(band).total.value == expected_totals[band]);
    CHECK(table.band(band).entries.size() == expected_counts[band]);
  }
  const std::uint8_t expected_band0[] = {1, 2, 4, 5, 6, 7, 15, 19};
  for (std::size_t index = 0; index < table.band(0).entries.size(); ++index) {
    CHECK(table.band(0).entries[index].entity_type == expected_band0[index]);
  }
  // The three rarest catalogue rows are present with their exact binary32
  // weights. This is the direct check that the spawn table did not drop
  // low-weight rules while grouping regions.
  const auto has_entry = [&table](std::uint8_t band, std::uint16_t type) {
    for (const auto& entry : table.band(band).entries)
      if (entry.entity_type == type) return true;
    return false;
  };
  CHECK(has_entry(0, 5) && has_entry(1, 5));
  CHECK(!has_entry(2, 5));
  for (std::uint8_t band = 3; band < 8; ++band) {
    CHECK(has_entry(band, 11));
    CHECK(has_entry(band, 17));
  }
  for (const auto& entry : table.band(0).entries)
    if (entry.entity_type == 5) CHECK(entry.weight.value == 0.000199999995F);
  for (const auto& entry : table.band(3).entries) {
    if (entry.entity_type == 11) CHECK(entry.weight.value == 0.00200000009F);
    if (entry.entity_type == 17) CHECK(entry.weight.value == 0.00100000005F);
  }
  engine::ServerRng sequence(1);
  CHECK(sequence.next() == 48271U);
  CHECK(sequence.next() == 182605794U);
  CHECK(sequence.next() == 1291394886U);
  CHECK(sequence.next() == 1914720637U);
  engine::ServerRng rng(1);
  const auto* first = table.choose(0, rng);
  CHECK(first != nullptr);
  CHECK(first->entity_type == 1);
  rng.seed(2147483646U);
  const auto* last = table.choose(0, rng);
  CHECK(last != nullptr);
  CHECK(last->entity_type == 15);
  rng.seed(787621659U); // original sp_server_init RNG state
  const auto* initial = table.choose(0, rng);
  CHECK(initial != nullptr);
  CHECK(initial->entity_type == 1);

  engine::ServerRng position_rng(787621659U);
  const auto position0 = table.sample_position(0, position_rng);
  CHECK(position0.x.value == -24180.6171875F);
  CHECK(position0.y.value == 652.9090576171875F);
  CHECK(position_rng.state() == 1424269740U);
  engine::ServerRng position_rng1(1);
  const auto position3 = table.sample_position(3, position_rng1);
  CHECK(position3.x.value == -2499.832275390625F);
  CHECK(position3.y.value == -1659.8701171875F);
  engine::ServerRng position_rng2(2147483646U);
  const auto position7 = table.sample_position(7, position_rng2);
  CHECK(position7.x.value == 24999.943359375F);
  CHECK(position7.y.value == 1659.8701171875F);

  engine::ServerRng retry_rng(787621659U);
  int calls = 0;
  const auto found = table.find_clear_position(0, retry_rng, [&](const engine::SpawnPosition&) {
    ++calls;
    return calls <= 2;
  });
  CHECK(found.has_value());
  CHECK(calls == 3);
  engine::ServerRng expected_rng(787621659U);
  (void)table.sample_position(0, expected_rng);
  (void)table.sample_position(0, expected_rng);
  const auto expected = table.sample_position(0, expected_rng);
  CHECK(*found == expected);
  CHECK(retry_rng.state() == expected_rng.state());
  engine::ServerRng full_rng(787621659U);
  const auto none = table.find_clear_position(0, full_rng, [](const engine::SpawnPosition&) { return true; },
    engine::f32(50000.0F), engine::f32(4000.0F), 2);
  CHECK(!none.has_value());
  engine::ServerRng two_trials(787621659U);
  (void)table.sample_position(0, two_trials);
  (void)table.sample_position(0, two_trials);
  CHECK(full_rng.state() == two_trials.state());

  engine::World world;
  world.initialize();
  world.random().seed(787621659U); // observed original post-population state
  int occupancy_calls = 0;
  const engine::EntityHandle spawned = table.spawn_from_band(world, 0,
    [&](const engine::SpawnPosition&) { return ++occupancy_calls <= 2; },
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      return engine::spawn_entity(world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F));
    });
  CHECK(spawned.valid());
  CHECK(occupancy_calls == 3);
  const auto* spawned_entity = world.entities().get(spawned);
  CHECK(spawned_entity != nullptr);
  CHECK(spawned_entity->active);
  CHECK(spawned_entity->type_id == 1);
  engine::ServerRng expected_spawn_rng(787621659U);
  (void)table.choose(0, expected_spawn_rng);
  (void)table.sample_position(0, expected_spawn_rng);
  (void)table.sample_position(0, expected_spawn_rng);
  const auto expected_spawn_position = table.sample_position(0, expected_spawn_rng);
  CHECK(spawned_entity->position.x.value == expected_spawn_position.x.value);
  CHECK(spawned_entity->position.y.value == expected_spawn_position.y.value);
}

void test_spawn_and_movement() {
  engine::World world;
  world.set_initialized(true);
  const engine::EntityHandle handle = engine::spawn_entity(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(10.0F), engine::f32(20.0F)), engine::f32(3.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kMob);
  CHECK(entity->type_id == 4);
  entity->velocity = engine::Vec2d(2.0, 0.0);
  engine::integrate_positions(world, 0.5);
  CHECK(std::fabs(entity->position.x.to_float() - 11.0F) < 1e-6F);
}

void test_collision() {
  const engine::Vec2 a(engine::f32(0.0F), engine::f32(0.0F));
  const engine::Vec2 b(engine::f32(3.0F), engine::f32(4.0F));
  CHECK(!engine::circles_overlap(a, engine::f32(2.0F), b, engine::f32(2.0F)));
  CHECK(engine::circles_overlap(a, engine::f32(3.0F), b, engine::f32(2.0F)));
  CHECK(engine::circles_overlap(a, engine::f32(2.5F), b, engine::f32(2.5F)));
}

void test_damage_and_effects() {
  engine::Entity entity;
  entity.health = engine::f32(10.0F);
  CHECK(engine::apply_damage(entity, engine::f32(3.0F)).to_float() == 7.0F);
  CHECK(engine::apply_damage(entity, engine::f32(100.0F)).to_float() == 0.0F);
  CHECK(engine::apply_damage(entity, engine::f32(-1.0F)).to_float() == 0.0F);
  engine::EffectTimer timer(100);
  CHECK(timer.active());
  timer.advance(40);
  CHECK(timer.remaining() == 60);
  timer.advance(60);
  CHECK(!timer.active());
}

void test_petal_orbit_profiles() {
  const engine::Vec2 center(engine::f32(1.0F), engine::f32(2.0F));
  const engine::Vec2 at_zero = engine::orbit_position(center, engine::f32(5.0F), engine::f32(0.0F));
  CHECK(std::fabs(at_zero.x.to_float() - 6.0F) < 1e-6F);
  CHECK(std::fabs(at_zero.y.to_float() - 2.0F) < 1e-6F);
}
