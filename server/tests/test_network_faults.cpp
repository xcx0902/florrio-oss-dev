#include "network_support.hpp"
#include "../src/net/host.hpp"
// Fault injection is compiled only into this test target. Production wire
// dispatch never exposes an enqueue/debug/clock/entity mutation operation.
namespace florr::server {
struct NetworkTestAccess {
  static std::shared_ptr<Connection> connection(NetworkServer& server) {
    REQUIRE(!server.impl_->connections.empty());return server.impl_->connections.begin()->second;
  }
  static void slow(NetworkServer& server) {
    auto c=connection(server);
    // A normal snapshot/leaderboard write can still be active after spawn.
    // Fill the actual remaining budget, then prove one extra byte is refused.
    REQUIRE(c->queuedBytes_<wire::kMaxQueuedWriteBytes);
    REQUIRE(c->send(Bytes(wire::kMaxQueuedWriteBytes-c->queuedBytes_,1)));
    REQUIRE(c->writing_ && c->queuedBytes_==wire::kMaxQueuedWriteBytes);
    REQUIRE(!c->send({1}));c->abort(CloseCause::SlowConsumer);c->abort(CloseCause::SlowConsumer);
  }
  static void write_error(NetworkServer& server) {
    auto c=connection(server);(void)c->send(Bytes(1000000,1));Error ec;
    beast::get_lowest_layer(c->stream_).socket().close(ec);
  }
  static void stalled_write(NetworkServer& server) {
    auto c=connection(server);beast::get_lowest_layer(c->stream_).socket().set_option(asio::socket_base::send_buffer_size(1024));
    REQUIRE(c->send(Bytes(1000000,1)));
  }
  static void close(NetworkServer& server) {connection(server)->shutdown();}
  static void close_during_write(NetworkServer& server) {
    stalled_write(server);auto c=connection(server);c->shutdown();
    REQUIRE(c->writing_ && c->closing_ && !c->closeStarted_);
  }
};
}
using namespace florr::server;using namespace florr::server::test;
int main() {
  unsigned index=0;
  {
    RunningServer s;Client c(s.port);c.join();c.spawn();s.call([&]{NetworkTestAccess::slow(s.server);});s.after(10);
    const auto m=s.metrics();REQUIRE(m.teardowns==1 && m.closed[static_cast<std::size_t>(CloseCause::SlowConsumer)]==1);
    std::cout<<"ok "<<++index<<" - active and pending buffers bounded; repeated teardown\n";
  }
  {
    RunningServer s;Client c(s.port);c.join();s.call([&]{NetworkTestAccess::write_error(s.server);});s.after(10);
    REQUIRE(s.metrics().teardowns==1);std::cout<<"ok "<<++index<<" - read/write cancellation callbacks clean once\n";
  }
  {
    auto config=network_config();config.writeTimeoutMs=20;RunningServer s(config);Client c(s.port);c.join();
    beast::get_lowest_layer(c.socket).socket().set_option(asio::socket_base::receive_buffer_size(1024));
    s.call([&]{NetworkTestAccess::stalled_write(s.server);});s.after(80);
    REQUIRE(s.metrics().teardowns==1 && s.metrics().closed[static_cast<std::size_t>(CloseCause::Timeout)]==1);
    std::cout<<"ok "<<++index<<" - active write deadline cancels owned buffer\n";
  }
  {
    auto config=network_config();config.closeTimeoutMs=20;RunningServer s(config);Client c(s.port);c.join();
    s.call([&]{NetworkTestAccess::close(s.server);});s.after(80);REQUIRE(s.metrics().teardowns==1);
    std::cout<<"ok "<<++index<<" - close handshake timeout\n";
  }
  {
    auto config=network_config();config.closeTimeoutMs=20;RunningServer s(config);Client c(s.port);c.join();
    beast::get_lowest_layer(c.socket).socket().set_option(asio::socket_base::receive_buffer_size(1024));
    s.call([&]{NetworkTestAccess::close_during_write(s.server);});s.after(80);REQUIRE(s.metrics().teardowns==1);
    std::cout<<"ok "<<++index<<" - close waits for active write and cancels on deadline\n";
  }
  {
    auto config=network_config();config.closeTimeoutMs=1000;config.shutdownDrainMs=200;RunningServer s(config);Client c(s.port);c.join();
    s.call([&]{s.server.stop();});
    REQUIRE(request(s.port,"/readyz").result()==http::status::service_unavailable);
    REQUIRE(request(s.port,"/healthz").result()==http::status::ok);
    REQUIRE(request(s.port,"/ws").result()==http::status::service_unavailable);
    s.stop();const auto& m=s.server.metrics();REQUIRE(m.teardowns==4 && m.connections==0 && m.pending==0 && m.teardowns==m.accepted);
    std::cout<<"ok "<<++index<<" - shutdown keeps probes, rejects upgrade and bounds drain\n";
  }
  std::cout<<"1.."<<index<<'\n';
}
