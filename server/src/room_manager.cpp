#include "florr/server/room_manager.hpp"
namespace florr::server {
void RoomManager::hello(std::shared_ptr<Session> session,wire::Hello hello) {
  if(!ready()) {session->fail(wire::ErrorCode::Stopping,"NOT_READY");return;}
  if(auto error=wire::validate_hello(hello)) {session->fail(*error,"HELLO_REJECTED");return;}
  if(pending_.size()>=config_.maxPendingHandshakes || pending_.contains(session->id())) {session->fail(wire::ErrorCode::Protocol,"HELLO_STATE");return;}
  const auto id=session->id();pending_.emplace(id,Admission{std::move(session),std::move(hello)});
}
void RoomManager::tick(std::uint64_t now) {
  for(auto& [name,room]:rooms_) {(void)name;room->begin_tick();}
  auto pending=std::move(pending_);pending_.clear();
  for(auto& [id,admission]:pending) {
    (void)id;auto session=admission.session;if(!session->active())continue;
    if(!ready()) {session->fail(wire::ErrorCode::Stopping,"NOT_READY");continue;}
    auto found=rooms_.find(admission.hello.roomId);
    if(found==rooms_.end()) {
      if(admission.hello.resumeToken) {session->fail(wire::ErrorCode::Session,"RESUME_REJECTED");continue;}
      if(rooms_.size()>=config_.maxRooms) {session->fail(wire::ErrorCode::RoomFull,"ROOM_LIMIT");continue;}
      auto room=std::make_unique<Room>(admission.hello.roomId,config_,metrics_,worldConfig_);
      found=rooms_.emplace(admission.hello.roomId,std::move(room)).first;++metrics_.rooms;
    }
    found->second->admit(session,admission.hello,nextEpoch_++,now);
  }
  for(auto it=rooms_.begin();it!=rooms_.end();) {
    const auto exhausted=it->second->exhausted();
    if(exhausted)it->second->stop(wire::ErrorCode::EpochExhausted);
    else it->second->tick();
    if(it->second->expired() || exhausted) {it=rooms_.erase(it);--metrics_.rooms;}
    else ++it;
  }
}
void RoomManager::stop() {
  if(stopping_)return;
  stopping_=true;
  for(auto& [id,admission]:pending_) {(void)id;admission.session->fail(wire::ErrorCode::Stopping,"STOPPING");}
  pending_.clear();
  for(auto& [name,room]:rooms_) {(void)name;room->stop();}
  rooms_.clear();metrics_.rooms=0;
}
const Room* RoomManager::find(std::string_view name) const {auto it=rooms_.find(name);return it==rooms_.end()?nullptr:it->second.get();}
} // namespace florr::server
