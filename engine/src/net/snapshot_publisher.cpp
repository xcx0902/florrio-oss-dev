#include "engine/net/snapshot_publisher.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/angle.hpp"
#include "engine/sim/progression.hpp"
#include <algorithm>

namespace engine {
namespace {
std::uint32_t projectile_render_component(const Entity& entity) {
  if (entity.kind == EntityKind::kPetal) {
    const bool peas = entity.type_id == 11U || entity.type_id == 12U || entity.type_id == 34U;
    return peas && entity.petal_launched ? 5U : 7U;
  }
  if (entity.kind == EntityKind::kProjectile)
    return entity.has_tag_component && (entity.type_id == 29U || entity.type_id == 30U) ? 12U : 18U;
  return 0U;
}

/** Original167: circle bounds include attached children. Keep the original
 * f32 min+diameter construction, rather than replacing it with center+radius.
 * Publication uses its own index and does not mutate the contact quadtree or
 * the simulation's geometry-cache epochs. */
Aabb peer_body_bounds(const World& world, const Entity& entity, std::uint32_t depth = 0U) {
  const f32 radius = entity.collision_radius;
  const f32 left = entity.position.x - radius;
  const f32 top = entity.position.y - radius;
  const f32 diameter = radius + radius;
  Aabb result{left, top, left + diameter, top + diameter};
  if (depth >= kEntitySlotCount) return result;
  for (const EntityHandle handle : entity.children) {
    const Entity* child = world.entities().get(handle);
    if (child == nullptr || child == &entity) continue;
    const Aabb bounds = peer_body_bounds(world, *child, depth + 1U);
    const f32 min_x = std::min(result.min_x, bounds.min_x);
    const f32 min_y = std::min(result.min_y, bounds.min_y);
    // Original167 stores min/size, not min/max. Preserve the subtraction
    // and subsequent query-side addition at each attached-body union.
    const f32 width = std::max(result.max_x, bounds.max_x) - min_x;
    const f32 height = std::max(result.max_y, bounds.max_y) - min_y;
    result = {min_x, min_y, min_x + width, min_y + height};
  }
  return result;
}

bool peer_handle_less(EntityHandle first, EntityHandle second) {
  return first.index() == second.index() ? first.generation() < second.generation()
                                        : first.index() < second.index();
}

}
std::vector<std::uint8_t> SnapshotPublisher::publish(World& world, std::uint32_t sequence,
                                                           std::uint32_t reliable_ack) {
  SnapshotEncoder writer;
  writer.begin(sequence, reliable_ack);
  // Original 654 beginSnapshot only queries spatial entities after the local
  // viewer component (+120) has a controlled body (+100). At boot the world
  // still simulates its population, but sends only control/world metadata.
  // The domain transport has no standalone metadata entities to introduce.
  if (!session_.viewer_started) {
    const Entity* player = world.entities().get(world.player());
    session_.viewer_started = player != nullptr && player->active;
    if (!session_.viewer_started) {
      world.clear_destroyed();
      pending_chat_.clear();
      world.clear_hit_events();
      world.loadout().clear_pickup_transfers();
      return writer.finish();
    }
  }
  std::unordered_set<std::uint32_t> visible;
  const Entity* controlled = world.entities().get(world.player());
  if (session_.visibility_enabled) {
    if (controlled != nullptr && controlled->health.value > 0.0F) {
      session_.viewer_position = controlled->position;
      // Original145: an equipped type25 widens the player's view. The
      // ordinary live scale is 0.9; death keeps the last peer view instead
      // of querying the world origin or switching back to a menu camera.
      bool wide_view = false;
      const auto& slots = world.loadout().slots();
      for (std::size_t index = 0; index < world.profile().active_slots(); ++index)
        wide_view = wide_view || slots[index].type_id == 25U;
      session_.viewer_scale = f32(wide_view ? 0.63F : 0.9F);
    }
    // Both divisions, additions and origin offsets store f32; the rectangle
    // query uses inclusive overlap.
    const f32 width = f32(1920.0F) / session_.viewer_scale + f32(200.0F);
    const f32 height = f32(1080.0F) / session_.viewer_scale + f32(200.0F);
    const f32 left = width * f32(-0.5F) + session_.viewer_position.x;
    const f32 top = height * f32(-0.5F) + session_.viewer_position.y;
    const Aabb view{left, top, left + width, top + height};
    const f32 half_width = world.width() * f32(0.5F);
    const f32 half_height = world.height() * f32(0.5F);
    QuadTree tree({f32(0.0F) - half_width, f32(0.0F) - half_height, half_width, half_height}, 4U, 6U);
    for (const auto& entity : world.entities().entities())
      if (entity.active) tree.insert(entity.handle.index(), peer_body_bounds(world, entity));
    std::vector<std::size_t> candidates;
    tree.query(view, candidates);
    for (const auto index : candidates) {
      const auto& entity = world.entities().entities()[index];
      if (entity.active && peer_body_bounds(world, entity).intersects(view))
        visible.insert(entity.handle.raw);
    }
    // Original5897–5936 introduces the controlled body independently of the
    // rectangle (important when the eye and a newly spawned body differ).
    if (controlled != nullptr) visible.insert(controlled->handle.raw);
  } else {
    for (const auto& entity : world.entities().entities())
      if (entity.active) visible.insert(entity.handle.raw);
  }
  std::vector<EntityHandle> removed;
  for (const EntityHandle handle : world.destroyed())
    if (session_.known.contains(handle.raw)) removed.push_back(handle);
  if (session_.visibility_enabled)
    for (const auto raw : session_.known)
      if (!visible.contains(raw)) removed.push_back(EntityHandle{raw});
  std::sort(removed.begin(), removed.end(), peer_handle_less);
  removed.erase(std::unique(removed.begin(), removed.end()), removed.end());
  for (const EntityHandle handle : removed) {
    writer.write_delete(handle);
    session_.published.erase(handle.to_wire());

  }
  world.clear_destroyed();
  for (const auto& text : pending_chat_) writer.write_chat_event(text);
  pending_chat_.clear();
  for (const HitEvent& hit : world.hit_events()) {
    if (session_.visibility_enabled && !visible.contains(hit.target.raw)
        && !session_.known.contains(hit.target.raw)) continue;
    // Attribution events use the current domain record directly; the retired
    // fixed-size attribution object is not part of the product layout.
    writer.write_entity_time_event(hit.target);
  }
  world.clear_hit_events();
  for (const auto& transfer : world.loadout().pickup_transfers())
    if (!session_.visibility_enabled || visible.contains(transfer.drop.raw)
        || session_.known.contains(transfer.drop.raw))
      writer.write_visual_event(transfer.drop, transfer.slot);
  world.loadout().clear_pickup_transfers();
  // Component ordinals are not the sparse field ids: transform is 6 (72),
  // identity is 30 (152), health is 20 (116), visual transform is 21 (120),
  // collider radius is 26 (140).
  constexpr std::uint32_t kDomainMask =
    (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || !visible.contains(entity.handle.raw)) continue;
    const std::uint32_t mask = default_dense_groups_
      ? SnapshotEncoder::kDefaultDenseComponentMask : kDomainMask;
    const std::array<std::uint32_t, 2> camera_bits{{entity.position.x.bits(), entity.position.y.bits()}};
    auto& published = session_.published[entity.handle.to_wire()];
    const bool camera_x_changed = !published.camera || (*published.camera)[0] != camera_bits[0];
    const bool camera_y_changed = !published.camera || (*published.camera)[1] != camera_bits[1];
    const std::array<std::uint64_t, 2> position_revisions{{entity.position_x_revision, entity.position_y_revision}};
    const bool visual_x_changed = camera_x_changed || !published.position || (*published.position)[0] != position_revisions[0];
    const bool visual_y_changed = camera_y_changed || !published.position || (*published.position)[1] != position_revisions[1];
    const auto angle_value = pack_snapshot_angle(entity.angle.value);
    const bool angle_changed = !published.angle || *published.angle != angle_value;
    // A newly spawned pickup is introduced with the arrival bit so
    // the client replays its birth animation. Pickups that were already in
    // view keep full scale, matching the original first-snapshot behaviour.
    const bool arriving = (entity.kind == EntityKind::kDrop || projectile_render_component(entity) == 12U)
      && !session_.known.contains(entity.handle.raw)
      && world.tick() <= entity.spawn_tick + 1U;
    writer.write_mask_domain_fields(entity.handle, mask,
      entity.kind == EntityKind::kPlayer ? entity.player_look : static_cast<std::uint8_t>(entity.type_id),
      static_cast<std::uint8_t>(entity.kind),
      entity.kind == EntityKind::kPlayer ? entity.player_expression : entity.loadout_instance,
      entity.position.x.value, entity.position.y.value,
      entity.angle.value, entity.health.value, entity.max_health.value, entity.collision_radius.value,
      entity.death_processed ? 1U : 0U, camera_x_changed, camera_y_changed, angle_changed,
      entity.ai.enabled ? std::optional<std::uint8_t>(entity.ai.activity_flags) : std::nullopt,
      visual_x_changed, visual_y_changed, arriving);
    published.camera = camera_bits;
    published.position = position_revisions;
    published.angle = angle_value;
    if (entity.kind == EntityKind::kDrop) {
      writer.write_mask_byte_field(entity.handle, mask, 22U, static_cast<std::uint8_t>(entity.type_id));
      writer.write_mask_byte_field(entity.handle, mask, 54U, entity.pickup_collected ? 1U : 0U);
    }
    if (entity.kind == EntityKind::kPetal) {
      // Domain fields 11/12 identify the actual equipped slot/instance.
      // These are not the original world component's capacity bytes.
      writer.write_mask_byte_field(entity.handle, mask, 11U, entity.loadout_slot);
      writer.write_mask_byte_field(entity.handle, mask, 12U, entity.loadout_instance);
    }
    if (entity.kind == EntityKind::kPlayer) {
      // Original player component fields: 58 is a normalized u16 XP fraction,
      // 59 is the scoreboard score, and 62 is the displayed level. Keep these
      // authoritative; the client must never substitute a recorded HUD sample.
      const float threshold = experience_threshold(world.profile().level()).value;
      const float progress = threshold > 0.0F
        ? std::clamp(world.profile().experience().value * 65535.0F / threshold, 0.0F, 65535.0F) : 0.0F;
      writer.write_mask_varint_field(entity.handle, mask, 58U,
        static_cast<std::uint32_t>(progress));
      const auto score_bits = world.loadout().score().bits();
      if (!published.score || *published.score != score_bits) {
        writer.write_mask_float_field(entity.handle, mask, 59U, world.loadout().score().value);
        published.score = score_bits;
      }
      writer.write_mask_byte_field(entity.handle, mask, 62U,
        world.profile().level());
      {
        const std::uint8_t zone = world.zone_progress();
        if (zone != 0U || session_.zone_progress != 0U)
          writer.write_mask_byte_field(entity.handle, mask, 63U, zone);
        session_.zone_progress = zone;
      }
      PublishedLoadout loadout;
      for (std::size_t slot = 0; slot < loadout.inventory.size(); ++slot)
        loadout.inventory[slot] = static_cast<std::uint8_t>(world.loadout().slots()[slot].type_id);
      loadout.recharge = world.loadout().recharge_progress();
      writer.write_mask_loadout_fields(entity.handle, mask, loadout.inventory, loadout.recharge,
        !published.loadout || published.loadout->inventory != loadout.inventory,
        !published.loadout || published.loadout->recharge != loadout.recharge);
      published.loadout = loadout;
    }
    if (default_dense_groups_ && camera_x_changed && camera_y_changed && angle_changed)
      writer.write_dense_default_groups(entity);
    if (entity.kind == EntityKind::kPlayer && entity.death_processed) {
      // The archived client reads death statistics from control component 478,
      // a standalone record that the domain transport does not carry. Emit the
      // same fields on the controlled body so the death screen and the respawn
      // menu retain the original killer/lost-item/score data. These records
      // intentionally follow the dense defaults, whose group 72 writes zeros.
      writer.write_mask_string_field(entity.handle, mask, 6U, entity.killer_name);
      // Controller survivors: up to ten, after the first three ground drops.
      const auto& kept_items = world.last_death_kept();
      for (std::uint32_t index = 0; index < 10U; ++index)
        writer.write_mask_byte_array_field(entity.handle, mask, 16U, index,
          static_cast<std::uint8_t>(kept_items[index]));
      writer.write_mask_float_field(entity.handle, mask, 21U,
        world.last_death_score().value);
      writer.write_mask_byte_field(entity.handle, mask, 34U,
        static_cast<std::uint8_t>(world.last_death_kept_count()));
      writer.write_mask_byte_field(entity.handle, mask, 47U,
        static_cast<std::uint8_t>(world.last_death_level()));
      writer.write_mask_byte_field(entity.handle, mask, 1U,
        static_cast<std::uint8_t>((entity.health.value > 0.0F
          ? world.profile().level() : world.last_death_level()) * 3U / 4U));
      writer.write_mask_reference_field(entity.handle, mask, 56U,
        entity.handle.to_wire());
    }
    // Keep the fixed dense payload's plan unchanged. Publish the native art
    // declaration after it: adding group 68/76 before the dense record would
    // make its decoder consume bytes that payload does not contain.
    const auto render_component = projectile_render_component(entity);
    if (render_component != 0U) {
      const auto render_mask = mask | (1U << (render_component - 1U))
        | (render_component == 5U ? 1U << 6U : 0U);
      if (render_component == 5U) {
        writer.write_mask_byte_field(entity.handle, render_mask, 9U, entity.petal_render_flags);
        writer.write_mask_byte_field(entity.handle, render_mask, 50U,
          static_cast<std::uint8_t>(entity.type_id));
      } else if (render_component == 7U)
        writer.write_mask_byte_field(entity.handle, render_mask, 50U,
          static_cast<std::uint8_t>(entity.type_id));
      else writer.write_mask_entity(entity.handle, render_mask);
    }
  }
  session_.known = std::move(visible);
  return writer.finish();
}

}
