#pragma once
#include "florr/server/session.hpp"
#include "engine/model/world_config.hpp"
#include <map>

namespace florr::server {
void secure_random(std::span<std::uint8_t> bytes);
bool token_equal(const ResumeToken& a,const ResumeToken& b);
class Room {
 public:
  Room(std::string id,const Config& config,Metrics& metrics,engine::WorldConfig world={.populate=true});
  void admit(const std::shared_ptr<Session>& session,const wire::Hello& hello,std::uint32_t epoch,std::uint64_t now);
  void tick();
  void begin_tick();
  void stop(wire::ErrorCode code=wire::ErrorCode::Stopping);
  bool expired() const;
  bool exhausted() const;
  std::size_t size() const {return members_.size();}
  const engine::World& world() const {return *world_;}
  const wire::RoomEpoch& epoch() const {return epoch_;}
 private:
  struct Member {
    engine::PlayerId player;
    ResumeToken token;
    std::shared_ptr<Session> session;
    std::optional<std::uint64_t> disconnected;
  };
  void detach(Member& member);
  std::string id_; const Config& config_; Metrics& metrics_;
  wire::RoomEpoch epoch_{};
  std::unique_ptr<engine::World> world_;
  std::map<std::uint32_t,Member> members_;
  std::optional<std::uint64_t> emptySince_;
  std::uint32_t lastPlayerId_=0;
};
} // namespace florr::server
