#include "app/garden_session.hpp"

#include <algorithm>
#include <limits>

namespace wave::app {

GardenSession::GardenSession(Garden& garden, std::uint64_t connection, sim::Biome biome)
    : garden_(garden), biome_(biome), connection_(connection) {}

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

Reply GardenSession::superseded() {
  closed_ = true;
  return {{}, true, CloseReason::superseded};
}

wire::Bytes GardenSession::snapshot() {
  if (last_tick_ == std::numeric_limits<std::uint32_t>::max()) {
    throw std::runtime_error("Garden wire tick exhausted");
  }
  auto frame = projection_.build(garden_, *member_);
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

Reply GardenSession::publish() {
  if (closed_ || !member_) {
    return {};
  }
  if (!garden_.active(member_->token, connection_)) {
    return superseded();
  }
  auto reply = drain();
  if (!reply.close) {
    reply.frames.push_back(snapshot());
  }
  return reply;
}

Reply GardenSession::drain() {
  garden_.poll_storage();
  Reply reply;
  while (!pending_.empty()) {
    const auto& queued = pending_.front();
    const auto& request = queued.request;
    if (std::holds_alternative<wire::Identify>(request.action)) {
      if (member_) {
        return reject();
      }
      member_ = &garden_.admit(requested_guest_, connection_, biome_);
      craft_cursor_ = member_->craft_sequence;
      reply.frames.push_back(wire_.guest_id(member_->token));
    } else if (member_) {
      const bool economic = std::holds_alternative<wire::Craft>(request.action) ||
                            std::holds_alternative<wire::Equip>(request.action) ||
                            std::holds_alternative<wire::Swap>(request.action);
      if (economic && garden_.storage() && garden_.storage_pending() >= Garden::storage_capacity) {
        break;
      }
      const bool accepted =
          garden_.command(*member_, request.action, queued.life,
                          std::to_string(connection_) + ":" + std::to_string(request.sequence));
      if (!accepted && economic && garden_.storage() &&
          garden_.storage_pending() >= Garden::storage_capacity) {
        break;
      }
      // No native error enum has been recovered for denied economic actions.
      // Close the session so a fresh admission can restore committed state.
      if (!accepted && economic && garden_.storage()) {
        return reject();
      }
    } else if (!std::holds_alternative<std::monostate>(request.action)) {
      return reject();
    }
    // Queue saturation keeps both the request and ACK at this boundary. Invalid
    // actions are consumed once; accepted mutations are now owned by Garden.
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
    return superseded();
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
