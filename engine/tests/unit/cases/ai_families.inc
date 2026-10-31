void test_ai_recovered_species_profiles() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto bee = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 6,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  const engine::Entity* bee_entity = world.entities().get(bee);
  CHECK(bee_entity != nullptr);
  CHECK(bee_entity->ai.wave_frequency.bits() == 993803864U);
  CHECK(bee_entity->ai.wave_power.value == 0.5F);
  CHECK(bee_entity->ai.sine_enabled);
  CHECK(bee_entity->ai.sine_frequency.value == 0.002F);
  CHECK(bee_entity->ai.timer_interval_ms >= 5000.0 && bee_entity->ai.timer_interval_ms <= 10000.0);
  CHECK(bee_entity->ai.radius.value == 1000.0F);
  CHECK(bee_entity->max_health.value == 15.0F);

  const auto hornet = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(500.0F), engine::f32(0.0F)));
  const engine::Entity* hornet_entity = world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  CHECK(hornet_entity->ai.aggressive);
  CHECK(hornet_entity->ai.attack_range.value == 500.0F);
  CHECK(std::fabs(hornet_entity->ai.attack_speed.value) == 0.4F);
  CHECK(hornet_entity->ai.attack_callback == 74U);
  CHECK(hornet_entity->ai.attack_cooldown_gain.value == 2000.0F);
  CHECK(hornet_entity->ai.territory.value == 0.6F);
  CHECK(hornet_entity->ai.radius.value == 600.0F);

  const auto spider = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 22,
    engine::Vec2(engine::f32(-500.0F), engine::f32(0.0F)));
  const engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  CHECK(spider_entity->ai.aggressive);
  CHECK(spider_entity->ai.territory.value == 0.45F);
  CHECK(spider_entity->ai.chase_speed.value == 2.88F);
  CHECK(spider_entity->ai.radius.value == 600.0F);

  const auto square = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 19,
    engine::Vec2(engine::f32(0.0F), engine::f32(500.0F)));
  const engine::Entity* square_entity = world.entities().get(square);
  CHECK(square_entity != nullptr);
  CHECK(!square_entity->ai.angle_locked);
  CHECK(std::fabs(square_entity->ai.turn_rate.value - 0.12321318F) < 1e-6F);
  CHECK(square_entity->ai.idle_speed.value == 0.2F);
  CHECK(square_entity->ai.radius.value == 1000.0F);
}

void test_ai_behavior_modifiers() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  world.entities().get(player)->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle spider = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 22, engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  engine::update_ai(world, 50.0);
  const double base_vx = spider_entity->velocity.x;
  CHECK(base_vx < 0.0);
  spider_entity->velocity = engine::Vec2d(0.0, 0.0);
  spider_entity->ai.modifiers.speed = engine::f32(2.0F);
  engine::update_ai(world, 50.0);
  CHECK(std::fabs(spider_entity->velocity.x) > std::fabs(base_vx) * 1.5);

  engine::World hornet_world;
  hornet_world.initialize();
  hornet_world.set_auto_populate(false);
  const engine::EntityHandle hornet_player = engine::spawn_player_default(hornet_world, "p",
    engine::make_default_profile(), false);
  hornet_world.entities().get(hornet_player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  const engine::EntityHandle hornet = engine::spawn_entity_from_defaults(
    hornet_world, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10300.0F), engine::f32(0.0F)));
  engine::Entity* hornet_entity = hornet_world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  hornet_entity->ai.target = hornet_player;
  hornet_entity->ai.attack_callback = 74U;
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  hornet_entity->ai.attack_cooldown_gain = engine::f32(2000.0F);
  hornet_entity->ai.modifiers.attack = engine::f32(2.0F);
  engine::update_ai(hornet_world, 50.0);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 4000.0F);
}

void test_hornet_stinger_callback() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  // The hornet's territory gate (0.6 - 0.5) needs the player beyond x=5000.
  world.entities().get(player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  world.entities().get(player)->bounds_dirty = true;
  const engine::EntityHandle hornet = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10300.0F), engine::f32(0.0F)));
  engine::Entity* hornet_entity = world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  // First pass acquires the player and arms the 500 ms acquire cooldown.
  engine::update_ai(world, 50.0);
  CHECK(hornet_entity->ai.target == player);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 500.0F);
  const std::size_t before = world.entities().active_count();
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  // Callback 74 spawns one stinger and re-arms the recovered 2000 ms cooldown.
  CHECK(world.entities().active_count() == before + 1U);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 2000.0F);
  engine::EntityHandle stinger{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kProjectile) continue;
    stinger = entity.handle;
    CHECK(entity.type_id == 14U);
    CHECK(entity.owner == hornet.raw);
    CHECK(entity.contact_damage.value == 10.0F);
    CHECK(entity.lifetime_remaining_ms == 2000.0);
    CHECK(entity.health.value == 10.0F);
    CHECK(entity.max_health.value == 10.0F);
    CHECK(entity.collision_radius.value == 11.0F);
    CHECK(std::fabs(entity.acceleration.x + 0.6) < 1e-6);
    CHECK(std::fabs(entity.position.x.value - 10320.0F) < 0.01F);
    CHECK(std::fabs(entity.position.y.value) < 0.01F);
    CHECK(std::fabs(entity.velocity.x + 1.4) < 1e-6);
    CHECK(std::fabs(entity.velocity.y) < 1e-6);
  }
  CHECK(stinger.valid());
  // The next tick must not fire again while the cooldown is armed.
  engine::update_ai(world, 50.0);
  CHECK(world.entities().active_count() == before + 1U);

  // Outside acquisition radius a new target is not acquired. A retained live
  // target still fires outside attack_range (the oracle fixture covers this).
  engine::World far;
  far.initialize();
  far.set_auto_populate(false);
  const engine::EntityHandle far_player = engine::spawn_player_default(far, "p",
    engine::make_default_profile(), false);
  far.entities().get(far_player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  far.entities().get(far_player)->bounds_dirty = true;
  const engine::EntityHandle far_hornet = engine::spawn_entity_from_defaults(
    far, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10800.0F), engine::f32(0.0F)));
  engine::Entity* far_entity = far.entities().get(far_hornet);
  CHECK(far_entity != nullptr);
  engine::update_ai(far, 50.0);
  far_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  const std::size_t far_before = far.entities().active_count();
  engine::update_ai(far, 50.0);
  CHECK(far.entities().active_count() == far_before);
  far_entity->ai.target = far_player;
  far_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(far, 50.0);
  CHECK(far.entities().active_count() == far_before + 1U);

  // An unknown callback id inside range is counted, not guessed into an attack.
  const std::uint32_t unknown_before = engine::species_debug::unknown_callbacks;
  const std::size_t world_before = world.entities().active_count();
  hornet_entity->ai.attack_callback = 999U;
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  CHECK(engine::species_debug::unknown_callbacks == unknown_before + 1U);
  CHECK(world.entities().active_count() == world_before);
}

void test_hornet_stinger_lifecycle() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto player = engine::spawn_player_default(world, "p", engine::make_default_profile(), false);
  const auto hornet = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(10000.0F), engine::f32(50000.0F)));
  auto* body = world.entities().get(hornet);
  body->angle = engine::f32(1.5707963705062866F);
  const auto stinger = engine::spawn_hornet_stinger(world, hornet, player);
  CHECK(stinger.valid());
  CHECK(std::fabs(body->velocity.y + 0.4) < 1e-6);
  for (int step = 0; step < 39; ++step) engine::tick(world, 50.0);
  auto* projectile = world.entities().get(stinger);
  CHECK(projectile != nullptr && projectile->health.value == 10.0F);
  CHECK(projectile->lifetime_remaining_ms == 50.0);
  engine::tick(world, 50.0);
  projectile = world.entities().get(stinger);
  CHECK(projectile != nullptr && projectile->health.value == 0.0F);
  CHECK(projectile->death_processed);
  CHECK(projectile->death_time_ms == 3000.0);
  for (int step = 0; step < 19; ++step) engine::tick(world, 50.0);
  CHECK(world.entities().get(stinger) != nullptr);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(stinger) == nullptr);
}

void test_ai_target_motion_and_guard() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle spider = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 22, engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  engine::update_ai(world, 50.0);
  CHECK(spider_entity->ai.target == player);
  CHECK(spider_entity->velocity.x < 0.0);
  const float before = spider_entity->position.x.value;
  engine::integrate_movement(world, 50.0);
  CHECK(spider_entity->position.x.value < before);
  CHECK(std::fabs(std::fabs(spider_entity->angle.value) - 3.1415927F) < 0.01F);

  // An owned ant far from its hole draws two RNG values and heads to a guard
  // point inside 0.9 * guard_radius of the owner.
  engine::World guarded;
  guarded.initialize();
  guarded.set_auto_populate(false);
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
    guarded, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(1000.0F), engine::f32(0.0F)));
  CHECK(hole.valid());
  engine::EntityHandle ant{};
  for (const auto& entity : guarded.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.type_id == 7U) {
      ant = entity.handle;
      break;
    }
  }
  CHECK(ant.valid());
  engine::Entity* ant_entity = guarded.entities().get(ant);
  CHECK(ant_entity != nullptr);
  ant_entity->position = engine::Vec2(engine::f32(2000.0F), engine::f32(0.0F));
  const std::uint32_t rng_before = guarded.random().state();
  engine::update_ai(guarded, 50.0);
  CHECK(ant_entity->ai.guard_active);
  CHECK(guarded.random().state() != rng_before);
  const engine::f32 dx(ant_entity->ai.guard_point.x.value - 1000.0F);
  const engine::f32 dy(ant_entity->ai.guard_point.y.value);
  CHECK(dx.value * dx.value + dy.value * dy.value <= 450.0F * 450.0F);
}

void test_centipede_exact_chain_and_rare() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const std::uint32_t seed = 787621659U;
  world.random().seed(seed);
  std::uint32_t after_components = seed;
  for (int index = 0; index < 6; ++index) after_components = engine::ServerRng::successor(after_components);
  const std::uint32_t after_rare = engine::ServerRng::successor(after_components);
  std::uint32_t after_behavior = after_rare;
  for (int index = 0; index < 2; ++index) after_behavior = engine::ServerRng::successor(after_behavior);
  const std::uint32_t after_angle = engine::ServerRng::successor(after_behavior);
  const engine::f32 angle_sample(
    static_cast<float>(static_cast<std::uint32_t>(after_angle - 1U)));
  const engine::f32 angle(angle_sample.value * 2.925836239953128e-09F);
  const engine::EntityHandle head = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(head.valid());
  const engine::Entity* head_entity = world.entities().get(head);
  CHECK(head_entity != nullptr);
  CHECK(!head_entity->ai.rare);
  CHECK(head_entity->children.size() == 1U);
  const engine::Entity* first = world.entities().get(head_entity->children.front());
  CHECK(first != nullptr);
  const double expected_x = std::cos(static_cast<double>(angle.value)) * 70.0;
  const double expected_y = std::sin(static_cast<double>(angle.value)) * 70.0;
  CHECK(std::fabs(static_cast<double>(first->position.x.value) - expected_x) < 0.01);
  CHECK(std::fabs(static_cast<double>(first->position.y.value) - expected_y) < 0.01);
  CHECK(first->owner == head.raw);
  CHECK(first->ai.owner == head);
  CHECK(first->ai.predecessor == head);
  std::uint32_t after_chain = after_angle;
  for (int index = 0; index < 9 * 8; ++index) after_chain = engine::ServerRng::successor(after_chain);
  CHECK(world.random().state() == after_chain);
  std::size_t chain = 1;
  const engine::Entity* cursor = head_entity;
  while (!cursor->children.empty()) {
    cursor = world.entities().get(cursor->children.front());
    CHECK(cursor != nullptr);
    if (cursor == nullptr) break;
    ++chain;
  }
  CHECK(chain == 10U);

  // Native424 splits constraint links; native404 separately reparents ordinary
  // ownership. The next segment becomes a root, including middle removal.
  const engine::EntityHandle first_segment = head_entity->children.front();
  const engine::EntityHandle second_segment =
    world.entities().get(first_segment)->children.front();
  CHECK(world.destroy(head));
  CHECK(world.entities().get(head) == nullptr);
  const engine::Entity* root_segment = world.entities().get(first_segment);
  CHECK(root_segment != nullptr);
  CHECK(!root_segment->ai.predecessor.valid());
  CHECK(!root_segment->ai.owner.valid());
  CHECK(root_segment->owner == engine::kInvalidEntity);
  CHECK(engine::debug_linked_roots(world) == 1U);
  CHECK(engine::debug_linked_segments(world) == 8U);
  const engine::Entity* tail = world.entities().get(second_segment);
  CHECK(tail != nullptr);
  CHECK(tail->ai.predecessor == first_segment);
  CHECK(tail->ai.owner == first_segment);
  const engine::EntityHandle third_segment = tail->children.front();
  CHECK(world.destroy(second_segment));
  const engine::Entity* third = world.entities().get(third_segment);
  CHECK(third != nullptr);
  CHECK(!third->ai.predecessor.valid());
  CHECK(third->ai.owner == first_segment);
  CHECK(third->owner == first_segment.raw);
  CHECK(world.entities().get(first_segment)->children.front() == third_segment);

  // Find a seed whose first draw makes the rare (< 1%) roll true.
  std::uint32_t rare_seed = 0;
  for (std::uint32_t candidate = 1; candidate < 100000U; ++candidate) {
    std::uint32_t draw = candidate;
    for (int index = 0; index < 7; ++index) draw = engine::ServerRng::successor(draw);
    const float fraction = static_cast<float>(draw - 1U) / 2147483648.0F;
    if (fraction < 0.01F) { rare_seed = candidate; break; }
  }
  CHECK(rare_seed != 0U);
  engine::World rare_world;
  rare_world.initialize();
  rare_world.set_auto_populate(false);
  rare_world.set_dimensions(engine::f32(50000.0F), engine::f32(50000.0F));
  rare_world.random().seed(rare_seed);
  const engine::EntityHandle rare_head = engine::spawn_entity_from_defaults(
    rare_world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(rare_head.valid());
  const engine::Entity* rare_entity = rare_world.entities().get(rare_head);
  CHECK(rare_entity != nullptr);
  CHECK(rare_entity->ai.rare);
  std::size_t rare_chain = 1;
  const engine::Entity* rare_cursor = rare_entity;
  while (!rare_cursor->children.empty()) {
    rare_cursor = rare_world.entities().get(rare_cursor->children.front());
    CHECK(rare_cursor != nullptr);
    if (rare_cursor == nullptr) break;
    ++rare_chain;
  }
  CHECK(rare_chain == 50U);
}

void test_ai_round_before_remainder() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto handle = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 15U, {});
  auto* entity = world.entities().get(handle);
  entity->ai.current_angle = engine::f32(5.961493492126465F);
  entity->ai.behavior_choice = 1U;
  entity->ai.timer_active = false;
  entity->velocity = {};
  engine::update_ai(world, 50.0);
  // Shipped original func654, garden head3572024024 first tick.
  CHECK(entity->ai.current_angle.value == -0.32139188051223755F);
  CHECK(entity->velocity.x == static_cast<double>(
    engine::f32(std::cos(entity->angle.value) * 0.01F).value));
  CHECK(entity->velocity.y == static_cast<double>(
    engine::f32(std::sin(entity->angle.value) * 0.01F).value));
}

void test_ai_activity_branch_and_wire() {
  engine::WorkerApi api;
  api.init(false);
  auto& world = api.world();
  const auto player = engine::spawn_player_default(world, "activity", engine::make_default_profile(), false);
  world.entities().get(player)->position = {};
  const auto mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 22U,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  auto* entity = world.entities().get(mob);
  entity->ai.activity_flags = 0x80U; // preserve the other original byte bits
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.target == player);
  CHECK(entity->ai.activity_flags == 0x81U);
  CHECK(world.destroy(player));
  CHECK(entity->ai.activity_flags == 0x81U); // target destruction is not the AI branch
  {
    constexpr bool full = false;
    api.set_default_dense_groups(false);
    const auto packet = api.domain_snapshot_bytes(1U);
    engine::ByteWriter expected;
    expected.write_u32_le(mob.to_wire()); expected.write_u8(55U);
    expected.write_u32_le((1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29));
    expected.write_varint32(36U); expected.write_u8(0x81U); expected.write_u8(0U);
    if (full) CHECK(std::search(packet.begin(), packet.end(), expected.bytes().begin(), expected.bytes().end()) != packet.end());
    else {
      engine::ByteReader sparse(packet);
      (void)sparse.read_u8(); for (unsigned i = 0; i < 5; ++i) (void)sparse.read_varint32();
      (void)sparse.read_u32_le(); (void)sparse.read_u8(); (void)sparse.read_u32_le();
      unsigned field = 0; bool saw_activity = false;
      for (auto delta = sparse.read_varint32().value(); delta != 0; delta = sparse.read_varint32().value()) {
        field += delta;
        if (field == 8U) (void)sparse.read_u16_le();
        else if (field == 2U || field == 26U || field == 31U || field == 36U || field == 38U) {
          const auto value = sparse.read_u8().value();
          if (field == 36U) { CHECK(value == 0x81U); saw_activity = true; }
        } else (void)sparse.read_f32_le();
      }
      CHECK(saw_activity && sparse.eof());
    }
  }
  engine::SnapshotEncoder dense;
  dense.begin(1U); dense.write_dense_default_groups(*entity);
  const auto packet = dense.finish(); engine::ByteReader reader(packet);
  (void)reader.read_u8(); for (unsigned i = 0; i < 5; ++i) (void)reader.read_varint32();
  (void)reader.read_u32_le(); (void)reader.read_u8();
  (void)reader.read_u8(); (void)reader.read_u8();
  CHECK(reader.read_u8().value() == 0x81U);
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.activity_flags == 0x80U);
  entity->ai.activity_flags = 1U; entity->health = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.activity_flags == 1U); // corpse keeps its last flags
}

void test_ant_hole_exact_children() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const std::uint32_t before = world.random().state();
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  std::uint32_t expected = before;
  // 3 definition-component draws for the hole, then each of six children draws
  // 5 definition components, one ant turn value, two configureBehavior values
  // and one scatter angle.
  for (int index = 0; index < 3 + 6 * 9; ++index) expected = engine::ServerRng::successor(expected);
  CHECK(world.random().state() == expected);
  std::array<int, 23> counts{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id < counts.size()) ++counts[entity.type_id];
    if (entity.type_id >= 7U && entity.type_id <= 9U) {
      CHECK(entity.owner == hole.raw);
      CHECK(entity.ai.owner == hole);
      CHECK(entity.position.x.value == 100.0F);
      CHECK(entity.position.y.value == 100.0F);
      const double speed = std::sqrt(entity.velocity.x * entity.velocity.x
                                   + entity.velocity.y * entity.velocity.y);
      CHECK(std::fabs(speed - 0.25F) < 1e-6F);
    }
  }
  CHECK(counts[7] == 3);
  CHECK(counts[8] == 2);
  CHECK(counts[9] == 1);
  CHECK(counts[11] == 1);
}

void test_ant_hole_release() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  world.random().seed(787621659U);
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  CHECK(world.random().state() == 52603575U);
  CHECK(world.ant_hole_releases().size() == 1U);
  CHECK(world.ant_hole_releases()[0].release_index == 0U);

  std::array<int, 23> counts{};
  const auto recount = [&]() {
    counts.fill(0);
    for (const auto& entity : world.entities().entities()) {
      if (entity.active && entity.kind == engine::EntityKind::kMob
          && entity.type_id < counts.size()) ++counts[entity.type_id];
    }
  };
  recount();
  CHECK(counts[7] == 3);
  CHECK(counts[8] == 2);
  CHECK(counts[9] == 1);
  CHECK(counts[11] == 1);

  // 280/300 = 0.9333: entries 0 (0.97) and 1 (0.95) pass, entry 2 (0.93)
  // stops the loop. Each baby/worker spawn draws 9 construction values plus
  // one release angle.
  engine::Entity* hole_entity = world.entities().get(hole);
  hole_entity->health = engine::f32(280.0F);
  engine::release_ant_hole_ants(world);
  CHECK(world.ant_hole_releases()[0].release_index == 2U);
  std::uint32_t expected = 52603575U;
  for (int draw = 0; draw < 2 * 9; ++draw) expected = engine::ServerRng::successor(expected);
  CHECK(world.random().state() == expected);
  recount();
  CHECK(counts[7] == 4);
  CHECK(counts[8] == 3);
  CHECK(counts[9] == 1);
  CHECK(counts[10] == 0);

  int released = 0;
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id < 7U || entity.type_id > 8U) continue;
    if (entity.position.x.value != 100.0F || entity.position.y.value != 100.0F) continue;
    CHECK(entity.owner == hole.raw);
    CHECK(entity.ai.owner == hole);
    CHECK(entity.entity_flags == 98U);
    CHECK(entity.spawn_band == 255U);
    const double speed = std::sqrt(entity.velocity.x * entity.velocity.x
                                 + entity.velocity.y * entity.velocity.y);
    CHECK(std::fabs(speed - 0.25F) < 1e-6F);
    ++released;
  }
  CHECK(released == 7); // five starting baby/worker children plus two released ants

  // 20/300 = 0.0667: entries 2..27 pass, including the queen at entry 18.
  hole_entity = world.entities().get(hole);
  hole_entity->health = engine::f32(20.0F);
  engine::release_ant_hole_ants(world);
  CHECK(world.ant_hole_releases()[0].release_index == 28U);
  recount();
  CHECK(counts[7] == 5);
  CHECK(counts[8] == 8);
  CHECK(counts[9] == 20);
  CHECK(counts[10] == 1);

  // Zero health drains the final five soldier entries (28..32).
  hole_entity = world.entities().get(hole);
  hole_entity->health = engine::f32(0.0F);
  engine::release_ant_hole_ants(world);
  CHECK(world.ant_hole_releases()[0].release_index == 33U);
  recount();
  CHECK(counts[7] == 5);
  CHECK(counts[8] == 8);
  CHECK(counts[9] == 25);
  CHECK(counts[10] == 1);
  int ants = 0;
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id >= 7U && entity.type_id <= 10U) ++ants;
  }
  CHECK(ants == 39); // six starting children plus 33 table entries

  // The tick hook runs after movement and before contact damage.
  engine::World ticked;
  ticked.initialize();
  ticked.set_auto_populate(false);
  ticked.random().seed(787621659U);
  const engine::EntityHandle ticked_hole = engine::spawn_entity_from_defaults(
    ticked, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(ticked_hole.valid());
  ticked.entities().get(ticked_hole)->health = engine::f32(280.0F);
  engine::tick(ticked, 50.0);
  std::array<int, 23> ticked_counts{};
  for (const auto& entity : ticked.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kMob
        && entity.type_id < ticked_counts.size()) ++ticked_counts[entity.type_id];
  }
  CHECK(ticked_counts[7] == 4);
  CHECK(ticked_counts[8] == 3);
  CHECK(ticked_counts[9] == 1);

  // Destruction removes the release record, so a reused slot cannot release.
  CHECK(ticked.destroy(ticked_hole));
  CHECK(ticked.ant_hole_releases().empty());

  // Equality releases: 291/300 rounds to the same binary32 value as entry 0.
  engine::World edge;
  edge.initialize();
  edge.set_auto_populate(false);
  const engine::EntityHandle edge_hole = engine::spawn_entity_from_defaults(
    edge, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(edge_hole.valid());
  edge.entities().get(edge_hole)->health = engine::f32(292.0F);
  engine::release_ant_hole_ants(edge);
  CHECK(edge.ant_hole_releases()[0].release_index == 0U);
  edge.entities().get(edge_hole)->health = engine::f32(291.0F);
  engine::release_ant_hole_ants(edge);
  CHECK(edge.ant_hole_releases()[0].release_index == 1U);
}

void test_web_tag_domain_side_effects() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  CHECK(player.valid());
  // spawn_player_default uses a random garden point; pin it next to the web tag
  // so this test exercises the player-inside-area branch deterministically.
  world.entities().get(player)->set_position_x(engine::f32(0.0F));
  world.entities().get(player)->set_position_y(engine::f32(0.0F));
  const engine::EntityHandle target = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(40.0F), engine::f32(0.0F)));
  CHECK(target.valid());
  const engine::EntityHandle petal = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 29, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)),
    engine::f32(20.0F));
  CHECK(petal.valid());
  engine::Entity* petal_entity = world.entities().get(petal);
  CHECK(petal_entity != nullptr);
  petal_entity->owner = player.raw;
  engine::on_petal_hit(world, petal, target, player);
  CHECK(world.area_effects().empty());
  petal_entity->petal_launched = true; // state1 set by original733 on release
  (void)engine::damage_entity(world, petal, petal_entity->health, player);
  engine::EntityHandle tag{};
  for (const auto& entity : world.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kProjectile && entity.type_id == 29U) {
      tag = entity.handle;
      break;
    }
  }
  CHECK(tag.valid());
  const engine::Entity* tag_entity = world.entities().get(tag);
  CHECK(tag_entity != nullptr);
  if (tag_entity == nullptr) return;
  CHECK(tag_entity->collision_radius.value == 50.0F);
  CHECK(tag_entity->position.x.value == 30.0F);
  CHECK(tag_entity->lifetime_remaining_ms == 12000.0);
  CHECK(tag_entity->health.value == 5.0F);
  CHECK(tag_entity->max_health.value == 5.0F);
  CHECK(tag_entity->physics_flag50);
  CHECK(tag_entity->has_score_component);
  CHECK(tag_entity->has_tag_component);
  CHECK(tag_entity->has_effect_area);
  CHECK((tag_entity->entity_flags & 8U) != 0U);
  CHECK((tag_entity->world_flags & 128U) != 0U);
  CHECK(tag_entity->packet_epoch_a != 0U);
  (void)world.update_area_effects();
  CHECK(engine::slow_multiplier(*world.entities().get(target)).value == 0.25F);
  // The player is inside the tag's 50-unit square too; the area pass must slow
  // the player as well, which is the reported "including yourself" case.
  CHECK(engine::slow_multiplier(*world.entities().get(player)).value == 0.25F);
  const auto& areas = world.area_effects();
  bool found = false;
  for (const auto& area : areas) {
    if (area.owner == tag && area.scale.value == 50.0F) found = true;
  }
  CHECK(found);
}
