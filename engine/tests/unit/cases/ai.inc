void test_ai_target_selection() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* mob_entity = world.entities().get(mob);
  CHECK(mob_entity != nullptr);
  mob_entity->ai.can_alert = true;
  CHECK(mob_entity->ai.enabled);
  CHECK(engine::target_eligible(world, *mob_entity, *player_entity));
  CHECK(engine::find_target(world, mob) == player);
  const std::size_t alerted = engine::alert_nearby(world, player, engine::f32(600.0F));
  CHECK(alerted >= 1);
  CHECK(mob_entity->ai.target == player);
  const engine::EntityHandle drop = engine::spawn_drop(world, 2,
    engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  CHECK(engine::find_pickup_recipient(world, drop) == player);
  player_entity->position = engine::Vec2(engine::f32(5000.0F), engine::f32(0.0F));
  CHECK(!engine::target_eligible(world, *mob_entity, *player_entity));
  const engine::EntityHandle root = engine::controlling_root(world, player);
  CHECK(root == player);
}

void test_collision_layer_filter() {
  engine::Entity owner;
  owner.layer_flags[0] = 1;
  owner.layer_thresholds[0] = 10;
  owner.layer_sides[0] = 2;
  owner.layer_sides_alt[0] = 8;
  CHECK(engine::count_matching_layers(owner, 5, false, 0) == 1);
  CHECK(engine::count_matching_layers(owner, 10, false, 0) == 0);
  CHECK(engine::count_matching_layers(owner, 1, false, 0) == 0);
  CHECK(engine::count_matching_layers(owner, 1, true, 0) == 1);
  CHECK(engine::count_matching_layers(owner, 5, false, 0x40) == 0); // alternate side 8 > 5
  engine::Entity other;
  CHECK(engine::layers_collide(owner, other));
  other.layer_flags[1] = 2;
  other.layer_thresholds[9] = 100;
  other.layer_probe = 5;
  owner.layer_probe = 50;
  CHECK(engine::layers_collide(owner, other));
  other.layer_thresholds[9] = 1;
  owner.layer_thresholds[0] = 1;
  CHECK(!engine::layers_collide(owner, other));
}

void test_status_effects_and_slow() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  const engine::EntityHandle mob2 = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(200.0F), engine::f32(0.0F)));
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kPoison, engine::f32(10.0F), 1000.0, mob));
  CHECK(engine::has_effect(*player_entity, engine::EffectType::kPoison));
  CHECK(player_entity->effects[0].source == mob);
  CHECK((engine::effect_flags(*player_entity) & 1U) != 0U);
  const engine::f32 before = player_entity->health;
  CHECK(engine::update_effects(world, 100.0) == 1);
  CHECK(player_entity->health.value < before.value);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kHealBlock, engine::f32(1.0F), 1000.0, mob));
  CHECK(engine::blocks_healing(*player_entity));
  const engine::f32 suppressed = player_entity->health;
  CHECK(engine::heal_entity(world, player, engine::f32(10.0F)).value == suppressed.value);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kSlow, engine::f32(0.5F), 1000.0, mob));
  CHECK(std::fabs(engine::slow_multiplier(*player_entity).value - 0.5F) < 1e-6F);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kSlow, engine::f32(0.5F), 1000.0, mob2));
  // Original608 multiplies active slow effects (0.5 * 0.5), not min().
  CHECK(std::fabs(engine::slow_multiplier(*player_entity).value - 0.25F) < 1e-6F);
  CHECK((engine::effect_flags(*player_entity) & 6U) == 6U);
  (void)engine::update_effects(world, 2000.0);
  CHECK(!engine::has_effect(*player_entity, engine::EffectType::kPoison));
  CHECK(!engine::has_effect(*player_entity, engine::EffectType::kSlow));
  CHECK(!engine::blocks_healing(*player_entity));
}

void test_slow_scales_player_control_impulse() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  const engine::EntityHandle source = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  world.apply_input(0, engine::f32(0.0F), engine::f32(100.0F));
  engine::apply_player_controls(world, 50.0);
  const double full = entity->velocity.x;
  CHECK(full > 0.0);
  entity->velocity.x = 0.0;
  entity->velocity.y = 0.0;
  CHECK(engine::apply_effect(world, player, engine::EffectType::kSlow, engine::f32(0.25F), 1000.0, source));
  engine::apply_player_controls(world, 50.0);
  CHECK(std::fabs(entity->velocity.x / full - 0.25) < 1e-7);
  entity->velocity.x = 0.0;
  engine::apply_player_controls(world, 50.0);
  CHECK(std::fabs(entity->velocity.x / full - 0.25) < 1e-7);
}

void test_slow_does_not_scale_integrate_movement() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  const engine::EntityHandle source = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  engine::Entity* entity = world.entities().get(mob);
  CHECK(entity != nullptr);
  entity->acceleration.x = 0.01;
  engine::integrate_movement(world, 50.0);
  const engine::f32 unslowed = entity->position.x;
  entity->position.x = engine::f32(0.0F);
  entity->velocity.x = 0.0;
  CHECK(engine::apply_effect(world, mob, engine::EffectType::kSlow, engine::f32(0.25F), 1000.0, source));
  engine::integrate_movement(world, 50.0);
  // Original654 never multiplies acceleration by the effect multiplier; slow
  // is applied by the behavior that produces velocity (e.g. original608).
  CHECK(entity->position.x.value == unslowed.value);
}

void test_attribution_and_legendary() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  CHECK(player.valid());
  CHECK(mob.valid());
  world.record_hit(mob, player, engine::f32(2.0F), engine::f32(8.0F));
  world.record_hit(mob, player, engine::f32(1.0F), engine::f32(7.0F));
  CHECK(world.hit_events().size() == 1);
  CHECK(world.hit_events()[0].count == 2);
  CHECK(world.hit_events()[0].amount.value == 3.0F);
  (void)engine::damage_entity(world, mob, engine::f32(1000.0F), player);
  const engine::Entity* attributed_corpse = world.entities().get(mob);
  CHECK(attributed_corpse != nullptr);
  CHECK(attributed_corpse->death_processed);
  // The replicated killer-name field belongs to player deaths only (original
  // updateKillerName); a mob dying to the player must not populate it.
  CHECK(!world.last_killer().valid());
  CHECK(world.last_killer_name().empty());
  CHECK(world.profile().level() > 0U || world.profile().experience().value > 0.0F);

  // Legendary (rarity 5) duplicate suppression: another active loadout or an
  // existing pickup of the same type blocks a new drop.
  engine::World legendary_world;
  legendary_world.initialize();
  (void)engine::spawn_player_default(legendary_world, "q", engine::make_default_profile());
  CHECK(legendary_world.loadout().equip(0, 35));
  CHECK(engine::legendary_exists(legendary_world, engine::EntityHandle{}, 35));
  const auto spawned = engine::spawn_loot_drops(legendary_world, {35}, engine::Vec2{},
                                                engine::EntityHandle{});
  CHECK(spawned.empty());
  CHECK(!engine::legendary_exists(legendary_world, legendary_world.player(), 35));
}

void test_loadout_restore_and_backpack() {
  engine::PlayerProfile profile;
  profile.set_level(20);
  profile.set_inventory(0, 1);
  profile.set_inventory(1, 2);
  profile.set_inventory(5, 3);
  profile.set_inventory_count(6);
  engine::PlayerLoadout loadout;
  loadout.restore_from_profile(profile);
  CHECK(loadout.slots()[0].type_id == 1);
  CHECK(loadout.slots()[1].type_id == 2);
  CHECK(loadout.slots()[5].type_id == 3);
  CHECK(loadout.slots()[6].count == 0);
  CHECK(loadout.set_slot_type(profile, 0, 4));
  CHECK(loadout.slots()[0].type_id == 4);
  CHECK(profile.inventory(0) == 4);
  CHECK(!loadout.set_slot_type(profile, 0, 4));

  engine::World world;
  world.initialize();
  (void)engine::spawn_player_default(world, "p", engine::make_default_profile());
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->position = engine::Vec2{};
  // Original pickup fills a carried slot; full inventory never falls through
  // to the backpack. Keep grace, capacity and strict range failures isolated.
  for (std::uint8_t slot = 0; slot < world.profile().inventory_size(); ++slot) {
    CHECK(world.loadout().equip(slot, 1));
    world.profile().set_inventory(slot, 1);
  }
  world.profile().set_inventory_count(world.profile().inventory_size());
  const auto drop = engine::spawn_drop(world, 2,
    engine::Vec2(engine::f32(65.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  if (!drop.valid()) return;
  const auto free_slot = static_cast<std::uint8_t>(world.profile().inventory_size() - 1U);
  CHECK(world.loadout().discard(free_slot, 1));
  world.profile().set_inventory(free_slot, 0);
  world.set_time_ms(499.0);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().empty());

  CHECK(world.loadout().equip(free_slot, 1));
  world.profile().set_inventory(free_slot, 1);
  world.set_time_ms(500.0);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.profile().backpack_count() == 0U);
  CHECK(world.loadout().pickup_transfers().empty());

  CHECK(world.loadout().discard(free_slot, 1));
  world.profile().set_inventory(free_slot, 0);
  world.entities().get(drop)->position.x = engine::f32(70.0F);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().empty());
  world.entities().get(drop)->position.x = engine::f32(65.0F);
  CHECK(engine::collect_drops(world) == 1U);
  CHECK(world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().slots()[free_slot].type_id == 2U);
  CHECK(world.profile().inventory(free_slot) == 2U);
  CHECK(world.profile().backpack_count() == 0U);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
  if (world.loadout().pickup_transfers().size() != 1U) return;
  CHECK(world.loadout().pickup_transfers()[0].drop == drop);
  CHECK(world.loadout().pickup_transfers()[0].slot == free_slot);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
}

void test_petal_special_effects() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  engine::Entity* mob_entity = world.entities().get(mob);
  CHECK(mob_entity != nullptr);

  const engine::EntityHandle iris = engine::spawn_petal(world, 8, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(iris.valid());
  if (engine::Entity* petal = world.entities().get(iris)) petal->owner = player.raw;
  engine::on_petal_hit(world, iris, mob, player);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kPoison));

  const engine::EntityHandle honey = engine::spawn_petal(world, 31, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(honey.valid());
  if (engine::Entity* petal = world.entities().get(honey)) petal->owner = player.raw;
  engine::on_petal_hit(world, honey, mob, player);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kSlow));

  const engine::EntityHandle web = engine::spawn_petal(world, 29, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(web.valid());
  if (engine::Entity* petal = world.entities().get(web)) petal->owner = player.raw;
  engine::on_petal_hit(world, web, mob, player);
  CHECK(world.area_effects().empty()); // Original732 is a death callback.
  world.set_time_ms(550.0);
  for (auto& state : world.petals()) {
    if (state.handle != web) continue;
    CHECK(engine::update_projectile_petal_orbit(world, state, 1U));
    break;
  }
  auto* launched_web = world.entities().get(web);
  CHECK(launched_web != nullptr && launched_web->lifetime_remaining_ms == 650.0);
  if (launched_web == nullptr) return;
  (void)engine::damage_entity(world, web, launched_web->health, player);
  bool web_tag = false;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kProjectile && entity.has_tag_component)
      web_tag = true;
  CHECK(web_tag);
  (void)world.update_area_effects();
  // Honey (0.5) and the web area (0.25) are both active; original608
  // multiplies the effect multipliers, so the combined value is 0.125.
  CHECK(engine::slow_multiplier(*mob_entity).value == 0.125F);

  const engine::EntityHandle cactus = engine::spawn_petal(world, 21, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(cactus.valid());
  if (engine::Entity* petal = world.entities().get(cactus)) petal->owner = player.raw;
  engine::on_petal_incoming_hit(world, cactus, mob);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kPoison));

  const engine::EntityHandle peas = engine::spawn_petal(world, 11, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(peas.valid());
  if (engine::Entity* petal = world.entities().get(peas)) petal->owner = player.raw;
  const std::size_t before = world.entities().active_count();
  engine::on_petal_hit(world, peas, mob, player);
  CHECK(world.entities().get(peas) != nullptr);
  CHECK(world.entities().active_count() == before);
  world.set_time_ms(1100.0);
  for (auto& state : world.petals()) {
    if (state.handle != peas) continue;
    CHECK(engine::update_projectile_petal_orbit(world, state, 1U));
    break;
  }
  CHECK(world.entities().get(peas) == nullptr);
  CHECK(world.entities().active_count() == before + 3); // four children minus the consumed petal

  engine::World eggs;
  eggs.initialize();
  eggs.set_auto_populate(false);
  const auto egg_owner = engine::spawn_player_default(eggs, "egg", engine::make_default_profile(), false);
  eggs.loadout().clear();
  CHECK(eggs.loadout().equip(0U, 22U));
  CHECK(engine::spawn_loadout_petals(eggs) == 1U);
  const auto egg = eggs.loadout().handle(0U, 0U);
  for (unsigned frame = 0; frame < 20U; ++frame) {
    engine::tick(eggs, 50.0);
    CHECK(eggs.loadout().handle(0U, 0U) == egg); // strict >1000 ms, after AI
  }
  engine::tick(eggs, 50.0);
  const auto pet = eggs.loadout().handle(0U, 0U);
  CHECK(pet.valid() && pet != egg);
  const auto* hatchling = eggs.entities().get(pet);
  CHECK(hatchling != nullptr);
  if (hatchling != nullptr) {
    CHECK(hatchling->kind == engine::EntityKind::kMob && hatchling->type_id == 9U);
    CHECK(hatchling->owner == egg_owner.raw);
  }
  CHECK(eggs.entities().get(egg) != nullptr && eggs.entities().get(egg)->health.value == 0.0F);
  CHECK(eggs.loadout().slots()[0].recharge_remaining_ms == 0.0);
}
