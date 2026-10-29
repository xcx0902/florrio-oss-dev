void test_dense_field_catalog() {
  CHECK(engine::kDenseGroups.size() == 19);
  const auto* group52 = engine::dense_group_for_field(22);
  CHECK(group52 != nullptr);
  CHECK(group52->offset == 52);
  const auto* group152 = engine::dense_group_for_field(59);
  CHECK(group152 != nullptr);
  CHECK(group152->offset == 152);
  const auto* extended = engine::dense_group_for_field(60);
  CHECK(extended == group152);
  CHECK(engine::dense_group_for_field(64) == nullptr);
}


void test_progression() {
  CHECK(engine::growth_factor(0) == 1.0);
  CHECK(std::fabs(engine::growth_factor(1) - 1.06) < 1e-15);
  CHECK(std::fabs(engine::growth_factor(2) - 1.1236) < 1e-12);
  CHECK(std::fabs(engine::growth_factor(-1) - (1.0 / 1.06)) < 1e-15);
  CHECK(engine::experience_threshold(0).to_float() == 3.0F);
  CHECK(engine::experience_threshold(1).to_float() == 4.0F);
  CHECK(engine::experience_threshold(2).to_float() == 5.0F);
  CHECK(engine::rarity_experience(0).to_float() == 2.0F);
  CHECK(engine::rarity_experience(5).to_float() == 2500.0F);
  CHECK(engine::rarity_experience(6).to_float() == 0.0F);
  engine::PlayerProfile profile;
  CHECK(profile.level() == 0);
  profile.add_experience(engine::f32(3.0F));
  CHECK(profile.level() == 1);
  CHECK(profile.experience().to_float() == 0.0F);
  profile.add_experience(engine::f32(100.0F));
  CHECK(profile.level() > 1);
  CHECK(profile.inventory_size() == 13);
  CHECK(profile.active_slots() == 5);
}

void test_reward_health_and_level_cap() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto handle = engine::spawn_player_default(world, "progression",
    engine::make_default_profile(), false);
  auto* player = world.entities().get(handle);
  CHECK(player != nullptr);
  // Original func215/145 oracle: multiple levels must retain each intermediate
  // multiply/divide rounding, including the sub-maximum result at level 11.
  const float rewards[] = {3.0F, 3.0F, 10.0F, 100.0F};
  const unsigned levels[] = {1U, 2U, 4U, 11U};
  const float health[] = {100.0F, 101.13636016845703F, 103.40908813476562F, 111.3636245727539F};
  for (unsigned i = 0; i < 4; ++i) {
    engine::award_player_experience(world, engine::f32(rewards[i]));
    CHECK(world.profile().level() == levels[i]);
    CHECK(player->health.value == health[i]);
    CHECK(player->max_health == engine::player_level_max_health(world.profile().level()));
  }
  CHECK(world.loadout().score().value == 116.0F);
  CHECK(world.profile().experience().value == 11.0F);
  world.profile().set_level(98U);
  world.profile().set_experience(engine::f32(0.0F));
  engine::award_player_experience(world, engine::f32(1e8F));
  CHECK(world.profile().level() == 99U);
  CHECK(player->max_health.value == 150.0F);
  engine::World restored;
  restored.initialize();
  auto profile = engine::make_default_profile();
  profile.set_level(2U);
  const auto respawn = engine::spawn_player_default(restored, "restored", profile, false);
  CHECK(restored.entities().get(respawn)->health.value == 101.13636016845703F);
}

void test_player_default_spawn() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "default", engine::make_default_profile());
  CHECK(player.valid());
  CHECK(world.player() == player);
  CHECK(world.player_name() == "default");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(entity->contact_damage.to_float() == 25.0F);
  CHECK(world.profile().level() == 1);
  CHECK(world.profile().inventory_count() == 5);
  CHECK(world.profile().inventory(0) == 1);
  CHECK(world.loadout().slots()[0].type_id == 1);
  CHECK(world.loadout().slots()[4].type_id == 1);
  CHECK(world.loadout().slots()[5].count == 0);
  CHECK(entity->position.x.to_float() >= -25000.0F);
  CHECK(entity->position.x.to_float() <= -25000.0F + 15000.0F);
  CHECK(entity->position.y.to_float() >= -2000.0F);
  CHECK(entity->position.y.to_float() <= 2000.0F);
  const std::size_t petals = engine::spawn_loadout_petals(world);
  CHECK(petals == 5);
  CHECK(world.petals().size() == 5);
  CHECK(world.petals()[0].profile == static_cast<std::uint8_t>(engine::OrbitProfile::kBasic));
}

void test_petal_combat_catalog() {
  const auto* basic = engine::Catalog::instance().petal_combat(1);
  CHECK(basic != nullptr);
  CHECK(basic->collisionRadius == 10.0F);
  CHECK(basic->damage == 10.0F);
  CHECK(basic->health == 10.0F);
  CHECK(std::string(basic->orbitProfile) == "basic");
  CHECK(engine::Catalog::instance().petal(1)->instancesPerSlot == 1);
  const auto* rock = engine::Catalog::instance().petal_combat(4);
  CHECK(rock != nullptr);
  CHECK(engine::Catalog::instance().petal(4)->rarityIndex == 2);
  CHECK(rock->collisionRadius == 14.0F);
  CHECK(rock->health == 90.0F);
  const auto* corn = engine::Catalog::instance().petal_combat(38);
  CHECK(corn != nullptr);
  CHECK(corn->health == 2000.0F);
  CHECK(engine::Catalog::instance().petal(38)->rechargeMilliseconds == 45000.0F);
  const auto* rose = engine::Catalog::instance().petal_combat(6);
  CHECK(rose != nullptr);
  CHECK(rose->orbitFunctionIndex == 665);
  CHECK(engine::Catalog::instance().petal_combat(99) == nullptr);
}

void test_drop_chances() {
  const auto* rock = engine::Catalog::instance().drop_table(1);
  CHECK(rock != nullptr);
  CHECK(rock->dropCount == 3);
  CHECK(rock->drops[0].petalTypeId == 4);
  CHECK(std::fabs(rock->drops[0].chance - 0.00522140646353364) < 1e-12);
  CHECK(rock->drops[2].petalTypeId == 3);
  CHECK(std::fabs(rock->drops[2].chance - 0.10442813485860825) < 1e-12);
  const auto* alias = engine::Catalog::instance().drop_table(16);
  CHECK(alias != nullptr);
  CHECK(alias->aliasOf == 15);
  CHECK(alias->dropCount == 6);
  engine::ServerRng rng(1);
  const auto loot = engine::roll_entity_loot(rng, 1, false);
  for (const auto petal : loot) CHECK(petal == 2 || petal == 3 || petal == 4);
  engine::ServerRng compact_rng(1);
  const auto compact_loot = engine::roll_entity_loot(compact_rng, 1, true);
  CHECK(compact_loot.size() <= loot.size() + 3);
}

void test_loot_retention() {
  engine::PlayerProfile profile;
  profile.set_level(10);
  profile.set_inventory(0, 4);
  profile.set_inventory(1, 1);
  profile.set_inventory(2, 15);
  profile.set_inventory(3, 24);
  profile.set_inventory(4, 2);
  profile.set_inventory_count(5);
  profile.push_backpack(2);
  engine::ServerRng rng(7);
  engine::ServerRng shuffle_rng(1);
  const engine::LootResult result = engine::retain_player_loot(profile, rng, shuffle_rng);
  CHECK(result.retained_count <= 3);
  CHECK(result.lost_count <= 10);
  for (std::uint8_t index = 0; index < result.retained_count; ++index) CHECK(result.retained[index] != 1);
  CHECK(profile.lost_count() == result.lost_count);
  CHECK(profile.inventory_count() == result.retained_count);
  CHECK(profile.backpack_count() == 0);
  CHECK(engine::loot_lifetime_ms(1) == 32000.0);
  CHECK(engine::loot_lifetime_ms(4) == 42000.0);
  CHECK(engine::loot_lifetime_ms(15) == 52000.0);
  CHECK(engine::loot_lifetime_ms(24) == 42000.0);
  CHECK(engine::loot_lifetime_ms(35) == 62000.0);
}

void test_healing_clamp() {
  engine::Entity entity;
  entity.health = engine::f32(5.0F);
  entity.max_health = engine::f32(10.0F);
  CHECK(engine::heal_entity(entity, engine::f32(3.0F)).to_float() == 8.0F);
  CHECK(engine::heal_entity(entity, engine::f32(100.0F)).to_float() == 10.0F);
  CHECK(engine::heal_entity(entity, engine::f32(-100.0F)).to_float() == 0.0F);
  entity.health = engine::f32(0.0F);
  CHECK(engine::heal_entity(entity, engine::f32(5.0F)).to_float() == 0.0F);
}

void test_contact_combat_and_loot() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  engine::Entity* player_entity = world.entities().get(player);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(mob.valid());
  engine::Entity* mob_entity = world.entities().get(mob);
  const engine::f32 player_health = player_entity->health;
  const engine::f32 mob_health = mob_entity->health;
  const std::size_t contacts = engine::resolve_contacts(world);
  CHECK(contacts > 0);
  CHECK(player_entity->health.value < player_health.value);
  CHECK(mob_entity->health.value < mob_health.value);
  engine::damage_entity(world, mob, engine::f32(1000.0F), player);
  const engine::Entity* corpse = world.entities().get(mob);
  CHECK(corpse != nullptr);
  CHECK(corpse->death_processed);
  CHECK(corpse->health.value == 0.0F);
  CHECK(world.profile().experience().value >= 0.0F);
  CHECK(world.destroy(mob));
}

void test_multi_instance_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "orbit", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 24);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 24));
  CHECK(engine::spawn_loadout_petals(world) == 3);
  CHECK(world.petals().size() == 3);
  CHECK(world.petals()[0].extra_radius.to_float() == 11.0F);
  CHECK(world.petals()[0].instance_count == 3);
  CHECK(std::fabs(world.petals()[0].angle.to_float() - 0.0F) < 1e-6F);
  // R06: Rose has definition+41 set, so original function 85 gives all three
  // instances the same orbit index (petal +18); the ring position is shared and
  // the per-instance separation comes from the extra radius (+44 = 11) added
  // at angle*1.1 + instance*2*pi/3.
  CHECK(std::fabs(world.petals()[1].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(std::fabs(world.petals()[2].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(world.petals()[1].orbit_index == world.petals()[0].orbit_index);
  CHECK(world.petals()[2].orbit_index == world.petals()[0].orbit_index);
}

void test_orbit_reindex_after_removal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "reindex", engine::make_default_profile()).valid());
  for (std::uint8_t slot = 0; slot < 5; ++slot)
    world.profile().set_inventory(slot, static_cast<std::uint16_t>(slot + 1));
  world.profile().set_inventory_count(5);
  world.loadout().clear();
  for (std::uint8_t slot = 0; slot < 5; ++slot)
    CHECK(world.loadout().equip(slot, static_cast<std::uint16_t>(slot + 1)));
  CHECK(engine::spawn_loadout_petals(world) == 5U);
  CHECK(world.loadout().change_slot_type(world, world.profile(), 2, 0));
  engine::assign_petal_orbit_indices(world);
  CHECK(world.petals().size() == 4U);
  CHECK(world.loadout().orbit_positions() == 4U);
  std::array<std::uint8_t, 4> indices{};
  for (std::size_t index = 0; index < world.petals().size(); ++index)
    indices[index] = world.petals()[index].orbit_index;
  std::sort(indices.begin(), indices.end());
  CHECK(indices[0] == 0U && indices[1] == 1U && indices[2] == 2U && indices[3] == 3U);
}

void test_flag41_slot_without_component_keeps_shared_position() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-slot", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 24);
  world.profile().set_inventory(1, 1);
  world.profile().set_inventory_count(2);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 24));
  CHECK(world.loadout().equip(1, 1));
  CHECK(engine::spawn_loadout_petals(world) == 4U);
  // Replace Rose's third instance with a live entity that has no petal
  // component. Original function 85 adds only the already-used shared
  // position, so Basic remains at orbit 1 instead of jumping to 2.
  const engine::EntityHandle componentless = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 1U, engine::Vec2{engine::f32(20.0F), engine::f32(0.0F)},
    engine::f32(14.0F), 0U, 0U);
  CHECK(componentless.valid());
  world.loadout().set_handle(0, 2, componentless);
  engine::assign_petal_orbit_indices(world);
  const engine::EntityHandle basic = world.loadout().handle(1, 0);
  engine::PetalOrbitState* basic_state = nullptr;
  for (auto& state : world.petals()) if (state.handle == basic) basic_state = &state;
  CHECK(basic_state != nullptr);
  CHECK(basic_state->orbit_index == 1U);
}

void test_peas_attack_consumes_petal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "peas", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 11);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 11));
  CHECK(engine::spawn_loadout_petals(world) == 1U);
  const engine::EntityHandle pea = world.petals()[0].handle;
  world.advance_tick(600.0);
  world.apply_input(1U, engine::f32(0.0F), engine::f32(0.0F));
  engine::update_petal_orbits(world, 16.0);
  CHECK(world.entities().get(pea) == nullptr);
  std::uint32_t children = 0;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kPetal && entity.type_id == 11)
      ++children;
  CHECK(children == 4U);
  CHECK(world.run_deferred_launches(world.time_ms() + 1.0) >= 1U);
}

void test_twin_widens_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "twin-space", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 16);
  world.profile().set_inventory(1, 1);
  world.profile().set_inventory_count(2);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 16));
  CHECK(world.loadout().equip(1, 1));
  CHECK(engine::spawn_loadout_petals(world) == 3U);
  // Twin reserves two positions; Basic therefore sits at 4*pi/3 rather than
  // the old five-slot 2*pi/5 that left the Twin pair overlapping it.
  CHECK(world.petals()[0].orbit_index == 0U);
  CHECK(world.petals()[1].orbit_index == 1U);
  CHECK(world.petals()[2].orbit_index == 2U);
  CHECK(std::fabs(world.petals()[0].orbit_angle - 0.0) < 1e-6);
  CHECK(std::fabs(world.petals()[1].orbit_angle - 2.0943951023931953) < 1e-5);
  CHECK(std::fabs(world.petals()[2].orbit_angle - 4.1887902047863905) < 1e-5);
}

void test_rose_healing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  for (int index = 0; index < 200; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
  const engine::Entity* petal_entity = world.entities().get(petal);
  CHECK(petal_entity == nullptr);
  CHECK(world.loadout().slots()[0].instances[0] != petal);
}

void test_rose_contracts_orbit_and_heals_promptly() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-orbit", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  world.apply_input(1, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(world.petals()[0].orbit_radius.to_float() == 65.0F);
  world.apply_input(2, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(world.petals()[0].orbit_radius.to_float() == 40.0F);
  world.apply_input(1, engine::f32(0.0F), engine::f32(1.0F));
  // The native timer arms after one second, then the ten-step behavior state
  // advances one step per tick, so the first heal lands in ~1.45 seconds.
  for (int index = 0; index < 25; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
  CHECK(player->health.to_float() < 52.0F);
  engine::tick(world, 50.0);
  CHECK(player->health.to_float() < 52.0F);
  engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 55.0F);
}

void test_rose_timer_arms_at_full_health() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-armed", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  // Hold the Rose while healthy long enough to arm the native 1000 ms timer.
  for (int index = 0; index < 25; ++index) engine::tick(world, 50.0);
  player->health = engine::f32(50.0F);
  for (int index = 0; index < 10; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
}

void test_petal_recharge() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  world.loadout().equip(0, 2); // Fast: 500 ms recharge, one instance.
  const std::size_t spawned = engine::spawn_loadout_petals(world);
  CHECK(spawned >= 1);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  CHECK(petal.valid());
  CHECK(engine::damage_entity(world, petal, engine::f32(1000.0F)).died);
  const engine::Entity* petal_corpse = world.entities().get(petal);
  CHECK(petal_corpse != nullptr);
  CHECK(petal_corpse->death_processed);
  CHECK(world.loadout().slots()[0].recharge_remaining_ms > 0.0);
  const double remaining = world.loadout().slots()[0].recharge_remaining_ms;
  CHECK(remaining == 500.0);
  engine::refresh_loadout_petals(world, 500.0);
  CHECK(world.loadout().slots()[0].instances[0].valid());
  CHECK(world.entities().get(world.loadout().slots()[0].instances[0]) != nullptr);
}


void test_auto_population() {
  engine::WorkerApi api;
  api.init(true);
  std::size_t mobs = 0;
  for (const auto& entity : api.world().entities().entities()) {
    // Count only band-assigned population; special initializers such as the
    // Centipede chain add unbanded children.
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.spawn_band < 8U) ++mobs;
  }
  CHECK(mobs >= 700);
  CHECK(mobs <= 900);
}

void test_ant_hole_children() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 11,
    engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  std::array<int, 23> counts{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id < counts.size()) ++counts[entity.type_id];
  }
  CHECK(counts[7] == 3);
  CHECK(counts[8] == 2);
  CHECK(counts[9] == 1);
  CHECK(counts[11] == 1);
}

void test_population_targets() {
  const auto targets = engine::population_targets(engine::f32(50000.0F), engine::f32(4000.0F));
  CHECK(targets[0] == 120);
  CHECK(targets[1] == 120);
  CHECK(targets[2] == 119);
  CHECK(targets[3] == 120);
  CHECK(targets[4] == 119);
  CHECK(targets[5] == 119);
  CHECK(targets[6] == 40);
  CHECK(targets[7] == 40);
}

void test_worker_api_default_spawn() {
  engine::WorkerApi api;
  api.init();
  engine::ByteWriter writer;
  writer.write_varint32(1);
  writer.write_varint32(6);
  for (const char byte : std::string("default")) writer.write_u8(static_cast<std::uint8_t>(byte));
  writer.write_u8(0);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  CHECK(api.send(packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player_name() == "default");
  CHECK(api.world().profile().level() == 1);
  CHECK(api.world().profile().inventory_count() == 5);
  CHECK(api.world().loadout().slots()[0].type_id == 1);
  const engine::Entity* entity = api.world().entities().get(api.world().player());
  CHECK(entity != nullptr);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  const engine::EntityHandle first = api.world().player();
  const engine::f32 before_x = entity->position.x;
  engine::ByteWriter input;
  input.write_varint32(2);
  input.write_varint32(12);
  input.write_varint32(0);
  input.write_f32_le(0.0F);
  input.write_f32_le(635.0F);
  std::vector<std::uint8_t> input_packet = input.bytes();
  engine::apply_packet_xor(input_packet, key);
  CHECK(api.send(input_packet, key));
  api.think();
  CHECK(entity->position.x.value > before_x.value);
  (void)engine::damage_entity(api.world(), first, entity->health);
  const engine::Entity* first_corpse = api.world().entities().get(first);
  CHECK(first_corpse != nullptr);
  if (first_corpse == nullptr) return;
  CHECK(first_corpse->death_processed);
  CHECK(first_corpse->health.value == 0.0F);
  CHECK(first_corpse->death_time_ms == api.world().time_ms() + 1000.0);
  CHECK(api.world().player() == first);
  engine::ByteWriter respawn;
  respawn.write_varint32(3);
  respawn.write_varint32(6);
  for (const char byte : std::string("default")) respawn.write_u8(static_cast<std::uint8_t>(byte));
  respawn.write_u8(0);
  std::vector<std::uint8_t> respawn_packet = respawn.bytes();
  engine::apply_packet_xor(respawn_packet, key);
  CHECK(api.send(respawn_packet, key));
  // A live corpse still owns the controlled handle, so an early spawn request
  // cannot replace it. The ordinary sweep releases it exactly 1000ms later.
  CHECK(api.world().player() == first);
  CHECK(api.world().entities().get(first)->health.value == 0.0F);
  for (unsigned step = 0; step < 19U; ++step) api.think();
  CHECK(api.world().entities().get(first) != nullptr);
  CHECK(api.world().player() == first);
  CHECK(api.world().time_ms() == first_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(first) == nullptr);
  CHECK(!api.world().player().valid());
  engine::ByteWriter reopen;
  // Death releases the corpse after 1000ms; original peer+288 independently
  // blocks the next spawn until 2500ms after the previous successful spawn.
  while (api.world().time_ms() < 2500.0) api.think();
  reopen.write_varint32(4);
  reopen.write_varint32(6);
  for (const char byte : std::string("default")) reopen.write_u8(static_cast<std::uint8_t>(byte));
  reopen.write_u8(0);
  std::vector<std::uint8_t> reopen_packet = reopen.bytes();
  engine::apply_packet_xor(reopen_packet, key);
  CHECK(api.send(reopen_packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player() != first);
  CHECK(api.world().entities().get(api.world().player()) != nullptr);
  const engine::EntityHandle second = api.world().player();
  CHECK(api.world().entities().get(second)->health.value > 0.0F);
  engine::ByteWriter suicide;
  suicide.write_varint32(5);
  suicide.write_varint32(3);
  suicide.write_varint32(0);
  std::vector<std::uint8_t> suicide_packet = suicide.bytes();
  engine::apply_packet_xor(suicide_packet, key);
  CHECK(api.send(suicide_packet, key));
  api.think();
  const engine::Entity* second_corpse = api.world().entities().get(second);
  CHECK(second_corpse != nullptr);
  if (second_corpse == nullptr) return;
  CHECK(second_corpse->death_processed);
  CHECK(second_corpse->health.value == 0.0F);
  // Original opcode 3 calls damage43 synchronously in send(). think() above
  // already advanced 50ms toward that existing deadline.
  CHECK(second_corpse->death_time_ms == api.world().time_ms() + 950.0);
  CHECK(api.world().player() == second);
  for (unsigned step = 0; step < 18U; ++step) api.think();
  CHECK(api.world().entities().get(second) != nullptr);
  CHECK(api.world().player() == second);
  CHECK(api.world().time_ms() == second_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(second) == nullptr);
  CHECK(!api.world().player().valid());
  engine::ByteWriter restart;
  while (api.world().time_ms() < 5000.0) api.think();
  restart.write_varint32(6);
  restart.write_varint32(4);
  std::vector<std::uint8_t> restart_packet = restart.bytes();
  engine::apply_packet_xor(restart_packet, key);
  CHECK(api.send(restart_packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player() != second);
  const engine::Entity* restarted = api.world().entities().get(api.world().player());
  CHECK(restarted != nullptr);
  if (restarted != nullptr) CHECK(restarted->health.value > 0.0F);
}
