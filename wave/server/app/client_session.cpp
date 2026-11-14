#include "app/client_session.hpp"

#include <algorithm>
#include <limits>

namespace wave::app {

ClientSession::ClientSession(RoomManager& rooms, std::uint64_t connection, sim::Biome biome)
    : rooms_(rooms), biome_(biome), connection_(connection) {}

ClientSession::~ClientSession() {
  if (member_) {
    rooms_.disconnect(member_->token, connection_);
  }
}

Reply ClientSession::reject() {
  if (member_) {
    rooms_.disconnect(member_->token, connection_);
  }
  closed_ = true;
  return {{wire_.disconnect()}, true};
}

Reply ClientSession::superseded() {
  closed_ = true;
  return {{}, true, CloseReason::superseded};
}

wire::Bytes ClientSession::snapshot() {
  const auto* room = rooms_.room(*member_);
  const auto match = room && room->match ? room->match->id().value : 0;
  if (match_ && match != match_) {
    // Abandon sets the native UI's local exit latch. Entity removals do not
    // clear it; a new wire epoch invokes $587 and resets the entire old world.
    wire_.next_world();
    projection_ = {};
    pending_.clear();
    received_ = acknowledged_ = last_ack_ = 0;
    sent_lives_.clear();
    acknowledged_life_.reset();
    identified_ = false;
  }
  match_ = match;
  if (last_tick_ == std::numeric_limits<std::uint32_t>::max()) {
    throw std::runtime_error("Client protocol tick exhausted");
  }
  auto frame = projection_.build(rooms_, *member_);
  const auto integer = [&](std::uint64_t value) {
    do {
      frame.commands.push_back((value & 127) | (value > 127 ? 128 : 0));
      value >>= 7;
    } while (value);
  };
  for (const auto& [sequence, result] : member_->craft_results) {
    if (sequence <= craft_cursor_) {
      continue;
    }
    integer(1);
    integer(35);
    integer(result.code == store::Code::ok && result.craft.successes != 0);
    integer(result.craft.successes);
    integer(result.craft.returned);
    craft_cursor_ = sequence;
  }
  sent_lives_.emplace(++last_tick_, frame.control);
  while (sent_lives_.size() > 256) {
    sent_lives_.erase(sent_lives_.begin());
  }
  return wire_.snapshot(last_tick_, acknowledged_, frame.records, frame.removed, frame.commands);
}

Reply ClientSession::publish() {
  if (closed_ || !member_) {
    return {};
  }
  if (!rooms_.active(member_->token, connection_)) {
    return superseded();
  }
  auto reply = drain();
  if (!reply.close) {
    reply.frames.push_back(snapshot());
  }
  return reply;
}

Reply ClientSession::drain() {
  rooms_.poll_storage();
  Reply reply;
  while (!pending_.empty()) {
    const auto& queued = pending_.front();
    const auto& request = queued.request;
    if (std::holds_alternative<wire::Identify>(request.action)) {
      if (identified_) {
        return reject();
      }
      if (!member_) {
        member_ = &rooms_.admit(requested_guest_, connection_, biome_);
        craft_cursor_ = member_->craft_sequence;
        reply.frames.push_back(wire_.guest_id(member_->token));
      }
      identified_ = true;
    } else if (member_) {
      const bool economic = std::holds_alternative<wire::Craft>(request.action) ||
                            std::holds_alternative<wire::Equip>(request.action) ||
                            std::holds_alternative<wire::Swap>(request.action);
      if (economic && rooms_.storage() &&
          rooms_.storage_pending() >= RoomManager::storage_capacity) {
        break;
      }
      const bool accepted =
          rooms_.command(*member_, request.action, queued.life,
                         std::to_string(connection_) + ":" + std::to_string(wire_.epoch()) + ":" +
                             std::to_string(request.sequence));
      if (!accepted && economic && rooms_.storage() &&
          rooms_.storage_pending() >= RoomManager::storage_capacity) {
        break;
      }
      // No native error enum has been recovered for denied economic actions.
      // Close the session so a fresh admission can restore committed state.
      if (!accepted && economic && rooms_.storage()) {
        return reject();
      }
      if (!accepted) {
        const auto* ready = std::get_if<wire::Ready>(&request.action);
        if (ready && ready->value && !rooms_.room(*member_)) {
          // The native Ready screen waits for a controlled flower. A denied
          // admission has no native error response; use the existing explicit
          // reconnect path instead of ACKing it into a permanent loading state.
          return reject();
        }
      }
    } else if (!std::holds_alternative<std::monostate>(request.action)) {
      return reject();
    }
    // Queue saturation keeps both the request and ACK at this boundary. Invalid
    // actions are consumed once; accepted mutations are now owned by the room manager.
    acknowledged_ = request.sequence;
    pending_.pop_front();
  }
  if (member_) {
    for (const auto& [sequence, result] : member_->craft_results) {
      if (sequence > craft_cursor_ && result.code != store::Code::ok) {
        return reject();
      }
    }
  }
  return reply;
}

Reply ClientSession::receive(wire::Bytes bytes) {
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
    return {{wire_.greeting(++last_tick_)}};
  }
  if (member_ && !rooms_.active(member_->token, connection_)) {
    return superseded();
  }
  const auto command = wire_.receive(std::move(bytes));
  if (!command) {
    return reject();
  }
  if (std::holds_alternative<wire::OldWorld>(*command)) {
    return {};
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
  const auto& batch = std::get<wire::ReliableBatch>(*command);
  if (batch.first_sequence > std::uint64_t(received_) + 1) {
    return reject();
  }
  if (batch.last_sequence <= acknowledged_) {
    return member_ ? publish() : reject();
  }
  for (const auto& request : batch.requests) {
    if (request.sequence <= received_) {
      continue;
    }
    if (pending_.size() == 256) {
      return reject();
    }
    pending_.push_back({request, acknowledged_life_});
    received_ = request.sequence;
  }
  auto reply = drain();
  if (reply.close) {
    return reply;
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
