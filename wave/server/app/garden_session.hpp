#pragma once

#include "app/bootstrap_session.hpp"
#include "app/garden.hpp"
#include "wire/garden_projection.hpp"

#include <map>
#include <deque>

namespace wave::app {

class GardenSession {
 public:
  GardenSession(Garden& garden, std::uint64_t connection,
                sim::Biome biome = sim::Biome::garden);
  ~GardenSession();
  Reply receive(wire::Bytes bytes);
  Reply publish();
  Reply reject();

 private:
  Reply superseded();
  wire::Bytes snapshot();
  Reply drain();
  struct Pending {
    wire::ReliableRequest request;
    std::optional<sim::LifeId> life;
  };
  std::deque<Pending> pending_;
  std::uint32_t received_ = 0;
  Garden& garden_;
  sim::Biome biome_;
  std::uint64_t connection_;
  Member* member_ = nullptr;
  std::string requested_guest_;
  wire::Bootstrap wire_;
  wire::GardenProjection projection_;
  std::uint32_t acknowledged_ = 0;
  std::uint64_t craft_cursor_ = 0;
  std::uint64_t match_ = 0;
  std::uint32_t last_tick_ = 0;
  std::uint32_t last_ack_ = 0;
  std::map<std::uint32_t, std::optional<sim::LifeId>> sent_lives_;
  std::optional<sim::LifeId> acknowledged_life_;
  bool greeted_ = false;
  bool identified_ = false;
  bool closed_ = false;
};

}  // namespace wave::app
