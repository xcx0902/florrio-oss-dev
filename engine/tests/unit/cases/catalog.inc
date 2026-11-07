void test_dense_field_catalog() {
  CHECK(engine::protocol::kDenseGroups.size() == 19);
  const auto* dropState = engine::dense_group_for_field(22);
  CHECK(dropState == engine::dense_group(engine::protocol::Component::kDropState));
  CHECK(dropState->component == engine::protocol::Component::kDropState);
  const auto* identity = engine::dense_group_for_field(59);
  CHECK(identity == engine::dense_group(engine::protocol::Component::kIdentity));
  const auto* extended = engine::dense_group_for_field(60);
  CHECK(extended == identity);
  CHECK(engine::dense_group_for_field(64) == nullptr);
  CHECK(engine::dense_group(engine::protocol::Component::kProjectileTag) == nullptr);
}

void test_progression() {
  CHECK(engine::growth_factor(0) == 1.0);
  CHECK(std::fabs(engine::growth_factor(1) - 1.06) < 1e-15);
  CHECK(std::fabs(engine::growth_factor(2) - 1.1236) < 1e-12);
  CHECK(std::fabs(engine::growth_factor(-1) - (1.0 / 1.06)) < 1e-15);
  CHECK(engine::experience_threshold(0).to_float() == 3.0F);
  CHECK(engine::experience_threshold(1).to_float() == 4.0F);
  CHECK(engine::experience_threshold(2).to_float() == 5.0F);
  CHECK(engine::rarity_experience(engine::catalog::Rarity::kCommon).to_float() == 2.0F);
  CHECK(engine::rarity_experience(engine::catalog::Rarity::kUnique).to_float() == 2500.0F);
  CHECK(engine::rarity_experience(engine::catalog::Rarity::kUltra).to_float() == 0.0F);
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
  const auto handle = engine::spawn_player_default(
      world, engine::test::player(world), "progression", engine::make_default_profile(), false);
  auto* player = world.entities().get(handle);
  CHECK(player != nullptr);
  // Multiple levels must retain each intermediate multiply/divide rounding,
  // including the sub-maximum result at level 11.
  const float rewards[] = {3.0F, 3.0F, 10.0F, 100.0F};
  const unsigned levels[] = {1U, 2U, 4U, 11U};
  const float health[] = {100.0F, 101.13636016845703F, 103.40908813476562F, 111.3636245727539F};
  for (unsigned i = 0; i < 4; ++i) {
    engine::award_player_experience(world, engine::test::player(world).id(),
                                    engine::f32(rewards[i]));
    CHECK(engine::test::player(world).profile().level() == levels[i]);
    CHECK(player->health.value == health[i]);
    CHECK(player->max_health ==
          engine::player_level_max_health(engine::test::player(world).profile().level()));
  }
  CHECK(engine::test::player(world).loadout().score().value == 116.0F);
  CHECK(engine::test::player(world).profile().experience().value == 11.0F);
  engine::test::player(world).profile().set_level(98U);
  engine::test::player(world).profile().set_experience(engine::f32(0.0F));
  engine::award_player_experience(world, engine::test::player(world).id(), engine::f32(1e8F));
  CHECK(engine::test::player(world).profile().level() == 99U);
  CHECK(player->max_health.value == 150.0F);
  engine::World restored;
  restored.initialize();
  auto profile = engine::make_default_profile();
  profile.set_level(2U);
  const auto respawn = engine::spawn_player_default(restored, engine::test::player(restored),
                                                    "restored", profile, false);
  CHECK(restored.entities().get(respawn)->health.value == 101.13636016845703F);
}

void test_player_default_spawn() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(
      world, engine::test::player(world), "default", engine::make_default_profile());
  CHECK(player.valid());
  CHECK(engine::test::player(world).player() == player);
  CHECK(engine::test::player(world).player_name() == "default");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(entity->contact_damage.to_float() == 25.0F);
  CHECK(engine::test::player(world).profile().level() == 1);
  CHECK(engine::test::player(world).profile().inventory_count() == 5);
  CHECK(engine::test::player(world).profile().inventory(0) ==
        engine::catalog::PetalId::kBasicCommon);
  CHECK(engine::test::player(world).loadout().slots()[0].type_id ==
        engine::catalog::PetalId::kBasicCommon);
  CHECK(engine::test::player(world).loadout().slots()[4].type_id ==
        engine::catalog::PetalId::kBasicCommon);
  CHECK(engine::test::player(world).loadout().slots()[5].count == 0);
  CHECK(entity->position.x.to_float() >= -25000.0F);
  CHECK(entity->position.x.to_float() <= -25000.0F + 15000.0F);
  CHECK(entity->position.y.to_float() >= -2000.0F);
  CHECK(entity->position.y.to_float() <= 2000.0F);
  const std::size_t petals = engine::spawn_loadout_petals(world, engine::test::player(world));
  CHECK(petals == 5);
  CHECK(engine::test::player(world).petals().size() == 5);
  CHECK(engine::test::player(world).petals()[0].profile == engine::OrbitProfile::kBasic);
}

void test_petal_combat_catalog() {
  const auto* basic =
      engine::Catalog::instance().petal_combat(engine::catalog::PetalId::kBasicCommon);
  CHECK(basic != nullptr);
  CHECK(basic->collisionRadius == 10.0F);
  CHECK(basic->damage == 10.0F);
  CHECK(basic->health == 10.0F);
  CHECK(std::string(basic->orbitProfile) == "basic");
  CHECK(
      engine::Catalog::instance().petal(engine::catalog::PetalId::kBasicCommon)->instancesPerSlot ==
      1);
  const auto* rock = engine::Catalog::instance().petal_combat(engine::catalog::PetalId::kRockRare);
  CHECK(rock != nullptr);
  CHECK(engine::Catalog::instance().petal(engine::catalog::PetalId::kRockRare)->rarityIndex ==
        engine::catalog::Rarity::kRare);
  CHECK(rock->collisionRadius == 14.0F);
  CHECK(rock->health == 90.0F);
  const auto* corn = engine::Catalog::instance().petal_combat(engine::catalog::PetalId::kCornEpic);
  CHECK(corn != nullptr);
  CHECK(corn->health == 2000.0F);
  CHECK(engine::Catalog::instance()
            .petal(engine::catalog::PetalId::kCornEpic)
            ->rechargeMilliseconds == 45000.0F);
  const auto* rose =
      engine::Catalog::instance().petal_combat(engine::catalog::PetalId::kRoseUnusual);
  CHECK(rose != nullptr);
  CHECK(rose->behavior == engine::catalog::PetalBehavior::kRoseHeal);
  CHECK(rose->healAmount == 10.0F);
  CHECK(engine::Catalog::instance().petal_combat(static_cast<engine::catalog::PetalId>(99)) ==
        nullptr);
}

void test_drop_chances() {
  const auto* rock = engine::Catalog::instance().drop_table(engine::catalog::SpeciesId::kRock);
  CHECK(rock != nullptr);
  CHECK(rock->dropCount == 3);
  CHECK(rock->drops[0].petalTypeId == engine::catalog::PetalId::kRockRare);
  CHECK(std::fabs(rock->drops[0].chance - 0.00522140646353364) < 1e-12);
  CHECK(rock->drops[2].petalTypeId == engine::catalog::PetalId::kHeavyCommon);
  CHECK(std::fabs(rock->drops[2].chance - 0.10442813485860825) < 1e-12);
  const auto* alias =
      engine::Catalog::instance().drop_table(engine::catalog::SpeciesId::kCentipedeSegment);
  CHECK(alias != nullptr);
  CHECK(alias->aliasOf == engine::catalog::SpeciesId::kCentipedeHead);
  CHECK(alias->dropCount == 6);
  engine::ServerRng rng(1);
  const auto loot = engine::roll_entity_loot(rng, engine::catalog::SpeciesId::kRock, false);
  for (const auto petal : loot) {
    CHECK(petal == engine::catalog::PetalId::kFastCommon ||
          petal == engine::catalog::PetalId::kHeavyCommon ||
          petal == engine::catalog::PetalId::kRockRare);
  }
  engine::ServerRng compact_rng(1);
  const auto compact_loot =
      engine::roll_entity_loot(compact_rng, engine::catalog::SpeciesId::kRock, true);
  CHECK(compact_loot.size() <= loot.size() + 3);
}

void test_loot_retention() {
  engine::PlayerProfile profile;
  profile.set_level(10);
  profile.set_inventory(0, engine::catalog::PetalId::kRockRare);
  profile.set_inventory(1, engine::catalog::PetalId::kBasicCommon);
  profile.set_inventory(2, engine::catalog::PetalId::kRoseEpic);
  profile.set_inventory(3, engine::catalog::PetalId::kRoseRare);
  profile.set_inventory(4, engine::catalog::PetalId::kFastCommon);
  profile.set_inventory_count(5);
  profile.push_backpack(engine::catalog::PetalId::kFastCommon);
  engine::ServerRng rng(7);
  engine::ServerRng shuffle_rng(1);
  const engine::LootResult result = engine::retain_player_loot(profile, rng, shuffle_rng);
  CHECK(result.retained_count <= 3);
  CHECK(result.lost_count <= 10);
  for (std::uint8_t index = 0; index < result.retained_count; ++index) {
    CHECK(result.retained[index] != engine::catalog::PetalId::kBasicCommon);
  }
  CHECK(profile.lost_count() == result.lost_count);
  CHECK(profile.inventory_count() == result.retained_count);
  CHECK(profile.backpack_count() == 0);
  CHECK(engine::loot_lifetime_ms(engine::catalog::PetalId::kBasicCommon) == 32000.0);
  CHECK(engine::loot_lifetime_ms(engine::catalog::PetalId::kRockRare) == 42000.0);
  CHECK(engine::loot_lifetime_ms(engine::catalog::PetalId::kRoseEpic) == 52000.0);
  CHECK(engine::loot_lifetime_ms(engine::catalog::PetalId::kRoseRare) == 42000.0);
  CHECK(engine::loot_lifetime_ms(engine::catalog::PetalId::kBasicUnique) == 62000.0);
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
  const engine::EntityHandle player = engine::spawn_player_default(
      world, engine::test::player(world), "p", engine::make_default_profile());
  CHECK(player.valid());
  engine::Entity* player_entity = world.entities().get(player);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(
      world, engine::EntityKind::kMob, engine::catalog::SpeciesId::kLadybug,
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
  CHECK(engine::test::player(world).profile().experience().value >= 0.0F);
  CHECK(world.destroy(mob));
}

void test_multi_instance_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "orbit",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kRoseRare);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kRoseRare));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 3);
  CHECK(engine::test::player(world).petals().size() == 3);
  CHECK(engine::test::player(world).petals()[0].extra_radius.to_float() == 11.0F);
  CHECK(engine::test::player(world).petals()[0].instance_count == 3);
  CHECK(std::fabs(engine::test::player(world).petals()[0].angle.to_float() - 0.0F) < 1e-6F);
  // Rose's catalog entry sets the shared-orbit flag, so all three instances
  // receive the same orbit index; the ring position is shared and the
  // per-instance separation comes from the extra radius (11) added at
  // angle*1.1 + instance*2*pi/3.
  CHECK(std::fabs(engine::test::player(world).petals()[1].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(std::fabs(engine::test::player(world).petals()[2].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(engine::test::player(world).petals()[1].orbit_index ==
        engine::test::player(world).petals()[0].orbit_index);
  CHECK(engine::test::player(world).petals()[2].orbit_index ==
        engine::test::player(world).petals()[0].orbit_index);
}

void test_orbit_reindex_after_removal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "reindex",
                                     engine::make_default_profile())
            .valid());
  for (std::uint8_t slot = 0; slot < 5; ++slot) {
    engine::test::player(world).profile().set_inventory(
        slot, static_cast<engine::catalog::PetalId>(slot + 1));
  }
  engine::test::player(world).profile().set_inventory_count(5);
  engine::test::player(world).loadout().clear();
  for (std::uint8_t slot = 0; slot < 5; ++slot) {
    CHECK(engine::test::player(world).loadout().equip(
        slot, static_cast<engine::catalog::PetalId>(slot + 1)));
  }
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 5U);
  CHECK(engine::test::player(world).loadout().change_slot_type(
      world, engine::test::player(world), engine::test::player(world).profile(), 2,
      engine::catalog::PetalId::kNone));
  engine::assign_petal_orbit_indices(engine::test::player(world));
  CHECK(engine::test::player(world).petals().size() == 4U);
  CHECK(engine::test::player(world).loadout().orbit_positions() == 4U);
  std::array<std::uint8_t, 4> indices{};
  for (std::size_t index = 0; index < engine::test::player(world).petals().size(); ++index) {
    indices[index] = engine::test::player(world).petals()[index].orbit_index;
  }
  std::sort(indices.begin(), indices.end());
  CHECK(indices[0] == 0U && indices[1] == 1U && indices[2] == 2U && indices[3] == 3U);
}

void test_shared_orbit_slot_without_component_keeps_shared_position() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "rose-slot",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kRoseRare);
  engine::test::player(world).profile().set_inventory(1, engine::catalog::PetalId::kBasicCommon);
  engine::test::player(world).profile().set_inventory_count(2);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kRoseRare));
  CHECK(engine::test::player(world).loadout().equip(1, engine::catalog::PetalId::kBasicCommon));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 4U);
  // Replace Rose's third instance with a live entity that has no petal
  // component. Its shared position is already taken, so Basic remains at
  // orbit 1 instead of jumping to 2.
  const engine::EntityHandle componentless = engine::spawn_entity(
      world, engine::EntityKind::kPetal, engine::catalog::PetalId::kBasicCommon,
      engine::Vec2{engine::f32(20.0F), engine::f32(0.0F)}, engine::f32(14.0F), 0U, 0U);
  CHECK(componentless.valid());
  engine::test::player(world).loadout().set_handle(0, 2, componentless);
  engine::assign_petal_orbit_indices(engine::test::player(world));
  const engine::EntityHandle basic = engine::test::player(world).loadout().handle(1, 0);
  engine::PetalOrbitState* basic_state = nullptr;
  for (auto& state : engine::test::player(world).petals()) {
    if (state.handle == basic) {
      basic_state = &state;
    }
  }
  CHECK(basic_state != nullptr);
  CHECK(basic_state->orbit_index == 1U);
}

void test_peas_attack_consumes_petal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "peas",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kPeasRare);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kPeasRare));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 1U);
  const engine::EntityHandle pea = engine::test::player(world).petals()[0].handle;
  world.advance_tick(600.0);
  engine::test::input(world, 1U, engine::f32(0.0F), engine::f32(0.0F));
  engine::update_petal_orbits(world, engine::test::player(world), 16.0);
  CHECK(world.entities().get(pea) == nullptr);
  std::uint32_t children = 0;
  for (const auto& entity : world.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kPetal &&
        entity.petal_id == engine::catalog::PetalId::kPeasRare) {
      ++children;
    }
  }
  CHECK(children == 4U);
  CHECK(world.run_deferred_launches(world.time_ms() + 1.0) >= 1U);
}

void test_twin_widens_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "twin-space",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kTwinUnusual);
  engine::test::player(world).profile().set_inventory(1, engine::catalog::PetalId::kBasicCommon);
  engine::test::player(world).profile().set_inventory_count(2);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kTwinUnusual));
  CHECK(engine::test::player(world).loadout().equip(1, engine::catalog::PetalId::kBasicCommon));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 3U);
  // Twin reserves two positions; Basic therefore sits at 4*pi/3 rather than
  // the old five-slot 2*pi/5 that left the Twin pair overlapping it.
  CHECK(engine::test::player(world).petals()[0].orbit_index == 0U);
  CHECK(engine::test::player(world).petals()[1].orbit_index == 1U);
  CHECK(engine::test::player(world).petals()[2].orbit_index == 2U);
  CHECK(std::fabs(engine::test::player(world).petals()[0].orbit_angle - 0.0) < 1e-6);
  CHECK(std::fabs(engine::test::player(world).petals()[1].orbit_angle - 2.0943951023931953) < 1e-5);
  CHECK(std::fabs(engine::test::player(world).petals()[2].orbit_angle - 4.1887902047863905) < 1e-5);
}

void test_rose_healing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "rose",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kRoseUnusual);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kRoseUnusual));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 1);
  engine::Entity* player = world.entities().get(engine::test::player(world).player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  const engine::EntityHandle petal = engine::test::player(world).loadout().handle(0, 0);
  for (int index = 0; index < 200; ++index) {
    engine::tick(world, 50.0);
  }
  CHECK(player->health.to_float() > 50.0F);
  const engine::Entity* petal_entity = world.entities().get(petal);
  CHECK(petal_entity == nullptr);
  CHECK(engine::test::player(world).loadout().handle(0, 0) != petal);
}

void test_rose_contracts_orbit_and_heals_promptly() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "rose-orbit",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kRoseUnusual);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kRoseUnusual));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 1);
  engine::Entity* player = world.entities().get(engine::test::player(world).player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  engine::test::input(world, 1, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(engine::test::player(world).petals()[0].orbit_radius.to_float() == 65.0F);
  engine::test::input(world, 2, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(engine::test::player(world).petals()[0].orbit_radius.to_float() == 40.0F);
  engine::test::input(world, 1, engine::f32(0.0F), engine::f32(1.0F));
  // The native timer arms after one second, then the ten-step behavior state
  // advances one step per tick, so the first heal lands in ~1.45 seconds.
  for (int index = 0; index < 25; ++index) {
    engine::tick(world, 50.0);
  }
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
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "rose-armed",
                                     engine::make_default_profile())
            .valid());
  engine::test::player(world).profile().set_inventory(0, engine::catalog::PetalId::kRoseUnusual);
  engine::test::player(world).profile().set_inventory_count(1);
  engine::test::player(world).loadout().clear();
  CHECK(engine::test::player(world).loadout().equip(0, engine::catalog::PetalId::kRoseUnusual));
  CHECK(engine::spawn_loadout_petals(world, engine::test::player(world)) == 1);
  engine::Entity* player = world.entities().get(engine::test::player(world).player());
  CHECK(player != nullptr);
  // Hold the Rose while healthy long enough to arm the native 1000 ms timer.
  for (int index = 0; index < 25; ++index) {
    engine::tick(world, 50.0);
  }
  player->health = engine::f32(50.0F);
  for (int index = 0; index < 10; ++index) {
    engine::tick(world, 50.0);
  }
  CHECK(player->health.to_float() > 50.0F);
}

void test_petal_recharge() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(
      world, engine::test::player(world), "p", engine::make_default_profile());
  CHECK(player.valid());
  engine::test::player(world).loadout().equip(
      0, engine::catalog::PetalId::kFastCommon);  // Fast: 500 ms recharge, one instance.
  const std::size_t spawned = engine::spawn_loadout_petals(world, engine::test::player(world));
  CHECK(spawned >= 1);
  const engine::EntityHandle petal = engine::test::player(world).loadout().handle(0, 0);
  CHECK(petal.valid());
  CHECK(engine::damage_entity(world, petal, engine::f32(1000.0F)).died);
  const engine::Entity* petal_corpse = world.entities().get(petal);
  CHECK(petal_corpse != nullptr);
  CHECK(petal_corpse->death_processed);
  CHECK(engine::test::player(world).loadout().slots()[0].recharge_remaining_ms > 0.0);
  const double remaining = engine::test::player(world).loadout().slots()[0].recharge_remaining_ms;
  CHECK(remaining == 500.0);
  engine::refresh_loadout_petals(world, engine::test::player(world), 500.0);
  CHECK(engine::test::player(world).loadout().handle(0, 0).valid());
  CHECK(world.entities().get(engine::test::player(world).loadout().handle(0, 0)) != nullptr);
}

void test_auto_population() {
  engine::WorkerApi api;
  api.init(true);
  std::size_t mobs = 0;
  for (const auto& entity : api.world().entities().entities()) {
    // Count only band-assigned population; special initializers such as the
    // Centipede chain add unbanded children.
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.spawn_band < 8U) {
      ++mobs;
    }
  }
  CHECK(mobs >= 700);
  CHECK(mobs <= 900);
}

void test_ant_hole_children() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
      world, engine::EntityKind::kMob, engine::catalog::SpeciesId::kAntHole,
      engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  std::array<int, 23> counts{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) {
      continue;
    }
    if (static_cast<std::size_t>(entity.species_id) < counts.size()) {
      ++counts[static_cast<std::size_t>(entity.species_id)];
    }
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
  for (const char byte : std::string("default")) {
    writer.write_u8(static_cast<std::uint8_t>(byte));
  }
  writer.write_u8(0);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  CHECK(api.send(packet, key));
  CHECK(engine::test::player(api.world()).player().valid());
  CHECK(engine::test::player(api.world()).player_name() == "default");
  CHECK(engine::test::player(api.world()).profile().level() == 1);
  CHECK(engine::test::player(api.world()).profile().inventory_count() == 5);
  CHECK(engine::test::player(api.world()).loadout().slots()[0].type_id ==
        engine::catalog::PetalId::kBasicCommon);
  const engine::Entity* entity =
      api.world().entities().get(engine::test::player(api.world()).player());
  CHECK(entity != nullptr);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  const engine::EntityHandle first = engine::test::player(api.world()).player();
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
  if (first_corpse == nullptr) {
    return;
  }
  CHECK(first_corpse->death_processed);
  CHECK(first_corpse->health.value == 0.0F);
  CHECK(first_corpse->death_time_ms == api.world().time_ms() + 1000.0);
  CHECK(engine::test::player(api.world()).player() == first);
  engine::ByteWriter respawn;
  respawn.write_varint32(3);
  respawn.write_varint32(6);
  for (const char byte : std::string("default")) {
    respawn.write_u8(static_cast<std::uint8_t>(byte));
  }
  respawn.write_u8(0);
  std::vector<std::uint8_t> respawn_packet = respawn.bytes();
  engine::apply_packet_xor(respawn_packet, key);
  CHECK(api.send(respawn_packet, key));
  // A live corpse still owns the controlled handle, so an early spawn request
  // cannot replace it. The ordinary sweep releases it exactly 1000ms later.
  CHECK(engine::test::player(api.world()).player() == first);
  CHECK(api.world().entities().get(first)->health.value == 0.0F);
  for (unsigned step = 0; step < 19U; ++step) {
    api.think();
  }
  CHECK(api.world().entities().get(first) != nullptr);
  CHECK(engine::test::player(api.world()).player() == first);
  CHECK(api.world().time_ms() == first_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(first) == nullptr);
  CHECK(!engine::test::player(api.world()).player().valid());
  engine::ByteWriter reopen;
  // Death releases the corpse after 1000ms; the peer also blocks the next
  // spawn until 2500ms after the previous successful spawn.
  while (api.world().time_ms() < 2500.0) {
    api.think();
  }
  reopen.write_varint32(4);
  reopen.write_varint32(6);
  for (const char byte : std::string("default")) {
    reopen.write_u8(static_cast<std::uint8_t>(byte));
  }
  reopen.write_u8(0);
  std::vector<std::uint8_t> reopen_packet = reopen.bytes();
  engine::apply_packet_xor(reopen_packet, key);
  CHECK(api.send(reopen_packet, key));
  CHECK(engine::test::player(api.world()).player().valid());
  CHECK(engine::test::player(api.world()).player() != first);
  CHECK(api.world().entities().get(engine::test::player(api.world()).player()) != nullptr);
  const engine::EntityHandle second = engine::test::player(api.world()).player();
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
  if (second_corpse == nullptr) {
    return;
  }
  CHECK(second_corpse->death_processed);
  CHECK(second_corpse->health.value == 0.0F);
  // The suicide opcode damages the player synchronously in send(); think() above
  // already advanced 50ms toward that existing deadline.
  CHECK(second_corpse->death_time_ms == api.world().time_ms() + 950.0);
  CHECK(engine::test::player(api.world()).player() == second);
  for (unsigned step = 0; step < 18U; ++step) {
    api.think();
  }
  CHECK(api.world().entities().get(second) != nullptr);
  CHECK(engine::test::player(api.world()).player() == second);
  CHECK(api.world().time_ms() == second_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(second) == nullptr);
  CHECK(!engine::test::player(api.world()).player().valid());
  engine::ByteWriter restart;
  while (api.world().time_ms() < 5000.0) {
    api.think();
  }
  restart.write_varint32(6);
  restart.write_varint32(4);
  std::vector<std::uint8_t> restart_packet = restart.bytes();
  engine::apply_packet_xor(restart_packet, key);
  CHECK(api.send(restart_packet, key));
  CHECK(engine::test::player(api.world()).player().valid());
  CHECK(engine::test::player(api.world()).player() != second);
  const engine::Entity* restarted =
      api.world().entities().get(engine::test::player(api.world()).player());
  CHECK(restarted != nullptr);
  if (restarted != nullptr) {
    CHECK(restarted->health.value > 0.0F);
  }
}
