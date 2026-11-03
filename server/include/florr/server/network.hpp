#pragma once
#include "florr/server/config.hpp"
#include "florr/server/metrics.hpp"
#include "engine/model/world_config.hpp"
#include <boost/asio/io_context.hpp>
#include <memory>
namespace florr::server {
class NetworkServer {
 public:
  struct Impl;
  NetworkServer(boost::asio::io_context& io, Config config,
                engine::WorldConfig world = {.populate = true});
  ~NetworkServer();
  void start();
  void stop();
  std::uint16_t port() const;
  const Metrics& metrics() const;

 private:
  friend struct NetworkTestAccess;
  std::shared_ptr<Impl> impl_;
};
int run_service(const Config& config);
std::string_view build_identity();
}  // namespace florr::server
