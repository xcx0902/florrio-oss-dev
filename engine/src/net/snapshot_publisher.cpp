#include "engine/core/perf.hpp"
#include "engine/model/catalog.hpp"
#include "engine/net/snapshot_publisher.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/angle.hpp"
#include "engine/sim/progression.hpp"
#include <algorithm>

namespace engine {
namespace {
std::uint32_t projectile_render_component(const Entity& entity) {
  if (entity.kind == EntityKind::kPetal) {
    const bool peas = catalog::is_peas_petal(entity.type_id);
    return peas && entity.petal_launched ? 5U : 7U;
  }
  if (entity.kind == EntityKind::kProjectile) {
    return entity.has_tag_component && catalog::is_web_petal(entity.type_id) ? 12U : 18U;
  }
  return 0U;
}

bool peer_handle_less(EntityHandle first, EntityHandle second) {
  return first.index() == second.index() ? first.generation() < second.generation()
                                         : first.index() < second.index();
}

}

// Publication bounds: the body rectangle includes attached children and is built
// as f32 min + diameter rather than center +/- radius, because the two round
// differently. Publication uses its own visibility pass and does not mutate the
// contact quadtree or the simulation's geometry-cache epochs.
Aabb publication_body_bounds(const World& world, const Entity& entity, PublicationBounds& cache,
                             std::uint32_t depth) {
  const auto index = entity.handle.index();
  if (!cache.cyclic && cache.state[index] == 2) {
    return cache.boxes[index];
  }
  PERF_ADD(bounds, 1);
  const f32 radius = entity.collision_radius;
  const f32 left = entity.position.x - radius;
  const f32 top = entity.position.y - radius;
  const f32 diameter = radius + radius;
  Aabb result{left, top, left + diameter, top + diameter};
  // A malformed ownership cycle falls back to the bounded-depth recursion
  // instead of the memoized box; valid attached-body trees keep their union
  // order.
  if (cache.state[index] == 1) {
    cache.cyclic = true;
  }
  if (cache.state[index] == 0) {
    cache.touched.push_back(index);
  }
  if (depth >= kEntitySlotCount) {
    return result;
  }
  cache.state[index] = 1;
  for (const EntityHandle handle : entity.children) {
    const Entity* child = world.entities().get(handle);
    if (child == nullptr || child == &entity) {
      continue;
    }
    const Aabb bounds = publication_body_bounds(world, *child, cache, depth + 1U);
    const f32 min_x = std::min(result.min_x, bounds.min_x);
    const f32 min_y = std::min(result.min_y, bounds.min_y);
    // Each union goes through min/size rather than min/max: subtract the union
    // minimum from the widest maximum, then add it back, so the stored corner
    // rounds exactly as the query side expects.
    const f32 width = std::max(result.max_x, bounds.max_x) - min_x;
    const f32 height = std::max(result.max_y, bounds.max_y) - min_y;
    result = {min_x, min_y, min_x + width, min_y + height};
  }
  if (!cache.cyclic) {
    cache.boxes[index] = result;
    cache.state[index] = 2;
  }
  return result;
}

std::vector<std::uint8_t> SnapshotPublisher::publish(const World& world, PlayerId viewer_id,
                                                     std::uint32_t sequence,
                                                     std::uint32_t reliable_ack) {
  auto& writer = writer_;
  writer.begin(sequence, reliable_ack);
  auto* viewer = world.players().get(viewer_id);
  if (viewer == nullptr) {
    return writer.finish();
  }
  // Snapshot queries spatial entities only once the viewer has a controlled
  // body. At boot the world still simulates its population, but sends only
  // control/world metadata. The domain transport has no standalone metadata
  // entities to introduce.
  if (!session_.viewer_started) {
    const Entity* player = world.entities().get(viewer->player());
    session_.viewer_started = player != nullptr && player->active;
    if (!session_.viewer_started) {
      pending_chat_.clear();
      return writer.finish();
    }
  }
  std::unordered_set<std::uint32_t> visible;
  const Entity* controlled = world.entities().get(viewer->player());
  if (session_.visibility_enabled) {
    if (controlled != nullptr && controlled->health.value > 0.0F) {
      session_.viewer_position = controlled->position;
      // An equipped Legendary Antennae widens the player's view to 0.63; the
      // ordinary live scale is 0.9. Death keeps the last peer view instead of
      // querying the world origin or switching back to a menu camera.
      bool wide_view = false;
      const auto& slots = viewer->loadout().slots();
      for (std::size_t index = 0; index < viewer->profile().active_slots(); ++index) {
        wide_view = wide_view ||
                    catalog::petal_id(slots[index].type_id) == catalog::PetalId::kAntennaeLegendary;
      }
      session_.viewer_scale = f32(wide_view ? 0.63F : 0.9F);
    }
    // Both divisions, the 200-unit margin additions and the viewer-position
    // offsets stay f32; the rectangle query uses inclusive overlap.
    const f32 width = f32(1920.0F) / session_.viewer_scale + f32(200.0F);
    const f32 height = f32(1080.0F) / session_.viewer_scale + f32(200.0F);
    const f32 left = width * f32(-0.5F) + session_.viewer_position.x;
    const f32 top = height * f32(-0.5F) + session_.viewer_position.y;
    const Aabb view{left, top, left + width, top + height};
    const f32 half_width = world.width() * f32(0.5F);
    const f32 half_height = world.height() * f32(0.5F);
    auto& bounds = bounds_;
    bounds.begin();
    // A publication has exactly one rectangle query. Building an index for it
    // costs more than testing the same cached boxes once. A view that misses
    // the arena issues no query at all, even if outlying bodies would intersect
    // it.
    const Aabb arena{f32(0.0F) - half_width, f32(0.0F) - half_height, half_width, half_height};
    if (arena.intersects(view)) {
      world.entities().with_ordered_slots([&](auto&& slots) {
        for (const auto& entity : slots) {
          PERF_ADD(visits, 1);
          if (entity.active && publication_body_bounds(world, entity, bounds).intersects(view)) {
            visible.insert(entity.handle.raw);
          }
        }
      });
    }
    // The controlled body is introduced independently of the rectangle
    // (important when the eye and a newly spawned body differ).
    if (controlled != nullptr) {
      visible.insert(controlled->handle.raw);
    }
  } else {
    world.entities().with_ordered_slots([&](auto&& slots) {
      for (const auto& entity : slots) {
        if (entity.active) {
          visible.insert(entity.handle.raw);
        }
      }
    });
  }
  std::vector<EntityHandle> removed;
  for (const EntityHandle handle : world.destroyed()) {
    if (session_.known.contains(handle.raw)) {
      removed.push_back(handle);
    }
  }
  if (session_.visibility_enabled) {
    for (const auto raw : session_.known) {
      if (!visible.contains(raw)) {
        removed.push_back(EntityHandle{raw});
      }
    }
  }
  std::sort(removed.begin(), removed.end(), peer_handle_less);
  removed.erase(std::unique(removed.begin(), removed.end()), removed.end());
  for (const EntityHandle handle : removed) {
    writer.write_delete(handle);
    session_.published.erase(handle.to_wire());
  }
  for (const auto& text : pending_chat_) {
    writer.write_chat_event(text);
  }
  pending_chat_.clear();
  for (const HitEvent& hit : world.hit_events()) {
    if (session_.visibility_enabled && !visible.contains(hit.target.raw) &&
        !session_.known.contains(hit.target.raw)) {
      continue;
    }
    // Attribution events are written from the current domain record; there is
    // no fixed-size attribution object to copy.
    writer.write_entity_time_event(hit.target);
  }
  for (const auto& transfer : viewer->loadout().pickup_transfers()) {
    if (!session_.visibility_enabled || visible.contains(transfer.drop.raw) ||
        session_.known.contains(transfer.drop.raw)) {
      writer.write_visual_event(transfer.drop, transfer.slot);
    }
  }
  // Mask bits are component ordinals, not the sparse field ids the codec
  // writes: transform is bit 5 (field 6), health bit 19 (field 20), visual
  // transform bit 20 (field 21), collider radius bit 25 (field 26) and identity
  // bit 29 (field 30).
  constexpr std::uint32_t kDomainMask =
      (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active || !visible.contains(entity.handle.raw)) {
        continue;
      }
      const std::uint32_t mask =
          default_dense_groups_ ? SnapshotEncoder::kDefaultDenseComponentMask : kDomainMask;
      const std::array<std::uint32_t, 2> camera_bits{
          {entity.position.x.bits(), entity.position.y.bits()}};
      auto& published = session_.published[entity.handle.to_wire()];
      const bool camera_x_changed = !published.camera || (*published.camera)[0] != camera_bits[0];
      const bool camera_y_changed = !published.camera || (*published.camera)[1] != camera_bits[1];
      const std::array<std::uint64_t, 2> position_revisions{
          {entity.position_x_revision, entity.position_y_revision}};
      const bool visual_x_changed = camera_x_changed || !published.position ||
                                    (*published.position)[0] != position_revisions[0];
      const bool visual_y_changed = camera_y_changed || !published.position ||
                                    (*published.position)[1] != position_revisions[1];
      const auto angle_value = pack_snapshot_angle(entity.angle.value);
      const bool angle_changed = !published.angle || *published.angle != angle_value;
      // A newly spawned pickup is introduced with the arrival bit so
      // the client replays its birth animation. Pickups already in view keep
      // full scale; only a pickup's first snapshot animates.
      const bool arriving =
          (entity.kind == EntityKind::kDrop || projectile_render_component(entity) == 12U) &&
          !session_.known.contains(entity.handle.raw) && world.tick() <= entity.spawn_tick + 1U;
      writer.write_mask_domain_fields(
          entity.handle, mask,
          entity.kind == EntityKind::kPlayer ? entity.player_look
                                             : static_cast<std::uint8_t>(entity.type_id),
          static_cast<std::uint8_t>(entity.kind),
          entity.kind == EntityKind::kPlayer ? entity.player_expression : entity.loadout_instance,
          entity.position.x.value, entity.position.y.value, entity.angle.value, entity.health.value,
          entity.max_health.value, entity.collision_radius.value, entity.death_processed ? 1U : 0U,
          camera_x_changed, camera_y_changed, angle_changed,
          entity.ai.enabled ? std::optional<std::uint8_t>(entity.ai.activity_flags) : std::nullopt,
          visual_x_changed, visual_y_changed, arriving);
      published.camera = camera_bits;
      published.position = position_revisions;
      published.angle = angle_value;
      if (entity.kind == EntityKind::kDrop) {
        writer.write_mask_byte_field(entity.handle, mask, 22U,
                                     static_cast<std::uint8_t>(entity.type_id));
        writer.write_mask_byte_field(entity.handle, mask, 54U, entity.pickup_collected ? 1U : 0U);
      }
      if (entity.kind == EntityKind::kPetal) {
        // Domain fields 11/12 carry the actual equipped slot and instance, not
        // the per-slot capacity counts.
        writer.write_mask_byte_field(entity.handle, mask, 11U, entity.loadout_slot);
        writer.write_mask_byte_field(entity.handle, mask, 12U, entity.loadout_instance);
      }
      const auto* owner = world.players().by_body(entity.handle);
      if (entity.kind == EntityKind::kPlayer && owner != nullptr) {
        // Player fields: 58 is a normalized u16 XP fraction, 59 is the
        // scoreboard score, 62 is the displayed level and 63 the zone countdown.
        // Keep these authoritative; the client must never substitute a recorded
        // HUD sample.
        const float threshold = experience_threshold(owner->profile().level()).value;
        const float progress =
            threshold > 0.0F
                ? std::clamp(owner->profile().experience().value * 65535.0F / threshold, 0.0F,
                             65535.0F)
                : 0.0F;
        writer.write_mask_varint_field(entity.handle, mask, 58U,
                                       static_cast<std::uint32_t>(progress));
        const auto score_bits = owner->loadout().score().bits();
        if (!published.score || *published.score != score_bits) {
          writer.write_mask_float_field(entity.handle, mask, 59U, owner->loadout().score().value);
          published.score = score_bits;
        }
        writer.write_mask_byte_field(entity.handle, mask, 62U, owner->profile().level());
        {
          const std::uint8_t zone = owner->zone_progress();
          if (zone != 0U || session_.zone_progress != 0U) {
            writer.write_mask_byte_field(entity.handle, mask, 63U, zone);
          }
          session_.zone_progress = zone;
        }
        PublishedLoadout loadout;
        for (std::size_t slot = 0; slot < loadout.inventory.size(); ++slot) {
          loadout.inventory[slot] =
              static_cast<std::uint8_t>(owner->loadout().slots()[slot].type_id);
        }
        loadout.recharge = owner->loadout().recharge_progress();
        writer.write_mask_loadout_fields(
            entity.handle, mask, loadout.inventory, loadout.recharge,
            !published.loadout || published.loadout->inventory != loadout.inventory,
            !published.loadout || published.loadout->recharge != loadout.recharge);
        published.loadout = loadout;
      }
      if (default_dense_groups_ && camera_x_changed && camera_y_changed && angle_changed) {
        writer.write_dense_default_groups(entity);
      }
      if (entity.kind == EntityKind::kPlayer && entity.death_processed && owner != nullptr) {
        // The player-controller profile survives death, but the domain
        // transport carries it on the controlled body. Emit the death screen
        // fields there so the respawn menu can read killer, lost items and
        // score. They follow the dense defaults, which zero the same fields.
        writer.write_mask_string_field(entity.handle, mask, 6U, entity.killer_name);
        // Controller survivors: up to ten, after the first three ground drops.
        const auto& kept_items = owner->last_death_kept();
        for (std::uint32_t index = 0; index < 10U; ++index) {
          writer.write_mask_byte_array_field(entity.handle, mask, 16U, index,
                                             static_cast<std::uint8_t>(kept_items[index]));
        }
        writer.write_mask_float_field(entity.handle, mask, 21U, owner->last_death_score().value);
        writer.write_mask_byte_field(entity.handle, mask, 34U,
                                     static_cast<std::uint8_t>(owner->last_death_kept_count()));
        writer.write_mask_byte_field(entity.handle, mask, 47U,
                                     static_cast<std::uint8_t>(owner->last_death_level()));
        writer.write_mask_byte_field(
            entity.handle, mask, 1U,
            static_cast<std::uint8_t>((entity.health.value > 0.0F ? owner->profile().level()
                                                                  : owner->last_death_level()) *
                                      3U / 4U));
        writer.write_mask_reference_field(entity.handle, mask, 56U, entity.handle.to_wire());
      }
      // Keep the fixed dense payload's plan unchanged. Emit the render
      // declaration after it: putting group 68/76 before the dense record would
      // make its decoder consume bytes that payload does not contain.
      const auto render_component = projectile_render_component(entity);
      if (render_component != 0U) {
        const auto render_mask =
            mask | (1U << (render_component - 1U)) | (render_component == 5U ? 1U << 6U : 0U);
        if (render_component == 5U) {
          writer.write_mask_byte_field(entity.handle, render_mask, 9U, entity.petal_variant_flags);
          writer.write_mask_byte_field(entity.handle, render_mask, 50U,
                                       static_cast<std::uint8_t>(entity.type_id));
        } else if (render_component == 7U) {
          writer.write_mask_byte_field(entity.handle, render_mask, 50U,
                                       static_cast<std::uint8_t>(entity.type_id));
        } else {
          writer.write_mask_entity(entity.handle, render_mask);
        }
      }
    }
  });
  session_.known = std::move(visible);
  return writer.finish();
}

}
