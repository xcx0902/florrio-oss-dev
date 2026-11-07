#include "app/bootstrap_session.hpp"

#include <utility>

namespace wave::app {

BootstrapSession::BootstrapSession(std::string id) : id_(std::move(id)) {}

Reply BootstrapSession::receive(wire::Bytes bytes) {
  if (!greeted_) {
    if (!wire::is_hello(bytes)) {
      return reject();
    }
    greeted_ = true;
    return {{wire_.world(++last_tick_, 0)}};
  }

  const auto command = wire_.receive(std::move(bytes));
  if (!command) {
    return reject();
  }
  if (const auto* ack = std::get_if<wire::WorldAck>(&*command)) {
    return ack->tick <= last_tick_ ? Reply{} : reject();
  }

  const auto startup = std::get<wire::Startup>(*command);
  if (startup.last_sequence <= acknowledged_) {
    return {{wire_.world(++last_tick_, acknowledged_)}};
  }
  if (startup.first_sequence > acknowledged_ + 1) {
    return reject();
  }

  const bool first = acknowledged_ == 0;
  acknowledged_ = startup.last_sequence;
  Reply reply;
  if (first) {
    reply.frames.push_back(wire_.guest_id(id_));
  }
  reply.frames.push_back(wire_.world(++last_tick_, acknowledged_, first));
  // The client starts consuming world updates once it has three buffered ticks.
  for (int i = 0; i < 2; ++i) {
    reply.frames.push_back(wire_.world(++last_tick_, acknowledged_));
  }
  return reply;
}

Reply BootstrapSession::reject() {
  return {{wire_.disconnect()}, true};
}

}  // namespace wave::app
