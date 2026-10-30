void test_world_clock_tracks_tick() {
  engine::World world;
  world.initialize();
  CHECK(world.tick() == 0U);
  CHECK(world.time_ms() == 0.0);
  engine::tick(world, 50.0);
  CHECK(world.tick() == 1U);
  CHECK(world.time_ms() == 50.0);
}

void test_loadout_reserve_cycle_and_packet_cache() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  engine::PlayerProfile profile;
  profile.set_level(20);
  for (std::uint8_t slot = 0; slot < 6; ++slot) profile.set_inventory(slot, 1);
  profile.set_inventory_count(6);
  const engine::EntityHandle player = engine::spawn_player(world, "p",
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  world.profile() = profile;
  world.loadout().restore_from_profile(world.profile());
  const std::uint32_t epoch_before = world.loadout().packet_cache_epoch();
  CHECK(world.loadout().cycle_reserve_slots(world, world.profile()));
  CHECK(world.loadout().packet_cache_epoch() > epoch_before);
  CHECK(world.loadout().slots()[6].type_id == 1U);
  CHECK(world.loadout().slots()[7].type_id == 1U);
  CHECK(world.loadout().slots()[8].type_id == 2U);
  CHECK(world.loadout().slots()[13].type_id == 7U);
  const engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  CHECK(player_entity->packet_epoch_a == world.loadout().packet_cache_epoch());
  CHECK(player_entity->packet_epoch_b == world.loadout().packet_cache_epoch());
  // A full backpack shifts its oldest entry before appending the discarded petal.
  for (std::uint16_t item = 1; item <= 16; ++item) world.profile().push_backpack(item);
  CHECK(world.profile().backpack_count() == 16U);
  CHECK(world.profile().backpack()[0] == 1U);
  world.profile().push_backpack(30U);
  CHECK(world.profile().backpack_count() == 16U);
  CHECK(world.profile().backpack()[0] == 2U);
  CHECK(world.profile().backpack()[15] == 30U);
}

void test_contact_nearest_candidate_first() {
  engine::World world;
  world.initialize();
  const auto spawn = [&world](float x) {
    return engine::spawn_entity(world, engine::EntityKind::kMob, 1,
      engine::Vec2(engine::f32(x), engine::f32(0.0F)), engine::f32(10.0F));
  };
  const engine::EntityHandle left = spawn(-15.0F);
  const engine::EntityHandle center = spawn(0.0F);
  const engine::EntityHandle right = spawn(15.0F);
  CHECK(left.valid() && center.valid() && right.valid());
  for (const auto handle : {left, center, right}) {
    engine::Entity* entity = world.entities().get(handle);
    CHECK(entity != nullptr);
    entity->health = engine::f32(10.0F);
    entity->max_health = engine::f32(10.0F);
  }
  (void)engine::resolve_contacts(world);
  // Slot order is left/center/right. The original broad phase visits the
  // nearest candidate first, so center is pushed right by left and then left
  // again by right: the net position stays on the left side of the origin.
  const engine::Entity* moved = world.entities().get(center);
  CHECK(moved != nullptr);
  CHECK(moved->position.x.value < 0.0F);
  CHECK(world.entities().get(left)->position.x.value < -15.0F);
  CHECK(world.entities().get(right)->position.x.value > 15.0F);
}

void test_chain_constraint_clamps_segments() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle head = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(head.valid());
  engine::Entity* head_entity = world.entities().get(head);
  CHECK(head_entity != nullptr);
  CHECK(head_entity->children.size() == 1U);
  // Move the head far enough that every link is stretched, then run the
  // original 401 constraint pass.
  head_entity->position.x = engine::f32(500.0F);
  engine::constrain_linked_entities(world);
  std::size_t links = 0;
  engine::EntityHandle current = head;
  for (std::uint32_t guard = 0; guard < 64U; ++guard) {
    const engine::Entity* parent = world.entities().get(current);
    if (parent == nullptr || parent->children.empty()) break;
    current = parent->children.front();
    const engine::Entity* child = world.entities().get(current);
    CHECK(child != nullptr);
    if (child == nullptr) break;
    const double dx = static_cast<double>(parent->position.x.value)
                    - static_cast<double>(child->position.x.value);
    const double dy = static_cast<double>(parent->position.y.value)
                    - static_cast<double>(child->position.y.value);
    const double limit = static_cast<double>(parent->collision_radius.value)
                       + 0.0001 + static_cast<double>(child->collision_radius.value);
    CHECK(std::sqrt(dx * dx + dy * dy) <= limit + 1e-3);
    ++links;
  }
  CHECK(links == 9U);
}


void test_collision_bounds_cache_rebuild_counter() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle handle = engine::spawn_entity(
    world, engine::EntityKind::kMob, 1, engine::Vec2(engine::f32(12.0F), engine::f32(-4.0F)),
    engine::f32(18.0F));
  CHECK(handle.valid());
  const std::uint64_t before = world.bounds_rebuilds();
  const engine::EntityBounds first = engine::collision_bounds(world, handle);
  CHECK(first.valid);
  CHECK(world.bounds_rebuilds() == before + 1U);
  const engine::EntityBounds cached = engine::collision_bounds(world, handle);
  CHECK(world.bounds_rebuilds() == before + 1U); // same tick, same dirty state
  CHECK(cached.min_x.value == first.min_x.value);
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  entity->position.x = engine::f32(40.0F);
  engine::invalidate_bounds(world, handle);
  const engine::EntityBounds moved = engine::collision_bounds(world, handle);
  CHECK(world.bounds_rebuilds() == before + 2U);
  CHECK(moved.min_x.value > first.min_x.value);
}

void test_loadout_flag41_pending_cache() {
  engine::PlayerLoadout loadout;
  // Rose (24) has flag41 and three instances: the special branch gives every
  // live instance the same cache index and advances once for the slot.
  CHECK(loadout.equip(0, 24));
  CHECK(loadout.pending_cache_count() == 1U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 0U);
  CHECK(loadout.pending_cache(0, 2) == 0U);
  loadout.set_handle(0, 0, engine::EntityHandle::from_parts(7, 1));
  CHECK(loadout.equip(1, 1));
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 0U);
  CHECK(loadout.pending_cache(0, 2) == 0U);
  CHECK(loadout.pending_cache(1, 0) == 1U);
  CHECK(loadout.pending_cache_count() == 2U);
  // The function-85 total is captured at the active-slot band, not at slot 8.
  loadout.set_active_slots(5);
  CHECK(loadout.equip(2, 1));
  CHECK(loadout.equip(3, 1));
  CHECK(loadout.equip(4, 1));
  CHECK(loadout.equip(5, 1));
  CHECK(loadout.pending_cache(5, 0) == 5U); // still gets an order
  CHECK(loadout.pending_cache_count() == 5U); // captured after slot 4
}

void test_loadout_slot_epochs_bump_on_change() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 1));
  const std::uint32_t first = loadout.slot_epoch(0);
  CHECK(first > 0U);
  CHECK(loadout.equip(1, 6));
  const std::uint32_t second = loadout.slot_epoch(1);
  CHECK(second > first);
  CHECK(loadout.slot_epoch(0) == first); // untouched slot keeps its epoch
  CHECK(loadout.discard(0, 1));
  CHECK(loadout.slot_epoch(0) > first);
  CHECK(loadout.equip(2, 1));
  const std::uint32_t third = loadout.slot_epoch(2);
  CHECK(loadout.swap(1, 6, 2, 1));
  CHECK(loadout.slot_epoch(1) > second);
  CHECK(loadout.slot_epoch(2) > third);
}

void test_loadout_pending_cache_order() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 17)); // Triplet: three instances per slot
  CHECK(loadout.pending_cache_count() == 3U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 1U);
  CHECK(loadout.pending_cache(0, 2) == 2U);
  loadout.set_handle(0, 0, engine::EntityHandle::from_parts(5, 1));
  CHECK(loadout.equip(1, 1)); // Basic: one instance per slot
  CHECK(loadout.pending_cache_count() == 4U);
  CHECK(loadout.pending_cache(1, 0) == 3U);
  CHECK(loadout.pending_cache(1, 1) == 0U);
  CHECK(loadout.pending_cache(1, 2) == 0U);
  CHECK(loadout.equip(2, 1));
  CHECK(loadout.pending_cache(2, 0) == 4U);
  loadout.clear();
  CHECK(loadout.pending_cache_count() == 0U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
}

void test_effect_payload_released_on_destroy() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle target = engine::spawn_entity(
    world, engine::EntityKind::kMob, 1, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)),
    engine::f32(20.0F));
  CHECK(target.valid());
  engine::Entity* entity = world.entities().get(target);
  CHECK(entity != nullptr);
  const auto payload = engine::make_effect_payload(engine::EffectType::kPoison,
    engine::f32(2.0F), 1000.0, engine::EntityHandle{});
  CHECK(payload->refcount == 1U);
  CHECK(std::has_virtual_destructor_v<engine::EffectPayload>);
  CHECK(engine::attach_effect_payload(*entity, payload));
  CHECK(payload->refcount == 2U);
  const auto second_payload = engine::make_effect_payload(
    engine::EffectType::kPoison, engine::f32(1.0F), 1000.0, engine::EntityHandle{});
  CHECK(second_payload->id == payload->id + 1U);
  CHECK(entity->effect_count == 1U);
  CHECK(world.destroy(target));
  CHECK(payload->refcount == 1U);
  CHECK(payload->active);
}

void test_tick_phase_trace() {
  engine::World world;
  world.initialize();
  engine::tick(world, 50.0);
  static const char* expected[] = {
    "regenerate-players", "drops", "petal-behaviors", "linked-constraints", "population", "ai",
    "deferred-launches", "effects", "area-effects", "petal-phase", "loadout-petals",
    "petal-orbits", "player-controls", "movement", "ant-hole-release", "broadphase", "contacts",
    "reap-dead", "expire-drops", "corpse-sweep", "hit-flush",
  };
  CHECK(world.phase_trace().size() == std::size(expected));
  for (std::size_t index = 0; index < world.phase_trace().size() && index < std::size(expected); ++index)
    CHECK(std::strcmp(world.phase_trace()[index], expected[index]) == 0);

  // A player crossing the pickup radius during movement must be evaluated at
  // the pre-movement position: reject entry this tick, accept departure.
  for (const bool entering : {true, false}) {
    engine::World pickup_world;
    pickup_world.initialize();
    pickup_world.set_auto_populate(false);
    const auto player = engine::spawn_player(pickup_world, "phase", engine::Vec2{}, {});
    const float drop_x = entering ? 74.0F : 69.0F;
    const auto drop = engine::spawn_drop(pickup_world, 2,
      engine::Vec2(engine::f32(drop_x), engine::f32(0.0F)));
    CHECK(player.valid() && drop.valid());
    if (!player.valid() || !drop.valid()) return;
    pickup_world.entities().get(player)->velocity.x = entering ? 0.125 : -0.125;
    pickup_world.set_time_ms(450.0);
    engine::tick(pickup_world, 50.0);
    const auto* moved_player = pickup_world.entities().get(player);
    const auto* pickup = pickup_world.entities().get(drop);
    CHECK(moved_player != nullptr && pickup != nullptr);
    if (moved_player == nullptr || pickup == nullptr) return;
    const float distance_after_movement = drop_x - moved_player->position.x.value;
    CHECK(entering ? distance_after_movement < 70.0F : distance_after_movement > 70.0F);
    CHECK(pickup->pickup_collected == !entering);
    CHECK(pickup_world.loadout().pickup_transfers().size() == (entering ? 0U : 1U));
    CHECK(pickup_world.profile().inventory(0) == (entering ? 0U : 2U));
  }
}

void test_quadtree_update_counter() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  CHECK(world.quadtree_updates() == 0U);
  engine::tick(world, 50.0);
  CHECK(world.quadtree_updates() == 1U);
  engine::tick(world, 50.0);
  CHECK(world.quadtree_updates() == 2U);
}

void test_deferred_launch_due_order() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle child = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 11, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
    engine::f32(5.0F));
  CHECK(child.valid());
  world.schedule_deferred_launch(100.0, engine::f32(0.0F), {child});
  world.schedule_deferred_launch(50.0, engine::f32(0.0F), {child});
  CHECK(world.deferred_launches().size() == 2U);
  CHECK(world.run_deferred_launches(40.0) == 0U);
  CHECK(world.last_launch_order().empty());
  CHECK(world.run_deferred_launches(100.0) == 2U);
  CHECK(world.last_launch_order().size() == 2U);
  CHECK(world.last_launch_order()[0] == 2U);
  CHECK(world.last_launch_order()[1] == 1U);
  CHECK(world.deferred_launches().empty());
}
