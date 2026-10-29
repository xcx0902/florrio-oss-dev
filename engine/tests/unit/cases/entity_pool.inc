void test_entity_handle() {
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(5, 7);
  CHECK(handle.index() == 5);
  CHECK(handle.generation() == 7);
  const engine::EntityHandle wire = engine::EntityHandle::from_wire(handle.to_wire());
  CHECK(wire == handle);
  CHECK(engine::EntityHandle::from_wire(handle.to_wire()).raw == handle.raw);
}

void test_entity_pool() {
  engine::EntityPool pool;
  CHECK(pool.active_count() == 0);
  const auto first = pool.allocate();
  CHECK(first.has_value());
  CHECK(pool.active_count() == 1);
  CHECK(pool.get(*first) != nullptr);
  const std::uint32_t generation = first->generation();
  CHECK(generation != 0);
  CHECK(pool.release(*first));
  CHECK(pool.active_count() == 0);
  const auto second = pool.allocate();
  CHECK(second.has_value());
  CHECK(second->index() == 1); // FIFO free list: 0 was released to the tail
  CHECK(second->generation() == 1);
  CHECK(pool.get(*first) == nullptr);
  CHECK(pool.get(*second) != nullptr);
}

void test_world_tick() {
  engine::World world;
  world.set_initialized(true);
  const auto handle = world.entities().allocate();
  CHECK(handle.has_value());
  engine::Entity* entity = world.entities().get(*handle);
  CHECK(entity != nullptr);
  entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  entity->velocity = engine::Vec2d(10.0, -5.0);
  engine::tick(world, 100.0);
  CHECK(world.tick() == 1);
  const double damping = std::pow(0.992, 100.0);
  const double drag = 125.0 - 125.0 * damping;
  CHECK(std::fabs(entity->position.x.to_float() - static_cast<float>(drag * 10.0)) < 1e-3F);
  CHECK(std::fabs(entity->position.y.to_float() + static_cast<float>(drag * 5.0)) < 1e-3F);

  entity->health = engine::f32(0.0F);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(*handle) == nullptr);
  CHECK(world.entities().active_count() == 0);
}

void test_zone_restriction() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(
    world, "zone", engine::make_default_profile(), false);
  CHECK(player.valid());
  world.profile().set_level(60);
  engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  entity->set_position_x(engine::f32(-24000.0F));
  entity->set_position_y(engine::f32(0.0F));
  (void)engine::spawn_loadout_petals(world);
  CHECK(!world.petals().empty());
  for (int index = 0; index < 60; ++index) {
    engine::update_zone_restriction(world, 1000.0);
    engine::damage_zone_locked_petals(world, 1000.0);
  }
  CHECK(world.zone_petals_disabled());
  CHECK(world.zone_progress() == 255U);
  CHECK(world.petals().empty());
  entity->set_position_x(engine::f32(30000.0F));
  for (int index = 0; index < 10; ++index)
    engine::update_zone_restriction(world, 1000.0);
  CHECK(!world.zone_petals_disabled());
  CHECK(world.zone_progress() < 255U);
}

void test_petal_orbit() {
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 0) == engine::f32(65.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 1) == engine::f32(130.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 2) == engine::f32(40.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 3) == engine::f32(130.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kFast, 1) == engine::f32(145.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kHeavy, 2) == engine::f32(50.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kRock, 1) == engine::f32(110.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kRock, 2) == engine::f32(55.0F));
  for (std::uint32_t inputs = 0; inputs < 256; ++inputs) {
    const auto value = engine::orbit_radius(engine::OrbitProfile::kFast, static_cast<std::uint8_t>(inputs));
    CHECK(value == engine::f32(inputs & 1U ? 145.0F : inputs & 2U ? 40.0F : 65.0F));
  }
  CHECK(engine::wing_orbit_radius(0, engine::f32(0.0F)) == engine::f32(65.0F));
  CHECK(engine::wing_orbit_radius(1, engine::f32(0.0F)) == engine::f32(140.0F));
  CHECK(engine::wing_orbit_radius(2, engine::f32(0.0F)) == engine::f32(40.0F));
  CHECK(std::fabs(engine::wing_orbit_radius(1, engine::f32(1.5707963267948966F)).to_float() - 190.0F) < 1e-4F);
}
