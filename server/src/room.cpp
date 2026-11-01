#include "florr/server/room.hpp"
#include <algorithm>

namespace florr::server {
Room::Room(std::string id,const Config& c,Metrics& m,engine::WorldConfig config)
  :id_(std::move(id)),config_(c),metrics_(m),world_(std::make_unique<engine::World>()) {
  do {secure_random(epoch_);} while(std::all_of(epoch_.begin(),epoch_.end(),[](auto n){return n==0;}));
  engine::initialize_world(*world_,config);
}
void Room::detach(Member& member) {
  if(!member.session)return;
  member.session->deactivate();member.session.reset();member.disconnected=world_->tick();
  if(auto* player=world_->players().get(member.player))player->input_session_epoch=0;
}
void Room::admit(const std::shared_ptr<Session>& session,const wire::Hello& hello,std::uint32_t epoch,std::uint64_t now) {
  if(!session->active())return;
  if(exhausted()) {session->fail(wire::ErrorCode::EpochExhausted,"EPOCH_EXHAUSTED");return;}
  // Observe connection loss before testing grace, including a loss immediately
  // before this tick. Token comparison never stops at the first differing byte.
  for(auto& [id,member]:members_) { (void)id;if(member.session && !member.session->active())detach(member); }
  Member* member=nullptr;
  if(hello.resumeToken) {
    for(auto& [id,candidate]:members_) {
      (void)id;
      if(token_equal(candidate.token,*hello.resumeToken) && (!candidate.disconnected
          || world_->tick()-*candidate.disconnected<config_.reconnectGraceTicks))member=&candidate;
    }
    if(!member) {session->fail(wire::ErrorCode::Session,"RESUME_REJECTED");return;}
    if(member->session) {
      member->session->fail(wire::ErrorCode::Session,"SESSION_REPLACED");detach(*member);
    }
    ++metrics_.resumes;
  } else {
    if(members_.size()>=config_.initialMaxPlayersPerRoom) {session->fail(wire::ErrorCode::RoomFull,"ROOM_FULL");return;}
    const auto id=engine::register_player(*world_,hello.nickname);
    if(!id.valid() || id.raw>=wire::kCounterDrainAt) {session->fail(wire::ErrorCode::EpochExhausted,"EPOCH_EXHAUSTED");return;}
    member=&members_.emplace(id.raw,Member{id,{},nullptr,{}}).first->second;
    lastPlayerId_=static_cast<std::uint32_t>(id.raw);
    ++metrics_.players;++metrics_.joins;
  }
  ResumeToken token{};secure_random(token);member->token=token;
  member->session=session;member->disconnected.reset();emptySince_.reset();
  session->bind(*world_,{member->player,epoch_,epoch},now);
  (void)session->send(wire::Welcome{id_,epoch_,static_cast<std::uint32_t>(member->player.raw),epoch,50,static_cast<std::uint32_t>(world_->tick()),token});
}
void Room::begin_tick() {
  // Expire reservations before admissions so a slot becomes available on the
  // exact grace boundary, including when a new Hello is pending on that tick.
  for(auto it=members_.begin();it!=members_.end();) {
    auto& member=it->second;
    if(member.session && !member.session->active())detach(member);
    if(member.disconnected && world_->tick()-*member.disconnected>=config_.reconnectGraceTicks) {
      (void)engine::leave_player(*world_,member.player);--metrics_.players;++metrics_.leaves;
      it=members_.erase(it);continue;
    }
    ++it;
  }
}
void Room::tick() {
  std::vector<wire::ChatRecord> chats;
  // Ordered PlayerId traversal: finish commands for every player before
  // adopting any input or advancing the shared World once.
  for(auto& [id,member]:members_) {
    (void)id;
    if(member.session && member.session->active()) {
      auto session=member.session;
      for(const auto& result:session->peer()->execute_commands(*world_,chats))(void)session->send(result);
      if(session->peer()->leave_requested()) {session->fail(wire::ErrorCode::Session,"LEFT");detach(member);}
    }
  }
  for(auto& [id,member]:members_) {
    (void)id;if(member.session && member.session->active())member.session->peer()->prepare_tick(*world_);
  }
  engine::advance_world(*world_);++metrics_.ticks;
  const auto changes=wire::freeze_tick_changes(*world_,chats);
  for(auto& [id,member]:members_) {
    (void)id;if(!member.session || !member.session->active())continue;
    auto session=member.session;
    if(!changes) {session->fail(wire::ErrorCode::SnapshotTooLarge,"EVENT_LIMIT");continue;}
    auto* peer=session->peer();
    const auto publication=wire::publish(*world_,*changes,peer->identity(),peer->replication);
    if(!publication)session->fail(wire::ErrorCode::SnapshotTooLarge,"SNAPSHOT_LIMIT");
    else (void)session->send(publication->bytes);
  }
  wire::finish_tick_changes(*world_);
  if(members_.empty() && !emptySince_)emptySince_=world_->tick();
}
void Room::stop(wire::ErrorCode code) {
  for(auto& [id,member]:members_) {
    (void)id;if(member.session)member.session->fail(code,code==wire::ErrorCode::EpochExhausted?"EPOCH_EXHAUSTED":"STOPPING");
    (void)engine::leave_player(*world_,member.player);--metrics_.players;
  }
  members_.clear();
}
bool Room::expired() const {return emptySince_ && world_->tick()-*emptySince_>=config_.emptyRoomTtlTicks;}
bool Room::exhausted() const {
  // Reserve enough room for every advertised tick deadline before reaching u32.
  const auto reserve=std::max({config_.emptyRoomTtlTicks,config_.reconnectGraceTicks,config_.spawnCooldownTicks});
  if(world_->tick()+reserve+1>=wire::kCounterDrainAt || lastPlayerId_+config_.initialMaxPlayersPerRoom+1>=wire::kCounterDrainAt)return true;
  for(const auto& [id,member]:members_) {
    (void)id;
    if(const auto* player=world_->players().get(member.player);player && player->life_epoch+2>=wire::kCounterDrainAt)return true;
    if(member.session) {
      const auto& replication=member.session->peer()->replication;
      if(replication.snapshotSeq+2>=wire::kCounterDrainAt || replication.baselineId+2>=wire::kCounterDrainAt)return true;
    }
  }
  return false;
}
} // namespace florr::server
