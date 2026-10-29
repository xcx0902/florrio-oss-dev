void test_ai_family_profiles() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle lady = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(lady.valid());
  engine::Entity* lady_entity = world.entities().get(lady);
  CHECK(lady_entity != nullptr);
  CHECK(lady_entity->ai.family == engine::AiFamily::kLadybug);
  CHECK(lady_entity->health.value == 25.0F);
  CHECK(lady_entity->radius.value == 30.0F);
  CHECK(lady_entity->contact_damage.value == 10.0F);
  CHECK(lady_entity->ai.wave_frequency.value == 0.002F);
  CHECK(lady_entity->ai.radius.value == 1000.0F);
  CHECK(std::fabs(static_cast<float>(lady_entity->ai.timer_interval_ms) - 3141.5927F) < 0.01F);

  const engine::EntityHandle massive = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 5, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)));
  engine::Entity* massive_entity = world.entities().get(massive);
  CHECK(massive_entity != nullptr);
  CHECK(massive_entity->health.value == 1000.0F);
  CHECK(massive_entity->radius.value == 120.0F);
  CHECK(massive_entity->ai.wave_frequency.value == 0.001F);
  CHECK(massive_entity->ai.idle_speed.value == 0.2F);

  const engine::EntityHandle dark = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 20, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  engine::Entity* dark_entity = world.entities().get(dark);
  CHECK(dark_entity != nullptr);
  CHECK(dark_entity->health.value == 35.0F);
  CHECK(dark_entity->ai.variant == 1U);
  CHECK(dark_entity->ai.worker);

  const engine::EntityHandle baby = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 7, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)));
  engine::Entity* baby_entity = world.entities().get(baby);
  CHECK(baby_entity != nullptr);
  CHECK(baby_entity->health.value == 10.0F);
  CHECK(baby_entity->radius.value == 14.0F);
  CHECK(baby_entity->ai.variant == 0U);
  CHECK(baby_entity->ai.wave_frequency.value >= 0.0018F && baby_entity->ai.wave_frequency.value <= 0.00221F);

  const engine::EntityHandle soldier = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 9, engine::Vec2(engine::f32(40.0F), engine::f32(0.0F)));
  engine::Entity* soldier_entity = world.entities().get(soldier);
  CHECK(soldier_entity != nullptr);
  CHECK(soldier_entity->health.value == 40.0F);
  CHECK(soldier_entity->radius.value == 20.0F);
  CHECK(soldier_entity->ai.soldier);
  CHECK(soldier_entity->ai.radius.value == 300.0F);
  CHECK(soldier_entity->ai.territory.value == 0.3F);

  const engine::EntityHandle queen = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 10, engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  engine::Entity* queen_entity = world.entities().get(queen);
  CHECK(queen_entity != nullptr);
  CHECK(queen_entity->health.value == 200.0F);
  CHECK(queen_entity->radius.value == 40.0F);
  CHECK(queen_entity->ai.radius.value == 400.0F);

  const engine::EntityHandle beetle = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 12, engine::Vec2(engine::f32(60.0F), engine::f32(0.0F)));
  engine::Entity* beetle_entity = world.entities().get(beetle);
  CHECK(beetle_entity != nullptr);
  CHECK(beetle_entity->health.value == 40.0F);
  CHECK(beetle_entity->radius.value == 40.0F);
  CHECK(beetle_entity->contact_damage.value == 30.0F);
  CHECK(beetle_entity->ai.radius.value == 600.0F);

  const engine::EntityHandle massive_beetle = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 13, engine::Vec2(engine::f32(70.0F), engine::f32(0.0F)));
  engine::Entity* massive_beetle_entity = world.entities().get(massive_beetle);
  CHECK(massive_beetle_entity != nullptr);
  CHECK(massive_beetle_entity->health.value == 300.0F);
  CHECK(massive_beetle_entity->radius.value == 80.0F);
  CHECK(massive_beetle_entity->contact_damage.value == 20.0F);
  CHECK(massive_beetle_entity->ai.idle_speed.value == 1.1F);

  const engine::EntityHandle centipede = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(80.0F), engine::f32(0.0F)));
  engine::Entity* centipede_entity = world.entities().get(centipede);
  CHECK(centipede_entity != nullptr);
  CHECK(centipede_entity->health.value == 50.0F);
  CHECK(centipede_entity->radius.value == 35.0F);
  CHECK(centipede_entity->ai.family == engine::AiFamily::kCentipede);
  CHECK(centipede_entity->ai.head);
  CHECK(centipede_entity->ai.evil == false);
  // The recovered initializer links a chain, so each segment owns the next.
  std::size_t chain = 0;
  engine::EntityHandle cursor = centipede;
  while (true) {
    engine::Entity* node = world.entities().get(cursor);
    if (node == nullptr || node->children.empty()) break;
    cursor = node->children.front();
    ++chain;
    if (chain > 64U) break;
  }
  CHECK(chain == 9U || chain == 49U);
  if (chain > 0U) {
    const engine::EntityHandle first_segment = world.entities().get(centipede)->children.front();
    engine::Entity* segment = world.entities().get(first_segment);
    CHECK(segment != nullptr);
    CHECK(segment->type_id == 16U);
    CHECK(segment->owner == centipede.raw);
  }

  const engine::EntityHandle evil = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 17, engine::Vec2(engine::f32(3000.0F), engine::f32(0.0F)));
  engine::Entity* evil_entity = world.entities().get(evil);
  CHECK(evil_entity != nullptr);
  CHECK(evil_entity->ai.evil);
  CHECK(evil_entity->ai.radius.value == 600.0F);
}

void test_quadtree_compaction_order() {
  const engine::Aabb arena{engine::f32(0.0F), engine::f32(0.0F), engine::f32(100.0F), engine::f32(100.0F)};
  engine::QuadTree tree(arena, 4, 9);
  const auto box = [](float x, float y) {
    return engine::Aabb{engine::f32(x), engine::f32(y), engine::f32(x + 1.0F), engine::f32(y + 1.0F)};
  };
  tree.insert(0, box(10.0F, 10.0F));
  tree.insert(1, box(60.0F, 10.0F));
  tree.insert(2, box(10.0F, 60.0F));
  tree.insert(3, box(60.0F, 60.0F));
  tree.insert(4, box(49.5F, 49.5F)); // stays at parent across both split planes
  CHECK(tree.node_count() == 5U);
  tree.compact();
  CHECK(tree.node_count() == 5U); // five cannot merge
  tree.remove(4);
  tree.compact();
  CHECK(tree.node_count() == 1U);
  std::vector<std::size_t> order;
  tree.query(arena, order);
  CHECK((order == std::vector<std::size_t>{0U, 1U, 2U, 3U}));
  // A later split can reuse the released nodes without stale locations/items.
  tree.insert(4, box(49.5F, 49.5F));
  CHECK(tree.node_count() == 5U);
  tree.query(arena, order);
  CHECK((order == std::vector<std::size_t>{4U, 0U, 2U, 1U, 3U}));
  tree.update(1, box(11.0F, 11.0F));
  tree.remove(4);
  tree.compact();
  tree.query(arena, order);
  std::sort(order.begin(), order.end());
  CHECK((order == std::vector<std::size_t>{0U, 1U, 2U, 3U}));
  CHECK(tree.size() == 4U);
}

void test_quadtree_order_and_collision_bounds() {
  engine::QuadTree tree(engine::Aabb{engine::f32(0.0F), engine::f32(0.0F),
                                     engine::f32(100.0F), engine::f32(100.0F)}, 1, 4);
  tree.insert(0, engine::Aabb{engine::f32(10.0F), engine::f32(10.0F),
                              engine::f32(20.0F), engine::f32(20.0F)});
  tree.insert(1, engine::Aabb{engine::f32(60.0F), engine::f32(10.0F),
                              engine::f32(70.0F), engine::f32(20.0F)});
  tree.insert(2, engine::Aabb{engine::f32(10.0F), engine::f32(60.0F),
                              engine::f32(20.0F), engine::f32(70.0F)});
  tree.insert(3, engine::Aabb{engine::f32(60.0F), engine::f32(60.0F),
                              engine::f32(70.0F), engine::f32(70.0F)});
  std::vector<std::size_t> order;
  tree.query(engine::Aabb{engine::f32(0.0F), engine::f32(0.0F),
                          engine::f32(100.0F), engine::f32(100.0F)}, order);
  CHECK(order.size() == 4U);
  const std::vector<std::size_t> expected{0U, 2U, 1U, 3U};
  CHECK(order == expected);

  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player(
    world, "bounds", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  const engine::EntityHandle child = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  engine::Entity* child_entity = world.entities().get(child);
  CHECK(child_entity != nullptr);
  child_entity->owner = player.raw;
  engine::attach_child(world, player, child);
  engine::invalidate_bounds(world, player);
  const engine::EntityBounds bounds = engine::collision_bounds(world, player);
  CHECK(bounds.valid);
  CHECK(bounds.min_x.value == -25.0F);
  CHECK(bounds.max_x.value == 40.0F);
  CHECK(bounds.min_y.value == -25.0F);
  CHECK(bounds.max_y.value == 25.0F);

  child_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(30.0F));
  engine::invalidate_bounds(world, child);
  const engine::EntityBounds moved = engine::collision_bounds(world, player);
  CHECK(moved.max_y.value == 40.0F);
  engine::detach_child(world, player, child);
  const engine::EntityBounds detached = engine::collision_bounds(world, player);
  CHECK(detached.max_y.value == 25.0F);
}

void test_area_effects_and_deferred_launch() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player(
    world, "area", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  const engine::EntityHandle inside = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  const engine::EntityHandle outside = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(200.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  world.entities().get(inside)->health = engine::f32(100.0F);
  world.entities().get(inside)->max_health = engine::f32(100.0F);
  const auto payload = engine::add_area_effect(world, player, engine::f32(50.0F),
                                               engine::EffectType::kPoison, engine::f32(10.0F),
                                               1000.0);
  CHECK(payload != nullptr);
  CHECK(world.area_effects().size() == 1U);
  (void)world.update_area_effects();
  CHECK(engine::has_effect(*world.entities().get(inside), engine::EffectType::kPoison));
  CHECK(!engine::has_effect(*world.entities().get(outside), engine::EffectType::kPoison));
  CHECK(payload->refcount >= 2U);

  const float health_before = world.entities().get(inside)->health.value;
  (void)engine::update_effects(world, 100.0);
  CHECK(world.entities().get(inside)->health.value < health_before);
  (void)engine::update_effects(world, 1000.0);
  CHECK(!engine::has_effect(*world.entities().get(inside), engine::EffectType::kPoison));

  // Re-create the area and move the target outside; the next target pass must
  // detach the shared payload.
  const auto second = engine::add_area_effect(world, player, engine::f32(50.0F),
                                              engine::EffectType::kSlow, engine::f32(0.5F),
                                              4000.0);
  CHECK(second != nullptr);
  (void)world.update_area_effects();
  CHECK(engine::has_effect(*world.entities().get(inside), engine::EffectType::kSlow));
  world.entities().get(inside)->position = engine::Vec2(engine::f32(300.0F), engine::f32(0.0F));
  (void)world.update_area_effects();
  CHECK(!engine::has_effect(*world.entities().get(inside), engine::EffectType::kSlow));

  std::vector<engine::EntityHandle> children;
  for (std::uint32_t index = 0; index < 4U; ++index) {
    const engine::EntityHandle child = engine::spawn_entity(
      world, engine::EntityKind::kPetal, 11, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
      engine::f32(5.0F));
    CHECK(child.valid());
    children.push_back(child);
  }
  world.schedule_deferred_launch(0.0, engine::f32(0.0F), children);
  CHECK(world.deferred_launches().size() == 1U);
  CHECK(world.run_deferred_launches(0.0) == 1U);
  CHECK(world.deferred_launches().empty());
  CHECK(std::fabs(world.entities().get(children[0])->velocity.y - 1.4) < 0.01F);
  CHECK(std::fabs(world.entities().get(children[0])->acceleration.y - 0.6) < 0.01F);
  CHECK(std::fabs(world.entities().get(children[0])->velocity.x) < 0.01F);
  CHECK(std::fabs(world.entities().get(children[0])->position.y.value) < 0.01F);
}

void test_attribution_death_and_pickups() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "hero", engine::make_default_profile(), false);
  CHECK(player.valid());
  (void)engine::spawn_loadout_petals(world);
  CHECK(!world.petals().empty());
  world.loadout().set_score(engine::f32(123.0F));
  world.profile().set_level(7);

  const engine::EntityHandle attacker = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  CHECK(attacker.valid());
  const std::size_t petal_count = world.petals().size();
  std::vector<engine::EntityHandle> owned_petals;
  for (const auto& petal : world.petals()) owned_petals.push_back(petal.handle);
  (void)engine::damage_entity(world, player, world.entities().get(player)->health, attacker);
  const engine::Entity* player_corpse = world.entities().get(player);
  CHECK(player_corpse != nullptr);
  if (player_corpse == nullptr) return;
  CHECK(player_corpse->death_processed);
  CHECK(player_corpse->health.value == 0.0F);
  CHECK(player_corpse->death_time_ms == world.time_ms() + 1000.0);
  CHECK(world.player() == player);
  CHECK(world.petals().empty());
  CHECK(petal_count > 0U);
  CHECK(world.last_death_score().value == 123.0F);
  CHECK(world.last_death_level() == 7U);
  CHECK(world.last_killer_name() == "Ladybug");
  // Mobs keep dying after the player. Their killer names are per-entity; the
  // local death payload must retain the entity that actually killed the
  // player instead of being overwritten by later unattributed mob deaths.
  (void)engine::damage_entity(world, attacker, world.entities().get(attacker)->health);
  CHECK(world.last_killer_name() == "Ladybug");
  for (const auto petal : owned_petals) {
    const engine::Entity* child_corpse = world.entities().get(petal);
    CHECK(child_corpse != nullptr);
    if (child_corpse == nullptr) continue;
    CHECK(child_corpse->death_processed);
    CHECK(child_corpse->health.value == 0.0F);
    CHECK(child_corpse->death_time_ms == player_corpse->death_time_ms);
  }
  engine::tick(world, 999.0);
  CHECK(world.entities().get(player) != nullptr);
  CHECK(world.player() == player);
  CHECK(world.petals().empty());
  for (const auto petal : owned_petals) CHECK(world.entities().get(petal) != nullptr);
  engine::tick(world, 1.0);
  CHECK(world.entities().get(player) == nullptr);
  CHECK(!world.player().valid());
  CHECK(world.petals().empty());
  for (const auto petal : owned_petals) CHECK(world.entities().get(petal) == nullptr);
  world.clear_hit_events();

  // Coalesced hit messages carry an epoch and a reference count.
  const engine::EntityHandle target = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  world.record_hit(target, attacker, engine::f32(3.0F), engine::f32(10.0F));
  world.record_hit(target, attacker, engine::f32(4.0F), engine::f32(6.0F));
  CHECK(world.hit_events().size() == 1U);
  CHECK(world.hit_events().front().count == 2U);
  CHECK(world.hit_events().front().refcount == 2U);
  CHECK(world.hit_events().front().amount.value == 7.0F);

  // A target allocated outside spawn_entity is not in the known list yet.
  engine::EntityPool& pool = world.entities();
  const auto hidden = pool.allocate();
  CHECK(hidden.has_value());
  world.record_hit(*hidden, attacker, engine::f32(1.0F), engine::f32(1.0F));
  CHECK(world.hit_events().size() == 1U);
  CHECK(world.pending_hit_events().size() == 1U);
  world.mark_known(*hidden);
  CHECK(world.flush_pending_hits() == 1U);
  CHECK(world.hit_events().size() == 2U);

  // Pickup intrusive registry.
  const engine::EntityHandle drop = engine::spawn_loot_drop(
    world, 1, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  CHECK(world.entities().get(drop)->radius.value == 35.0F);
  CHECK(world.pickups().size() == 1U);
  CHECK(world.entities().get(drop)->pickup_listed);
  CHECK(world.destroy(drop));
  CHECK(world.pickups().empty());
}

void test_killer_name_uses_attacker_identity() {
  {
    engine::World world;
    world.initialize();
    world.set_auto_populate(false);
    const engine::EntityHandle player = engine::spawn_player_default(
      world, "hero", engine::make_default_profile(), false);
    const engine::EntityHandle attacker = engine::spawn_entity_from_defaults(
      world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
    CHECK(player.valid());
    CHECK(attacker.valid());
    // Original43 reads attacker+160 (the attacker's own name), not the
    // attacker's stored killer. A mob killed by the player must still report
    // "Ladybug" if its death throes finish the player.
    world.entities().get(attacker)->killer_name = "hero";
    (void)engine::damage_entity(world, player, world.entities().get(player)->health, attacker);
    CHECK(world.last_killer_name() == "Ladybug");
  }
  {
    engine::World world;
    world.initialize();
    world.set_auto_populate(false);
    const engine::EntityHandle player = engine::spawn_player_default(
      world, "", engine::make_default_profile(), false);
    CHECK(player.valid());
    (void)engine::damage_entity(world, player, world.entities().get(player)->health, player);
    CHECK(world.last_killer_name().empty());
  }
}

void test_loadout_exact_layout() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player(
    world, "layout", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  world.profile().set_level(30);
  for (std::uint8_t slot = 0; slot < 6; ++slot) world.profile().set_inventory(slot, 1);
  world.profile().set_inventory(2, 3); // Heavy, so the final swap is a real type change.
  world.profile().set_inventory_count(6);
  world.loadout().restore_from_profile(world.profile());
  CHECK(world.loadout().slots()[0].type_id == 1U);
  CHECK(!world.loadout().handle(0, 0).valid());

  const std::size_t spawned = engine::spawn_loadout_petals(world);
  CHECK(spawned == 6U);
  for (std::uint8_t slot = 0; slot < 6; ++slot) {
    CHECK(world.loadout().handle(slot, 0).valid());
    CHECK(world.loadout().slots()[slot].instances[0] == world.loadout().handle(slot, 0));
    CHECK(!world.loadout().pending(slot, 0));
  }

  // Recharge gates respawn: destroying a petal starts the catalog timer and
  // spawn_loadout_petals must not recreate it until the timer expires.
  const engine::EntityHandle lost = world.loadout().handle(1, 0);
  CHECK(engine::on_petal_destroyed(world, lost));
  CHECK(world.destroy(lost));
  CHECK(engine::spawn_loadout_petals(world) == 0U);
  CHECK(engine::refresh_loadout_petals(world, 2500.0) == 1U);
  CHECK(world.loadout().handle(1, 0).valid());

  const engine::EntityHandle old = world.loadout().handle(0, 0);
  CHECK(world.loadout().change_slot_type(world, world.profile(), 0, 3));
  const engine::Entity* old_corpse = world.entities().get(old);
  CHECK(old_corpse != nullptr);
  CHECK(old_corpse->death_processed);
  CHECK(!world.loadout().handle(0, 0).valid());
  CHECK(world.loadout().slots()[0].type_id == 3U);
  CHECK(world.profile().inventory(0) == 3U);
  CHECK(world.loadout().pending(0, 0));
  CHECK(world.loadout().pending(0, 1));
  CHECK(world.loadout().pending(0, 2));
  CHECK(world.loadout().replication_epoch() > 0U);
  CHECK(world.loadout().slot_epoch(0) > 0U);

  world.loadout().set_pending_timer(0, 0, 100U);
  world.loadout().advance(50.0);
  CHECK(world.loadout().pending(0, 0));
  CHECK(world.loadout().pending_timer(0, 0) == 50U);
  world.loadout().advance(60.0);
  CHECK(!world.loadout().pending(0, 0));
  CHECK(world.loadout().pending_timer(0, 0) == 0U);

  CHECK(world.loadout().create_equipped_petal(world, 0, 0));
  const engine::EntityHandle created = world.loadout().handle(0, 0);
  CHECK(created.valid());
  CHECK(world.entities().get(created)->type_id == 3U);
  CHECK(world.entities().get(created)->owner == player.raw);
  CHECK(!world.loadout().pending(0, 0));

  CHECK(world.loadout().handle(1, 0).valid() && world.loadout().handle(2, 0).valid());
  CHECK(world.loadout().swap(world, world.profile(), 1, 1, 2, 3));
  // Both slots re-enter their catalog recharge; no entity is exchanged.
  CHECK(!world.loadout().handle(1, 0).valid());
  CHECK(!world.loadout().handle(2, 0).valid());
  CHECK(world.loadout().pending(1, 0) && world.loadout().pending(2, 0));
  CHECK(engine::spawn_loadout_petals(world) == 0U);
  // Slot 2 receives the Basic petal and returns after 2.5 s; slot 1 receives
  // Heavy and stays in recharge until its 5.5 s catalog timer expires.
  CHECK(engine::refresh_loadout_petals(world, 3000.0) == 1U);
  CHECK(!world.loadout().handle(1, 0).valid());
  CHECK(world.loadout().handle(2, 0).valid());
  CHECK(engine::refresh_loadout_petals(world, 3000.0) == 1U);
  CHECK(world.loadout().handle(1, 0).valid());

  world.loadout().set_score(engine::f32(55.0F));
  CHECK(world.loadout().score().value == 55.0F);
}

void test_alert_to_attacker_is_local() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player(
    world, "local", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  const engine::EntityHandle first = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  const engine::EntityHandle second = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)));
  CHECK(first.valid() && second.valid());
  world.entities().get(first)->ai.can_alert = true;
  (void)engine::damage_entity(world, first, engine::f32(1.0F), player);
  CHECK(world.entities().get(first)->ai.target == player);
  CHECK(!world.entities().get(second)->ai.target.valid());
}
