#pragma once

#include "app/bootstrap_session.hpp"
#include "app/garden.hpp"
#include "wire/garden_projection.hpp"

#include <map>

namespace wave::app {

class GardenSession {
 public:
  GardenSession(Garden& garden, std::uint64_t connection);
  ~GardenSession();
  Reply receive(wire::Bytes bytes);
  Reply publish();
  Reply reject();

 private:
  wire::Bytes snapshot();
  Garden& garden_;
  std::uint64_t connection_;
  Member* member_ = nullptr;
  std::string requested_guest_;
  wire::Bootstrap wire_;
  wire::GardenProjection projection_;
  std::uint32_t acknowledged_ = 0;
  std::uint32_t last_tick_ = 0;
  std::uint32_t last_ack_ = 0;
  std::map<std::uint32_t, std::optional<sim::LifeId>> sent_lives_;
  std::optional<sim::LifeId> acknowledged_life_;
  bool greeted_ = false;
  bool closed_ = false;
};

}  // namespace wave::app
