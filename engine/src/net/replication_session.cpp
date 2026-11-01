#include "engine/net/replication_session.hpp"
#include "engine/net/snapshot_publisher.hpp"
#include "engine/model/entity_relations.hpp"

namespace engine::net {
namespace {
constexpr std::uint32_t publicMask = kPublicComponentMask;
std::optional<EntityUpdate> project(const World& world, const Entity& entity, bool dense) {
  EntityUpdate update;
  update.handle = entity.handle.to_wire();
  const auto source = damage_source(world, entity.handle);
  if (source.player.raw >= kCounterDrainAt) return {};
  update.ownerPlayerId = static_cast<std::uint32_t>(source.player.raw);
  update.ownerHandle = source.body.to_wire();
  update.slot = entity.loadout_slot; update.instance = entity.loadout_instance;
  SnapshotEncoder codec; codec.begin(1);
  codec.write_mask_domain_fields(entity.handle, publicMask,
    entity.kind == EntityKind::kPlayer ? entity.player_look : static_cast<std::uint8_t>(entity.type_id),
    static_cast<std::uint8_t>(entity.kind),
    entity.kind == EntityKind::kPlayer ? entity.player_expression : entity.loadout_instance,
    entity.position.x.value,entity.position.y.value,entity.angle.value,
    entity.health.value,entity.max_health.value,entity.collision_radius.value,
    entity.death_processed ? 1 : 0, false,false,true,
    entity.ai.enabled ? std::optional<std::uint8_t>(entity.ai.activity_flags) : std::nullopt);
  if (dense) codec.write_dense_public_groups(entity);
  if (const auto* owner = world.players().by_body(entity.handle)) {
    codec.write_mask_string_field(entity.handle,publicMask,4,owner->player_name());
    codec.write_mask_byte_field(entity.handle,publicMask,62,owner->profile().level());
    codec.write_mask_float_field(entity.handle,publicMask,59,owner->loadout().score().value);
  }
  if (entity.kind == EntityKind::kPetal) {
    codec.write_mask_byte_field(entity.handle,publicMask,11,entity.loadout_slot);
    codec.write_mask_byte_field(entity.handle,publicMask,12,entity.loadout_instance);
    const bool peas = (entity.type_id == 11 || entity.type_id == 12 || entity.type_id == 34) && entity.petal_launched;
    const auto mask = publicMask | (1U << 6) | (peas ? 1U << 4 : 0);
    if (peas) codec.write_mask_byte_field(entity.handle,mask,9,entity.petal_render_flags);
    codec.write_mask_byte_field(entity.handle,mask,50,static_cast<std::uint8_t>(entity.type_id));
  } else if (entity.kind == EntityKind::kDrop) {
    codec.write_mask_byte_field(entity.handle,publicMask,22,static_cast<std::uint8_t>(entity.type_id));
    codec.write_mask_byte_field(entity.handle,publicMask,54,entity.pickup_collected ? 1 : 0);
  } else if (entity.kind == EntityKind::kProjectile) {
    const auto ordinal = entity.has_tag_component && (entity.type_id == 29 || entity.type_id == 30) ? 12U : 18U;
    codec.write_mask_entity(entity.handle,publicMask | (1U << (ordinal-1)));
  }
  update.fields = codec.finish(); return update;
}
std::vector<std::uint8_t> identity_bytes(const EntityUpdate& update) {
  WireWriter writer; writeEntityUpdate(writer,update); return writer.payload();
}
}
std::optional<Publication> publish(const World& world, const TickChanges& changes,
    const ViewerContext& viewer, ReplicationSession& session) {
  const auto* player = world.players().get(viewer.player);
  if (!player || !viewer.sessionEpoch || viewer.sessionEpoch >= kCounterDrainAt || viewer.player.raw >= kCounterDrainAt
      || player->life_epoch >= kCounterDrainAt || world.tick() >= kCounterDrainAt || changes.serverTick != world.tick()
      || std::all_of(viewer.roomEpoch.begin(),viewer.roomEpoch.end(),[](auto b) { return b == 0; })) return {};
  auto next = session;
  if (!next.initialized) {
    next.roomEpoch = viewer.roomEpoch; next.sessionEpoch = viewer.sessionEpoch; next.player = viewer.player; next.initialized = true;
    if (player->life_epoch && player->life != PlayerLife::kAlive) {
      next.viewerPosition = player->death.position; next.viewerScale = player->death.view_scale;
    }
  } else if (next.roomEpoch != viewer.roomEpoch || next.sessionEpoch != viewer.sessionEpoch || next.player != viewer.player) return {};
  if (next.snapshotSeq + 1 >= kCounterDrainAt || next.baselineId + 1 >= kCounterDrainAt) return {};
  Snapshot snapshot; snapshot.roomEpoch = viewer.roomEpoch; snapshot.serverTick = changes.serverTick;
  snapshot.full = next.needsFull; snapshot.snapshotSeq = ++next.snapshotSeq;
  if (snapshot.full) ++next.baselineId;
  snapshot.baselineId = next.baselineId;
  const auto* body = world.entities().get(player->player());
  snapshot.controlledHandle = body ? body->handle.to_wire() : 0;
  next.controlledHandle = snapshot.controlledHandle;
  if (body && body->health.value > 0) {
    next.viewerPosition = body->position;
    bool wide = false;
    for (std::size_t i = 0; i < player->profile().active_slots(); ++i) wide |= player->loadout().slots()[i].type_id == 25;
    next.viewerScale = f32(wide ? 0.63F : 0.9F);
  }
  const auto width = f32(1920) / next.viewerScale + f32(200), height = f32(1080) / next.viewerScale + f32(200);
  const auto left = next.viewerPosition.x - width*f32(0.5F), top = next.viewerPosition.y - height*f32(0.5F);
  const Aabb view{left,top,left+width,top+height};
  const Aabb arena{world.width()*f32(-0.5F),world.height()*f32(-0.5F),world.width()*f32(0.5F),world.height()*f32(0.5F)};
  PublicationBounds bounds; bounds.begin();
  std::map<std::uint32_t,std::vector<std::uint8_t>> visible;
  bool valid = true;
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      if (!entity.active || (!body && player->life_epoch == 0)) continue;
      if (entity.handle != player->player() && (!arena.intersects(view) || !publication_body_bounds(world,entity,bounds).intersects(view))) continue;
      const auto update = project(world,entity,viewer.dense);
      if (!update) { valid = false; continue; }
      auto bytes = identity_bytes(*update);
      const auto prior = next.published.find(update->handle);
      if (snapshot.full || prior == next.published.end() || prior->second != bytes) snapshot.entities.push_back(*update);
      visible.emplace(update->handle,std::move(bytes));
    }
  });
  if (!snapshot.full) for (const auto& [handle,bytes] : next.published) {
    (void)bytes; if (!visible.contains(handle)) snapshot.removed.push_back(handle);
  }
  for (const auto& event : changes.events) {
    if (event.tick < next.eventTick || (event.tick == next.eventTick && event.ordinal <= next.eventOrdinal)) continue;
    if (event.kind == EventKind::Chat || visible.contains(event.target) || next.published.contains(event.target)
        || (event.kind == EventKind::Pickup && event.actorPlayerId == viewer.player.raw)) snapshot.events.push_back(event);
    next.eventTick = event.tick; next.eventOrdinal = event.ordinal;
  }
  auto& self = snapshot.selfState;
  self.lifeEpoch = static_cast<std::uint32_t>(player->life_epoch); self.life = static_cast<std::uint8_t>(player->life);
  self.velocityX = body ? body->velocity.x : 0; self.velocityY = body ? body->velocity.y : 0;
  self.speed = player->player_speed().value;
  self.buttons = player->input().buttons; self.angle = player->input().angle.value; self.strength = player->input().strength.value;
  self.inputNeutral = player->input().buttons == 0 && player->input().strength.value == 0;
  if (player->input_valid_until_tick >= kCounterDrainAt || player->next_spawn_tick >= kCounterDrainAt) return {};
  self.inputExpiresTick = static_cast<std::uint32_t>(player->input_valid_until_tick);
  self.nextSpawnTick = static_cast<std::uint32_t>(player->next_spawn_tick);
  snapshot.lastAppliedInputSeq = player->input_session_epoch == viewer.sessionEpoch ? player->last_applied_input_sequence : 0;
  snapshot.inputAppliedTick = player->last_control_tick == UINT64_MAX ? 0 : static_cast<std::uint32_t>(player->last_control_tick);
  self.level = player->profile().level(); self.experience = player->profile().experience().value;
  self.score = player->loadout().score().value; self.zoneProgress = player->zone_progress();
  for (std::size_t i = 0; i < self.inventory.size(); ++i) self.inventory[i] = player->loadout().slots()[i].type_id;
  self.recharge = player->loadout().recharge_progress();
  self.backpack.assign(player->profile().backpack().begin(),player->profile().backpack().begin()+player->profile().backpack_count());
  self.deathScore = player->death.score.value; self.deathLevel = player->death.level;
  self.kept.assign(player->death.kept.begin(),player->death.kept.begin()+player->death.kept_count);
  self.killerName = player->death.killer_name;
  self.cameraX = next.viewerPosition.x.value; self.cameraY = next.viewerPosition.y.value; self.cameraScale = next.viewerScale.value;
  auto bytes = encode_message(snapshot,viewer.sessionEpoch);
  if (!valid || !bytes || visible.size() > kMaxSnapshotEntities) return {};
  next.needsFull = false; next.published = std::move(visible); session = std::move(next);
  return Publication{std::move(*bytes),std::move(snapshot)};
}
} // namespace engine::net
