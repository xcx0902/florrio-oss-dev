#include "florr/server/network.hpp"
#include "florr/server/runtime.hpp"
#include "engine/net/generated_multiplayer.hpp"
#include <boost/asio/signal_set.hpp>
#include <csignal>
#include <iostream>

namespace florr::server {
std::string_view build_identity() {return FLORR_NATIVE_SOURCE_ID;}
int run_service(const Config& config) {
  boost::asio::io_context io(1);NetworkServer server(io,config);
  boost::asio::signal_set signals(io,SIGINT,SIGTERM);
  signals.async_wait([&](const boost::system::error_code& error,int) {if(!error)server.stop();});
  server.start();
  std::cout<<"{\"event\":\"started\",\"version\":\""<<version()<<"\",\"build\":\""<<build_identity()
    <<"\",\"protocol\":"<<engine::net::kProtocolVersion<<",\"catalog\":\""<<engine::net::kCatalogHash<<"\",\"port\":"<<server.port()<<"}\n"<<std::flush;
  try {io.run();}
  catch(...) {
    // Entropy/allocation/startup failures stop all asynchronous work as well.
    server.stop();signals.cancel();io.restart();io.run();throw;
  }
  std::cout<<"{\"event\":\"stopped\",\"metrics\":"<<server.metrics().json()<<"}\n";
  return 0;
}
} // namespace florr::server
