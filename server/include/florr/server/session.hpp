#pragma once
#include "florr/server/config.hpp"
#include "florr/server/metrics.hpp"
#include "florr/server/scheduler.hpp"
#include "engine/net/peer_session.hpp"
#include <functional>
#include <memory>

namespace florr::server {
namespace wire = engine::net;
using Bytes = std::vector<std::uint8_t>;
using ConnectionId = std::uint64_t;
using ResumeToken = std::array<std::uint8_t,32>;
struct PeerSink {
  std::function<bool(Bytes)> send;
  std::function<void(wire::ErrorCode,std::string_view)> close;
};
class Session {
 public:
  Session(ConnectionId id,const Config& config,Metrics& metrics,PeerSink sink,std::uint64_t now);
  // bind/execute/prepare are room-boundary operations. receive only reads World
  // and queues data in PeerSession; a network callback cannot mutate the World.
  void bind(engine::World& world,wire::ViewerContext identity,std::uint64_t now);
  void receive(const wire::Message& message,std::uint64_t now);
  void poll(std::uint64_t now);
  std::uint64_t next_poll() const {return outstanding_ ? pingAt_+config_.pongTimeoutMs : lastPing_+config_.pingIntervalMs;}
  void deactivate();
  void fail(wire::ErrorCode code,std::string_view reason);
  bool send(Bytes bytes);
  template<class T> bool send(const T& message) {
    auto bytes=wire::encode_message(message,epoch());
    return bytes && send(std::move(*bytes));
  }
  ConnectionId id() const {return id_;}
  bool active() const {return active_;}
  bool bound() const {return active_ && peer_!=nullptr;}
  bool leaving() const {return leaving_;}
  std::uint32_t epoch() const {return peer_ ? peer_->identity().sessionEpoch : 0;}
  wire::PeerSession* peer() {return peer_.get();}
  const wire::PeerSession* peer() const {return peer_.get();}
 private:
  bool permit(TokenBucket& bucket,std::uint64_t now);
  ConnectionId id_; const Config& config_; Metrics& metrics_; PeerSink sink_;
  const engine::World* world_=nullptr;
  std::unique_ptr<wire::PeerSession> peer_;
  bool active_=true,leaving_=false;
  TokenBucket input_,commands_,chat_,control_;
  std::uint32_t violations_=0,nonce_=0;
  std::uint64_t lastViolation_=0,lastPing_=0,pingAt_=0;
  std::optional<wire::Ping> outstanding_;
};
} // namespace florr::server
