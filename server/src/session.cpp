#include "florr/server/session.hpp"

namespace florr::server {
Session::Session(ConnectionId id,const Config& c,Metrics& m,PeerSink sink,std::uint64_t now)
  :id_(id),config_(c),metrics_(m),sink_(std::move(sink)),
   input_(c.inputRatePerSecond,c.inputBurst,now),commands_(c.commandRatePerSecond,c.commandBurst,now),
   chat_(c.chatRatePerSecond,c.chatBurst,now),control_(c.commandRatePerSecond,c.commandBurst,now) {}
void Session::bind(engine::World& world,wire::ViewerContext identity,std::uint64_t now) {
  if(!active_ || peer_) return;
  world_=&world;peer_=std::make_unique<wire::PeerSession>(world,identity);lastPing_=now;
}
void Session::deactivate() {active_=false;if(peer_)peer_->invalidate();}
void Session::fail(wire::ErrorCode code,std::string_view reason) {
  if(!active_)return;
  deactivate();sink_.close(code,reason);
}
bool Session::send(Bytes bytes) {return active_ && sink_.send(std::move(bytes));}
bool Session::permit(TokenBucket& bucket,std::uint64_t now) {
  if(bucket.consume(now))return true;
  ++metrics_.rateRejected;
  if(now-lastViolation_>1000)violations_=0;
  lastViolation_=now;
  if(++violations_>=3)fail(wire::ErrorCode::Protocol,"RATE_LIMIT");
  return false;
}
void Session::receive(const wire::Message& message,std::uint64_t now) {
  if(!active_ || leaving_)return;
  if(!bound() || message.sessionEpoch!=epoch()) {fail(wire::ErrorCode::Session,"SESSION");return;}
  if(const auto* input=std::get_if<wire::Input>(&message.value)) {
    if(!permit(input_,now))return;
    const auto result=peer_->receive_input(*world_,*input,message.sessionEpoch);
    // A late life/input is routine after death; malformed values were rejected
    // transactionally by the decoder. Sequence violations are terminal.
    if(result==wire::ResultCode::InvalidSequence)fail(wire::ErrorCode::Session,"INPUT_SEQUENCE");
  } else if(const auto* command=std::get_if<wire::Command>(&message.value)) {
    if(!permit(commands_,now) || (command->kind==wire::CommandKind::Chat && !permit(chat_,now)))return;
    const auto receipt=peer_->queue_command(*world_,*command,message.sessionEpoch);
    if(receipt.result)(void)send(*receipt.result);
    else if(receipt.code!=wire::ResultCode::Ok && receipt.code!=wire::ResultCode::Duplicate)
      (void)send(wire::CommandResult{command->commandSeq,receipt.code,{}});
    if(receipt.code==wire::ResultCode::Ok && command->kind==wire::CommandKind::Leave)leaving_=true;
  } else if(const auto* resync=std::get_if<wire::ResyncRequest>(&message.value)) {
    if(permit(control_,now) && !peer_->accept_resync(*resync,message.sessionEpoch))fail(wire::ErrorCode::Session,"RESYNC");
  } else if(const auto* ping=std::get_if<wire::Ping>(&message.value)) {
    if(permit(control_,now))(void)send(wire::Pong{ping->nonce,static_cast<std::uint32_t>(world_->tick()),ping->monotonicMs,static_cast<double>(now),world_->time_ms()});
  } else if(const auto* pong=std::get_if<wire::Pong>(&message.value)) {
    if(!permit(control_,now))return;
    if(outstanding_ && pong->nonce==outstanding_->nonce && pong->serverTick==outstanding_->serverTick
        && pong->monotonicMs==outstanding_->monotonicMs)outstanding_.reset();
  } else fail(wire::ErrorCode::Protocol,"MESSAGE_STATE");
}
void Session::poll(std::uint64_t now) {
  if(!bound() || leaving_)return;
  if(outstanding_) {
    if(now-pingAt_>=config_.pongTimeoutMs)fail(wire::ErrorCode::Session,"PONG_TIMEOUT");
    return;
  }
  if(now-lastPing_>=config_.pingIntervalMs) {
    if(nonce_+1>=wire::kCounterDrainAt) {fail(wire::ErrorCode::EpochExhausted,"EPOCH_EXHAUSTED");return;}
    outstanding_=wire::Ping{++nonce_,static_cast<std::uint32_t>(world_->tick()),static_cast<double>(now)};
    lastPing_=pingAt_=now;(void)send(*outstanding_);
  }
}
} // namespace florr::server
