#include "app/garden_session.hpp"

#include <algorithm>
#include <limits>

namespace wave::app {

GardenSession::GardenSession(Garden& garden, std::uint64_t connection)
    : garden_(garden), connection_(connection) {}

GardenSession::~GardenSession() {
  if (member_) {
    garden_.disconnect(member_->token, connection_);
  }
}

Reply GardenSession::reject() {
  if (member_) {
    garden_.disconnect(member_->token, connection_);
  }
  closed_ = true;
  return {{wire_.disconnect()}, true};
}

wire::Bytes GardenSession::snapshot() {
  if (last_tick_ == std::numeric_limits<std::uint32_t>::max()) {
    throw std::runtime_error("Garden wire tick exhausted");
  }
  const auto frame = projection_.build(garden_, *member_);
  sent_lives_.emplace(++last_tick_, frame.control);
  while (sent_lives_.size() > 256) {
    sent_lives_.erase(sent_lives_.begin());
  }
  return wire_.snapshot(last_tick_, acknowledged_, frame.records, frame.removed, frame.commands);
}

Reply GardenSession::publish() {
  if (closed_ || !member_) {
    return {};
  }
  if (!garden_.active(member_->token, connection_)) {
    return reject();
  }
  return {{snapshot()}};
}

Reply GardenSession::receive(wire::Bytes bytes) {
  if (closed_) {
    return {{}, true};
  }
  if (!greeted_) {
    const auto guest = wire::hello_guest(bytes);
    if (!guest) {
      return reject();
    }
    requested_guest_ = *guest;
    greeted_ = true;
    return {{wire_.world(++last_tick_, 0)}};
  }
  if (member_ && !garden_.active(member_->token, connection_)) {
    return reject();
  }
  const auto command = wire_.receive(std::move(bytes));
  if (!command) {
    return reject();
  }
  if (const auto* ack = std::get_if<wire::WorldAck>(&*command)) {
    if (ack->tick > last_tick_) {
      return reject();
    }
    if (ack->tick >= last_ack_) {
      last_ack_ = ack->tick;
      if (const auto sent = sent_lives_.find(ack->tick); sent != sent_lives_.end()) {
        acknowledged_life_ = sent->second;
        sent_lives_.erase(sent_lives_.begin(), sent);
      }
    }
    return {};
  }
  const auto& batch = std::get<wire::Startup>(*command);
  if (batch.first_sequence > acknowledged_ + 1) {
    return reject();
  }
  if (batch.last_sequence <= acknowledged_) {
    return member_ ? publish() : reject();
  }
  Reply reply;
  for (const auto& request : batch.requests) {
    if (request.sequence <= acknowledged_) {
      continue;
    }
    if (const auto* identity = std::get_if<wire::Identify>(&request.action)) {
      if (member_) {
        return reject();
      }
      member_ = &garden_.admit(requested_guest_, connection_);
      reply.frames.push_back(wire_.guest_id(member_->token));
    } else if (member_) {
      // A reliable sequence is consumed exactly once, including a denied action.
      // Life bindings come from ACKs earlier on this ordered WebSocket stream.
      garden_.command(*member_, request.action, acknowledged_life_);
    } else if (!std::holds_alternative<std::monostate>(request.action)) {
      return reject();
    }
    acknowledged_ = request.sequence;
  }
  if (!member_) {
    return reject();
  }
  const bool initial = !reply.frames.empty();
  reply.frames.push_back(snapshot());
  if (initial) {
    for (int i = 0; i < 2; ++i) {
      reply.frames.push_back(snapshot());
    }
  }
  return reply;
}

}  // namespace wave::app
