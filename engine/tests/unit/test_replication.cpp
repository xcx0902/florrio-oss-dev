#include "../support/multiplayer.hpp"
#include "engine/net/peer_session.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/loot.hpp"
#include <iostream>
#include <cstdlib>
using namespace engine;
using namespace engine::net;
#define CHECK(x) do { if (!(x)) { std::cerr << __func__ << ':' << __LINE__ << ": " #x "\n"; std::exit(1); } } while (false)
namespace {
ViewerContext viewer(PlayerId id,unsigned epoch=7) { RoomEpoch room{}; room[0]=1; return {id,room,epoch}; }
Publication snapshot(const World& w, const TickChanges& changes,ViewerContext v,net::ReplicationSession& s) {
  auto p=publish(w,changes,v,s); CHECK(p); CHECK(decode_message(p->bytes,false));
  CHECK(decode_message(p->leaderboardBytes,false)); return std::move(*p);
}
bool has(const Publication& p, EntityHandle h) { return std::any_of(p.snapshot.entities.begin(),p.snapshot.entities.end(),[&](const auto& e){return e.handle==h.to_wire();}); }
std::vector<std::uint8_t> digest(const World& w) {
  ByteWriter out; out.write_u32_le(static_cast<std::uint32_t>(w.tick())); out.write_u32_le(w.random().state()); out.write_u32_le(w.rng().state());
  for(const auto& e:w.entities().active_entities()) {out.write_u32_le(e.handle.raw); out.write_f32_le(e.health.value); out.write_f32_le(e.position.x.value); out.write_f32_le(e.position.y.value);}
  for(const auto& e:w.hit_events()) {out.write_u32_le(e.target.raw);out.write_f32_le(e.amount.value);}
  for(const auto h:w.destroyed())out.write_u32_le(h.raw);
  w.players().for_each([&](const PlayerState& p){out.write_f32_le(p.profile().experience().value);out.write_u32_le(p.loadout().pickup_transfers().size());});
  return out.bytes();
}
void two_viewers_receive_same_tick_events() {
  auto w=test::make_world(); auto a=test::join_player(*w,"Alice",{f32(-200),{}}),b=test::join_player(*w,"Bob",{f32(200),{}});
  net::ReplicationSession sa,sb;
  const auto mob=spawn_entity(*w,EntityKind::kMob,1,{},f32(10));
  auto initial=freeze_tick_changes(*w); CHECK(initial); (void)snapshot(*w,*initial,viewer(a),sa); (void)snapshot(*w,*initial,viewer(b),sb); finish_tick_changes(*w);
  w->record_hit(w->players().get(a)->player(),w->players().get(b)->player(),f32(3),f32(97));
  w->players().get(a)->loadout().record_pickup_transfer(mob,5); CHECK(w->destroy(mob));
  CHECK(w->destroy(w->players().get(b)->petals().front().handle));
  const auto frozen=freeze_tick_changes(*w); CHECK(frozen); const auto before=digest(*w);
  auto sa2=sa,sb2=sb;
  const auto ab=snapshot(*w,*frozen,viewer(a),sa),bb=snapshot(*w,*frozen,viewer(b),sb);
  const auto ba=snapshot(*w,*frozen,viewer(b),sb2),aa=snapshot(*w,*frozen,viewer(a),sa2);
  CHECK(ab.bytes==aa.bytes && bb.bytes==ba.bytes && before==digest(*w));
  CHECK(ab.snapshot.events.size()==2 && bb.snapshot.events.size()==2);
  CHECK(ab.snapshot.removed==bb.snapshot.removed && !ab.snapshot.removed.empty());
  CHECK(w->hit_events().size()==1 && !w->destroyed().empty());
  finish_tick_changes(*w); CHECK(w->hit_events().empty() && w->destroyed().empty() && w->players().get(a)->loadout().pickup_transfers().empty());
  // Frozen values and encoded buffers survive cleanup; a repeated publish cannot replay events.
  CHECK(frozen->events.size()==2 && decode_message(ab.bytes,false));
  CHECK(snapshot(*w,*frozen,viewer(a),sa).snapshot.events.empty());
}
void aoi_exit_reentry_and_handle_generation() {
  auto w=test::make_world(); w->set_dimensions(f32(20000),f32(20000));
  const auto a=test::join_player(*w,"A",{f32(-4000),{}}),b=test::join_player(*w,"B",{f32(4000),{}});
  const auto mob=spawn_entity(*w,EntityKind::kMob,1,{f32(-4000),{}},f32(10)); net::ReplicationSession sa,sb;
  auto changes=*freeze_tick_changes(*w);
  CHECK(has(snapshot(*w,changes,viewer(a),sa),mob)); CHECK(!has(snapshot(*w,changes,viewer(b),sb),mob));
  w->entities().get(mob)->position.x=f32(4000); changes=*freeze_tick_changes(*w);
  const auto exit=snapshot(*w,changes,viewer(a),sa); CHECK(exit.snapshot.removed==std::vector<std::uint32_t>{mob.to_wire()});
  CHECK(has(snapshot(*w,changes,viewer(b),sb),mob));
  w->entities().get(mob)->position.x=f32(-4000); CHECK(has(snapshot(*w,changes,viewer(a),sa),mob));
  const auto prototype=*w->entities().get(mob); CHECK(w->destroy(mob)); EntityHandle replacement;
  for(unsigned i=0;i<kEntitySlotCount;i++) {
    const auto allocated=w->entities().allocate(); CHECK(allocated);
    if(allocated->index()!=mob.index()) continue;
    replacement=*allocated; auto* entity=w->entities().get(replacement);
    *entity=prototype; entity->handle=replacement; break;
  }
  CHECK(replacement.valid() && replacement.generation()!=mob.generation()); changes=*freeze_tick_changes(*w);
  const auto removed=snapshot(*w,changes,viewer(a),sa); CHECK(std::find(removed.snapshot.removed.begin(),removed.snapshot.removed.end(),mob.to_wire())!=removed.snapshot.removed.end());
  CHECK(has(removed,replacement) && !sa.published.contains(mob.to_wire()) && sa.published.contains(replacement.to_wire()));
}
void public_and_self_are_separate_in_both_encodings() {
  auto w=test::make_world(); auto a=test::join_player(*w,"Alice",{f32(-200),{}}),b=test::join_player(*w,"Bob",{f32(200),{}});
  auto* pa=w->players().get(a); auto* pb=w->players().get(b); pa->profile().set_level(5); pb->profile().set_level(9);
  pa->profile().set_experience(f32(123)); pb->profile().set_experience(f32(456));
  pa->loadout().slots()[8].type_id=38; pb->loadout().slots()[8].type_id=2;
  for(bool dense:{false,true}) {
    net::ReplicationSession sa,sb; auto va=viewer(a),vb=viewer(b); va.dense=vb.dense=dense;
    const auto changes=*freeze_tick_changes(*w); const auto p=snapshot(*w,changes,va,sa),q=snapshot(*w,changes,vb,sb);
    CHECK(p.snapshot.selfState.experience==123 && q.snapshot.selfState.experience==456);
    CHECK(p.snapshot.selfState.inventory[8]==38 && q.snapshot.selfState.inventory[8]==2);
    const auto publicB=std::find_if(p.snapshot.entities.begin(),p.snapshot.entities.end(),[&](const auto& e){return e.handle==pb->player().to_wire();});
    CHECK(publicB!=p.snapshot.entities.end() && publicB->ownerPlayerId==b.raw && validate_public_entity(publicB->fields,publicB->handle));
    SnapshotEncoder malicious; malicious.begin(1); malicious.write_mask_loadout_fields(pb->player(),0,{},{});
    CHECK(!validate_public_entity(malicious.finish(),pb->player().to_wire()));
  }
}
void death_camera_respawn_and_full_resync() {
  auto w=test::make_world(); auto a=test::join_player(*w,"Alice",{f32(-200),{}}),b=test::join_player(*w,"Bob",{f32(200),{}});
  net::ReplicationSession s; const auto va=viewer(a); (void)snapshot(*w,*freeze_tick_changes(*w),va,s); const auto old=w->players().get(a)->player();
  kill_entity(*w,old,w->players().get(b)->player()); const auto dead=snapshot(*w,*freeze_tick_changes(*w),va,s);
  CHECK(dead.snapshot.selfState.cameraX==-200 && dead.snapshot.selfState.killerName=="Bob");
  CHECK(w->destroy(old)); const auto absent=snapshot(*w,*freeze_tick_changes(*w),va,s); CHECK(absent.snapshot.controlledHandle==0 && absent.snapshot.selfState.cameraX==-200);
  finish_tick_changes(*w); const auto experience=w->players().get(b)->profile().experience();
  s.request_full(); const auto full=snapshot(*w,*freeze_tick_changes(*w),va,s);
  CHECK(full.snapshot.full && full.snapshot.baselineId==2 && full.snapshot.selfState.killerName=="Bob" && full.snapshot.events.empty());
  net::ReplicationSession deadReconnect;
  const auto resumedDead=snapshot(*w,*freeze_tick_changes(*w),viewer(a,8),deadReconnect);
  CHECK(resumedDead.snapshot.selfState.cameraX==-200 && resumedDead.snapshot.selfState.killerName=="Bob" && resumedDead.snapshot.controlledHandle==0);
  CHECK(w->players().get(b)->profile().experience()==experience);
  test::advance_ticks(*w,50); CHECK(spawn_registered_player(*w,a,1,"Alice").valid());
  const auto reborn=snapshot(*w,*freeze_tick_changes(*w),va,s); CHECK(reborn.snapshot.controlledHandle && reborn.snapshot.controlledHandle!=old.to_wire() && reborn.snapshot.selfState.lifeEpoch==2);
  net::ReplicationSession reconnect; const auto fresh=snapshot(*w,*freeze_tick_changes(*w),viewer(a,8),reconnect); CHECK(fresh.snapshot.full && fresh.snapshot.baselineId==1);
  CHECK(!publish(*w,*freeze_tick_changes(*w),viewer(a,8),s));
  auto wrongRoom=va; wrongRoom.roomEpoch[1]=1; CHECK(!publish(*w,*freeze_tick_changes(*w),wrongRoom,s));
}
void overflow_resync_and_slow_consumer() {
  auto w=test::make_world(); const auto id=test::join_player(*w,"A",{}); PeerSession peer(*w,viewer(id));
  (void)snapshot(*w,*freeze_tick_changes(*w),viewer(id),peer.replication);
  CHECK(!peer.accept_resync({2,1,ResyncReason::Gap},7)); CHECK(!peer.accept_resync({1,1,ResyncReason::Gap},6));
  CHECK(peer.accept_resync({1,1,ResyncReason::Gap},7)); CHECK(snapshot(*w,*freeze_tick_changes(*w),viewer(id),peer.replication).snapshot.full);
  peer.replication.snapshotSeq=kCounterDrainAt-1; const auto original=peer.replication;
  CHECK(!publish(*w,*freeze_tick_changes(*w),viewer(id),peer.replication)); CHECK(peer.replication.snapshotSeq==original.snapshotSeq);
  std::vector<ChatRecord> chats(kMaxSnapshotEvents+1,ChatRecord{id,"x"}); CHECK(!freeze_tick_changes(*w,chats));
  SnapshotWriteQueue queue; CHECK(queue.enqueue(std::vector<std::uint8_t>(kMaxQueuedWriteBytes))); CHECK(queue.bytes()==kMaxQueuedWriteBytes);
  CHECK(!queue.enqueue({1}) && queue.closed() && queue.bytes()==kMaxQueuedWriteBytes); CHECK(queue.front()->size()==kMaxQueuedWriteBytes);
  queue.complete_write(); CHECK(queue.bytes()==0 && !queue.enqueue({1}));
}
void oversized_full_snapshot_fails_without_committing_session() {
  auto w=test::make_world(); const auto id=test::join_player(*w,"A",{});
  while(w->entities().allocate()) {}
  net::ReplicationSession session;
  const auto changes=freeze_tick_changes(*w); CHECK(changes);
  CHECK(!publish(*w,*changes,viewer(id),session));
  CHECK(!session.initialized && session.snapshotSeq==0 && session.published.empty());
}
void leaderboard_is_room_wide_and_tracks_scores_and_departures() {
  auto w=test::make_world(); w->set_dimensions(f32(20000),f32(20000));
  const auto a=test::join_player(*w,"Alice",{f32(-4000),{}}), b=test::join_player(*w,"Bob",{f32(4000),{}});
  w->players().get(a)->loadout().set_score(f32(10)); w->players().get(b)->loadout().set_score(f32(25));
  net::ReplicationSession sa,sb; const auto changes=*freeze_tick_changes(*w); const auto before=digest(*w);
  const auto pa=snapshot(*w,changes,viewer(a),sa), pb=snapshot(*w,changes,viewer(b),sb);
  CHECK(!has(pa,w->players().get(b)->player()) && !has(pb,w->players().get(a)->player()));
  CHECK(pa.leaderboardBytes==pb.leaderboardBytes && digest(*w)==before);
  const auto leaderboard=std::get<Leaderboard>(decode_message(pa.leaderboardBytes,false)->value);
  CHECK(leaderboard.entries.size()==2 && leaderboard.roomEpoch==viewer(a).roomEpoch);
  CHECK(leaderboard.entries[0].playerId==a.raw && leaderboard.entries[0].nickname=="Alice" && leaderboard.entries[0].score==10);
  CHECK(leaderboard.entries[1].playerId==b.raw && leaderboard.entries[1].nickname=="Bob" && leaderboard.entries[1].score==25);
  w->players().get(b)->loadout().set_score(f32(50));
  const auto updated=snapshot(*w,*freeze_tick_changes(*w),viewer(a),sa);
  CHECK(std::get<Leaderboard>(decode_message(updated.leaderboardBytes,false)->value).entries[1].score==50);
  CHECK(leave_player(*w,b));
  const auto departed=snapshot(*w,*freeze_tick_changes(*w),viewer(a),sa);
  CHECK(std::get<Leaderboard>(decode_message(departed.leaderboardBytes,false)->value).entries.size()==1);
}
void newborn_drops_spin_but_old_aoi_reentry_and_resync_stay_settled() {
  for(bool dense:{false,true}) {
    auto w=test::make_world(); const auto a=test::join_player(*w,"Alice",{});
    const auto old=spawn_loot_drop(*w,7,{f32(5000),{}},{});
    test::advance_ticks(*w,3);
    net::ReplicationSession session; auto view=viewer(a); view.dense=dense;
    (void)snapshot(*w,*freeze_tick_changes(*w),view,session);
    w->entities().get(old)->set_position({f32(50),{}});
    const auto fresh=spawn_loot_drop(*w,7,{f32(100),{}},{});
    const auto published=snapshot(*w,*freeze_tick_changes(*w),view,session);
    const auto arriving=[&](const Publication& p,EntityHandle h) {
      const auto it=std::find_if(p.snapshot.entities.begin(),p.snapshot.entities.end(),[&](const auto& e){return e.handle==h.to_wire();});
      CHECK(it!=p.snapshot.entities.end()); ByteReader reader(it->fields);
      CHECK(read_snapshot_header(reader));
      (void)reader.read_varint32(); (void)reader.read_varint32(); (void)reader.read_varint32();
      CHECK(reader.read_u32_le()==h.to_wire()); const auto flags=reader.read_u8();
      CHECK(flags); return (*flags^54)==129;
    };
    CHECK(arriving(published,fresh) && !arriving(published,old));
    test::advance_ticks(*w,3); session.request_full();
    const auto full=snapshot(*w,*freeze_tick_changes(*w),view,session);
    CHECK(!arriving(full,fresh) && !arriving(full,old));
  }
}
}
int main() {
  two_viewers_receive_same_tick_events(); aoi_exit_reentry_and_handle_generation(); public_and_self_are_separate_in_both_encodings();
  death_camera_respawn_and_full_resync(); overflow_resync_and_slow_consumer(); oversized_full_snapshot_fails_without_committing_session();
  leaderboard_is_room_wide_and_tracks_scores_and_departures(); newborn_drops_spin_but_old_aoi_reentry_and_resync_stay_settled();
  std::cout<<"8 replication scenarios passed\n";
}
