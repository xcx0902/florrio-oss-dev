#pragma once
#include "florr/server/room.hpp"
namespace florr::server {
class RoomManager {
 public:
  RoomManager(const Config& config,Metrics& metrics,engine::WorldConfig world={.populate=true})
    :config_(config),metrics_(metrics),worldConfig_(world) {}
  void hello(std::shared_ptr<Session> session,wire::Hello hello);
  void tick(std::uint64_t now);
  void stop();
  void overloaded(bool value) {overloaded_=value;}
  bool ready() const {return !stopping_ && !overloaded_ && nextEpoch_<wire::kCounterDrainAt;}
  const Room* find(std::string_view name) const;
 private:
  struct Admission {std::shared_ptr<Session> session;wire::Hello hello;};
  const Config& config_;Metrics& metrics_;engine::WorldConfig worldConfig_;
  std::map<std::string,std::unique_ptr<Room>,std::less<>> rooms_;
  std::map<ConnectionId,Admission> pending_;
  std::uint32_t nextEpoch_=1;
  bool stopping_=false,overloaded_=false;
};
} // namespace florr::server
