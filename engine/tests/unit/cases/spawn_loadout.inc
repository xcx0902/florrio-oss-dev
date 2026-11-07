void test_petals() {
  engine::World world;
  world.set_initialized(true);
  CHECK(engine::petal_radius(engine::catalog::PetalId::kBasicCommon).to_float() == 14.0F);
  CHECK(engine::petal_radius(static_cast<engine::catalog::PetalId>(999)).to_float() == 0.0F);
  const auto handle = engine::spawn_petal(
      world, engine::test::player(world), engine::catalog::PetalId::kBasicCommon,
      engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::f32(10.0F), engine::f32(0.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPetal);
  CHECK(entity->petal_id == engine::catalog::PetalId::kBasicCommon);
  CHECK(entity->radius.to_float() == 14.0F);
  // The petal spawns at the owner's position; the orbit spring pulls it
  // outward afterwards.
  CHECK(entity->position.x.to_float() == 0.0F);
  CHECK(std::fabs(entity->position.y.to_float()) < 1e-6F);
  CHECK(engine::test::player(world).petals().size() == 1);
  CHECK(engine::test::player(world).petals()[0].handle == handle);
  CHECK(engine::test::player(world).petals()[0].type_id == engine::catalog::PetalId::kBasicCommon);
  CHECK(engine::test::player(world).petals()[0].orbit_radius.to_float() == 10.0F);
  entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  entity->velocity = engine::Vec2d(0.0, 0.0);
  engine::update_petal_orbit(world, engine::test::player(world).petals()[0], 16.0);
  CHECK(entity->velocity.x > 0.0);
  CHECK(std::fabs(entity->velocity.y) < 1e-6);
  entity->health = engine::f32(0.0F);
  engine::tick(world, 50.0);
  CHECK(engine::test::player(world).petals().empty());
  world.reset();
  CHECK(engine::test::player(world).petals().empty());
  const auto drop = engine::spawn_drop(world, engine::catalog::PetalId::kBasicCommon,
                                       engine::Vec2(engine::f32(3.0F), engine::f32(4.0F)));
  CHECK(drop.valid());
  const engine::Entity* drop_entity = world.entities().get(drop);
  CHECK(drop_entity != nullptr);
  CHECK(drop_entity->kind == engine::EntityKind::kDrop);
  CHECK(drop_entity->petal_id == engine::catalog::PetalId::kBasicCommon);
  CHECK(drop_entity->radius.to_float() == 14.0F);
  engine::PetalSlot slot = engine::make_petal_slot(engine::catalog::PetalId::kBasicCommon);
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
  for (const auto handle : spawned) {
    CHECK(world.entities().get(handle) != nullptr);
  }
}

void test_player_loadout() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, engine::catalog::PetalId::kBasicCommon));
  CHECK(loadout.equip(1, engine::catalog::PetalId::kFastCommon));
  CHECK(loadout.slots()[0].type_id == engine::catalog::PetalId::kBasicCommon);
  CHECK(loadout.slots()[1].type_id == engine::catalog::PetalId::kFastCommon);
  CHECK(loadout.swap(0, engine::catalog::PetalId::kBasicCommon, 1,
                     engine::catalog::PetalId::kFastCommon));
  CHECK(loadout.slots()[0].type_id == engine::catalog::PetalId::kFastCommon);
  CHECK(loadout.slots()[1].type_id == engine::catalog::PetalId::kBasicCommon);
  CHECK(!loadout.swap(0, engine::catalog::PetalId::kBasicCommon, 1,
                      engine::catalog::PetalId::kFastCommon));
  CHECK(loadout.discard(0, engine::catalog::PetalId::kFastCommon));
  CHECK(loadout.slots()[0].count == 0);
  CHECK(!loadout.discard(0, engine::catalog::PetalId::kFastCommon));
  loadout.clear();
  CHECK(loadout.slots()[1].count == 0);
}

void test_profile_discard_and_swap() {
  engine::PlayerProfile profile;
  profile.set_inventory(0, engine::catalog::PetalId::kRockRare);
  profile.set_inventory(1, engine::catalog::PetalId::kFastCommon);
  profile.set_inventory_count(2);
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, engine::catalog::PetalId::kRockRare));
  CHECK(loadout.equip(1, engine::catalog::PetalId::kFastCommon));
  CHECK(loadout.discard(profile, 0, engine::catalog::PetalId::kRockRare));
  CHECK(profile.backpack_count() == 1);
  CHECK(profile.backpack()[0] == engine::catalog::PetalId::kRockRare);
  CHECK(profile.inventory(0) == engine::catalog::PetalId::kNone);
  CHECK(profile.level() > 0);
  CHECK(loadout.slots()[0].count == 0);
  CHECK(loadout.swap(profile, 1, engine::catalog::PetalId::kFastCommon, 0,
                     engine::catalog::PetalId::kNone));
  CHECK(profile.inventory(1) == engine::catalog::PetalId::kNone);
  CHECK(loadout.slots()[1].count == 0);

  engine::PlayerProfile fifo;
  for (std::uint16_t item = 1; item <= 16; ++item) {
    fifo.push_backpack(static_cast<engine::catalog::PetalId>(item));
  }
  fifo.push_backpack(engine::catalog::PetalId::kTripletEpic);
  CHECK(fifo.backpack_count() == 16);
  CHECK(fifo.backpack()[0] == engine::catalog::PetalId::kFastCommon);
  CHECK(fifo.backpack()[15] == engine::catalog::PetalId::kTripletEpic);
}

void test_discard_removes_petals() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "discard",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kBasicCommon);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kBasicCommon));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 1);
  const engine::EntityHandle petal = engine::test::player(world).loadout().handle(0, 0);
  CHECK(petal.valid());
  CHECK(engine::test::player(world).loadout().discard(engine::test::player(world).profile(), 0,
                                                      engine::catalog::PetalId::kBasicCommon));
  engine::remove_slot_petals(world, engine::test::player(world), 0);
  CHECK(world.entities().get(petal) == nullptr);
  CHECK(engine::test::player(world).petals().empty());
}

void test_cactus_construction() {
  engine::ServerRng rng(1383144482U);
  const engine::CactusBody body = engine::configure_cactus(rng);
  CHECK(body.radius.value >= 40.0F && body.radius.value <= 60.0F);
  CHECK(body.health.value == body.radius.value * 0.7F);
  engine::World world;
  world.initialize();
  engine::ServerRng spawn_rng(1383144482U);
  const auto handle = engine::spawn_cactus_with_drop_draws(
      world, engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), spawn_rng);
  CHECK(handle.valid());
  const auto* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->species_id == engine::catalog::SpeciesId::kCactus);
  CHECK(entity->contact_damage.value == 30.0F);
  CHECK(entity->world_flags == 75);
  CHECK(entity->entity_flags == 96);
  CHECK(std::fabs(entity->health.value - entity->radius.value * 0.7F) < 1e-5F);
}

void test_player_spawn() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F),
                                    engine::f32(0.0F)};
  const auto player =
      engine::spawn_player(world, engine::test::player(world), "tester",
                           engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), config);
  CHECK(player.valid());
  CHECK(engine::test::player(world).player() == player);
  CHECK(engine::test::player(world).player_name() == "tester");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(!engine::spawn_player(world, engine::test::player(world), "again",
                              engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config)
             .valid());
  engine::test::input(world, 0, engine::f32(0.0F), engine::f32(23913.0F));
  engine::tick(world, 50.0);
  CHECK(entity->position.x.to_float() > 5.0F);
  CHECK(entity->position.x.to_float() < 7.0F);
  CHECK(std::fabs(entity->position.y.to_float() - 2.0F) < 1e-3F);
}

void test_drop_pickup() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F),
                                    engine::f32(0.0F)};
  CHECK(engine::spawn_player(world, engine::test::player(world), "p",
                             engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config)
            .valid());
  const auto drop = engine::spawn_drop(world, engine::catalog::PetalId::kBasicCommon,
                                       engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  // The drop records its spawn time; collection is gated until 500 ms after it
  // appears. Keep the transfer assertions, and also reject any premature
  // publication.
  for (unsigned step = 0; step < 9U; ++step) {
    engine::tick(world, 50.0);
    CHECK(!world.entities().get(drop)->pickup_collected);
    CHECK(engine::test::player(world).loadout().pickup_transfers().empty());
  }
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) != nullptr);
  CHECK(world.entities().get(drop)->pickup_collected);
  CHECK(engine::test::player(world).loadout().pickup_transfers().size() == 1U);
  if (engine::test::player(world).loadout().pickup_transfers().size() != 1U) {
    return;
  }
  CHECK(engine::test::player(world).loadout().pickup_transfers()[0].drop == drop);
  CHECK(engine::test::player(world).loadout().pickup_transfers()[0].slot == 0U);
  CHECK(engine::test::player(world).loadout().slots()[0].type_id ==
        engine::catalog::PetalId::kBasicCommon);
  CHECK(engine::test::player(world).loadout().slots()[0].count == 1);
  engine::tick(world, 1950.0);
  CHECK(world.entities().get(drop) != nullptr);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) == nullptr);
}

void test_spawn_table() {
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  const float expected_totals[8] = {
      0.7942009568214417F,  0.8192009329795837F, 0.7390009760856628F, 0.8190009593963623F,
      0.48900100588798523F, 0.4140009880065918F, 0.5140010118484497F, 0.4140009880065918F,
  };
  const std::uint8_t expected_counts[8] = {8, 9, 9, 12, 10, 9, 10, 9};
  for (std::uint8_t band = 0; band < 8; ++band) {
    CHECK(table.band(band).total.value == expected_totals[band]);
    CHECK(table.band(band).entries.size() == expected_counts[band]);
  }
  const engine::catalog::SpeciesId expected_band0[] = {
      engine::catalog::SpeciesId::kRock,          engine::catalog::SpeciesId::kBoulder,
      engine::catalog::SpeciesId::kLadybug,       engine::catalog::SpeciesId::kMassiveLadybug,
      engine::catalog::SpeciesId::kBee,           engine::catalog::SpeciesId::kBabyAnt,
      engine::catalog::SpeciesId::kCentipedeHead, engine::catalog::SpeciesId::kSquare};
  for (std::size_t index = 0; index < table.band(0).entries.size(); ++index) {
    CHECK(table.band(0).entries[index].entity_type == expected_band0[index]);
  }
  // The three rarest catalogue rows are present with their exact binary32
  // weights. This is the direct check that the spawn table did not drop
  // low-weight rules while grouping regions.
  const auto has_entry = [&table](std::uint8_t band, engine::catalog::SpeciesId type) {
    for (const auto& entry : table.band(band).entries) {
      if (entry.entity_type == type) {
        return true;
      }
    }
    return false;
  };
  CHECK(has_entry(0, engine::catalog::SpeciesId::kMassiveLadybug) &&
        has_entry(1, engine::catalog::SpeciesId::kMassiveLadybug));
  CHECK(!has_entry(2, engine::catalog::SpeciesId::kMassiveLadybug));
  for (std::uint8_t band = 3; band < 8; ++band) {
    CHECK(has_entry(band, engine::catalog::SpeciesId::kAntHole));
    CHECK(has_entry(band, engine::catalog::SpeciesId::kEvilCentipedeHead));
  }
  for (const auto& entry : table.band(0).entries) {
    if (entry.entity_type == engine::catalog::SpeciesId::kMassiveLadybug) {
      CHECK(entry.weight.value == 0.000199999995F);
    }
  }
  for (const auto& entry : table.band(3).entries) {
    if (entry.entity_type == engine::catalog::SpeciesId::kAntHole) {
      CHECK(entry.weight.value == 0.00200000009F);
    }
    if (entry.entity_type == engine::catalog::SpeciesId::kEvilCentipedeHead) {
      CHECK(entry.weight.value == 0.00100000005F);
    }
  }
  engine::ServerRng sequence(1);
  CHECK(sequence.next() == 48271U);
  CHECK(sequence.next() == 182605794U);
  CHECK(sequence.next() == 1291394886U);
  CHECK(sequence.next() == 1914720637U);
  engine::ServerRng rng(1);
  const auto* first = table.choose(0, rng);
  CHECK(first != nullptr);
  CHECK(first->entity_type == engine::catalog::SpeciesId::kRock);
  rng.seed(2147483646U);
  const auto* last = table.choose(0, rng);
  CHECK(last != nullptr);
  CHECK(last->entity_type == engine::catalog::SpeciesId::kCentipedeHead);
  rng.seed(787621659U);  // server-init RNG state
  const auto* initial = table.choose(0, rng);
  CHECK(initial != nullptr);
  CHECK(initial->entity_type == engine::catalog::SpeciesId::kRock);

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
  const auto none = table.find_clear_position(
      0, full_rng, [](const engine::SpawnPosition&) { return true; }, engine::f32(50000.0F),
      engine::f32(4000.0F), 2);
  CHECK(!none.has_value());
  engine::ServerRng two_trials(787621659U);
  (void)table.sample_position(0, two_trials);
  (void)table.sample_position(0, two_trials);
  CHECK(full_rng.state() == two_trials.state());

  engine::World world;
  world.initialize();
  world.random().seed(787621659U);  // observed post-population RNG state
  int occupancy_calls = 0;
  const engine::EntityHandle spawned = table.spawn_from_band(
      world, 0, [&](const engine::SpawnPosition&) { return ++occupancy_calls <= 2; },
      [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
        return engine::spawn_entity(world, engine::EntityKind::kMob, entry.entity_type,
                                    engine::Vec2(position.x, position.y), engine::f32(14.0F));
      });
  CHECK(spawned.valid());
  CHECK(occupancy_calls == 3);
  const auto* spawned_entity = world.entities().get(spawned);
  CHECK(spawned_entity != nullptr);
  CHECK(spawned_entity->active);
  CHECK(spawned_entity->species_id == engine::catalog::SpeciesId::kRock);
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
  const engine::EntityHandle handle =
      engine::spawn_entity(world, engine::EntityKind::kMob, engine::catalog::SpeciesId::kLadybug,
                           engine::Vec2(engine::f32(10.0F), engine::f32(20.0F)), engine::f32(3.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kMob);
  CHECK(entity->species_id == engine::catalog::SpeciesId::kLadybug);
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
