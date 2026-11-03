#include "florr/server/room_manager.hpp"
#include <algorithm>
#include <chrono>
#include <sys/resource.h>
namespace florr::server {
namespace {
/** Process CPU time, so a host scheduler pause is distinguishable from work. */
std::uint64_t process_cpu_micros() {
  struct rusage usage{};
  if (getrusage(RUSAGE_SELF, &usage) != 0) {
    return 0;
  }
  const auto micros = [](const timeval& value) {
    return static_cast<std::uint64_t>(value.tv_sec) * 1000000U +
           static_cast<std::uint64_t>(value.tv_usec);
  };
  return micros(usage.ru_utime) + micros(usage.ru_stime);
}
}  // namespace
void RoomManager::hello(std::shared_ptr<Session> session, wire::Hello hello) {
  if (!ready()) {
    session->fail(wire::ErrorCode::Stopping, "NOT_READY");
    return;
  }
  if (auto error = wire::validate_hello(hello)) {
    session->fail(*error, "HELLO_REJECTED");
    return;
  }
  if (pending_.size() >= config_.maxPendingHandshakes || pending_.contains(session->id())) {
    session->fail(wire::ErrorCode::Protocol, "HELLO_STATE");
    return;
  }
  const auto id = session->id();
  pending_.emplace(id, Admission{std::move(session), std::move(hello)});
}
void RoomManager::tick(std::uint64_t now) {
  const auto roundStart = std::chrono::steady_clock::now();
  const auto roundCpuStart = process_cpu_micros();
  for (auto& [name, room] : rooms_) {
    (void)name;
    room->begin_tick();
  }
  auto pending = std::move(pending_);
  pending_.clear();
  for (auto& [id, admission] : pending) {
    (void)id;
    auto session = admission.session;
    if (!session->active()) {
      continue;
    }
    if (!ready()) {
      session->fail(wire::ErrorCode::Stopping, "NOT_READY");
      continue;
    }
    auto found = rooms_.find(admission.hello.roomId);
    if (found == rooms_.end()) {
      if (admission.hello.resumeToken) {
        session->fail(wire::ErrorCode::Session, "RESUME_REJECTED");
        continue;
      }
      if (rooms_.size() >= config_.maxRooms) {
        session->fail(wire::ErrorCode::RoomFull, "ROOM_LIMIT");
        continue;
      }
      auto room = std::make_unique<Room>(admission.hello.roomId, config_, metrics_, worldConfig_);
      found = rooms_.emplace(admission.hello.roomId, std::move(room)).first;
      ++metrics_.rooms;
    }
    found->second->admit(session, admission.hello, nextEpoch_++, now);
  }
  for (auto it = rooms_.begin(); it != rooms_.end();) {
    const auto exhausted = it->second->exhausted();
    if (exhausted) {
      it->second->stop(wire::ErrorCode::EpochExhausted);
    } else {
      const auto roomStart = std::chrono::steady_clock::now();
      const auto roomCpuStart = process_cpu_micros();
      it->second->tick();
      const auto roomCpu = process_cpu_micros() - roomCpuStart;
      metrics_.record_room_tick(
          static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                         std::chrono::steady_clock::now() - roomStart)
                                         .count()),
          roomCpu, metrics_.ticks);
      metrics_.maxRoomPlayers =
          std::max(metrics_.maxRoomPlayers, static_cast<std::uint64_t>(it->second->size()));
      metrics_.maxRoomEntities =
          std::max(metrics_.maxRoomEntities,
                   static_cast<std::uint64_t>(it->second->world().entities().active_count()));
    }
    if (it->second->expired() || exhausted) {
      it = rooms_.erase(it);
      --metrics_.rooms;
    } else {
      ++it;
    }
  }
  metrics_.record_round(
      static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                     std::chrono::steady_clock::now() - roundStart)
                                     .count()),
      process_cpu_micros() - roundCpuStart, metrics_.ticks);
  std::uint64_t entities = 0;
  for (const auto& [name, room] : rooms_) {
    (void)name;
    entities += room->world().entities().active_count();
  }
  metrics_.entities = entities;
}
void RoomManager::stop() {
  if (stopping_) {
    return;
  }
  stopping_ = true;
  for (auto& [id, admission] : pending_) {
    (void)id;
    admission.session->fail(wire::ErrorCode::Stopping, "STOPPING");
  }
  pending_.clear();
  for (auto& [name, room] : rooms_) {
    (void)name;
    room->stop();
  }
  rooms_.clear();
  metrics_.rooms = 0;
}
const Room* RoomManager::find(std::string_view name) const {
  auto it = rooms_.find(name);
  return it == rooms_.end() ? nullptr : it->second.get();
}
}  // namespace florr::server
