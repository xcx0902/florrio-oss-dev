#include "host.hpp"
#include <chrono>

namespace florr::server {
std::uint64_t monotonic_ms() {
  return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}
NetworkServer::Impl::Impl(asio::io_context& context,Config settings,engine::WorldConfig world)
  :io(context),config(std::move(settings)),rooms(config,metrics,world),listener(context),tickTimer(context),drainTimer(context),
   scheduler(monotonic_ms(),config.tickMs,config.maxCatchupTicks) {
  const tcp::endpoint endpoint(asio::ip::make_address(config.listenAddress),static_cast<std::uint16_t>(config.listenPort));
  listener.open(endpoint.protocol());listener.set_option(asio::socket_base::reuse_address(true));
  listener.bind(endpoint);listener.listen(asio::socket_base::max_listen_connections);
}
void NetworkServer::Impl::start() {accept();schedule();}
void NetworkServer::Impl::accept() {
  if(finished)return;
  listener.async_accept([self=shared_from_this()](Error ec,tcp::socket socket) {
    if(!ec) {
      // During the bounded drain keep HTTP probes alive. Upgrade/Hello checks
      // reject admission; finish() closes the listener when draining completes.
      if(self->metrics.connections>=self->config.maxConnections
          || self->metrics.pending>=self->config.maxPendingHandshakes || self->nextId==UINT64_MAX) {
        ++self->metrics.rejected;Error ignored;socket.close(ignored);
      } else {
        const auto id=self->nextId++;
        auto connection=std::make_shared<Connection>(self,std::move(socket),id);
        self->connections.emplace(id,connection);++self->metrics.connections;++self->metrics.pending;++self->metrics.accepted;
        connection->start();
      }
    }
    if(!self->finished && ec!=asio::error::operation_aborted)self->accept();
  });
}
void NetworkServer::Impl::schedule() {
  if(stopping || finished)return;
  tickTimer.expires_at(std::chrono::steady_clock::time_point(std::chrono::milliseconds(scheduler.next())));
  tickTimer.async_wait([self=shared_from_this()](Error ec) {
    if(ec || self->stopping)return;
    const auto now=monotonic_ms();const auto due=self->scheduler.poll(now);
    if(due.overloaded) {++self->metrics.overloads;self->metrics.discardedWallMs+=due.discardedMs;}
    self->rooms.overloaded(due.overloaded);
    for(std::uint32_t i=0;i<due.ticks;++i) {
      const auto start=std::chrono::steady_clock::now();self->rooms.tick(now);
      const auto elapsed=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-start).count();
      self->metrics.maxTickMicros=std::max(self->metrics.maxTickMicros,static_cast<std::uint64_t>(elapsed));
    }
    self->schedule();
  });
}
void NetworkServer::Impl::removed(ConnectionId id,bool pending,CloseCause cause) {
  if(!connections.erase(id))return;
  --metrics.connections;if(pending)--metrics.pending;
  ++metrics.teardowns;++metrics.closed[static_cast<std::size_t>(cause)];
  if(stopping && connections.empty())finish();
}
void NetworkServer::Impl::stop() {
  if(stopping)return;
  stopping=true;tickTimer.cancel();
  // Stop admission first, then notify active peers while their bindings exist.
  rooms.overloaded(true);
  const auto active=connections;
  for(const auto& [id,connection]:active) {(void)id;connection->shutdown();}
  rooms.stop();
  if(connections.empty()) {finish();return;}
  drainTimer.expires_after(std::chrono::milliseconds(config.shutdownDrainMs));
  drainTimer.async_wait([self=shared_from_this()](Error ec) {
    if(ec)return;
    const auto remaining=self->connections;
    for(const auto& [id,connection]:remaining) {(void)id;connection->abort(CloseCause::Stopping);}
    self->finish();
  });
}
void NetworkServer::Impl::finish() {
  if(finished)return;
  finished=true;Error ignored;listener.cancel(ignored);listener.close(ignored);tickTimer.cancel();drainTimer.cancel();
}
NetworkServer::NetworkServer(asio::io_context& io,Config config,engine::WorldConfig world):impl_(std::make_shared<Impl>(io,std::move(config),world)) {}
NetworkServer::~NetworkServer() {
  // The owning executor must be quiescent when destroying a host. Explicit
  // cancellation also breaks the connection/host ownership cycle if a caller
  // abandons an io_context before running its completion handlers.
  if(!impl_->finished) {
    impl_->stop();
    const auto remaining=impl_->connections;
    for(const auto& [id,connection]:remaining) {(void)id;connection->abort(CloseCause::Stopping);}
    impl_->finish();
  }
}
void NetworkServer::start() {impl_->start();}
void NetworkServer::stop() {impl_->stop();}
std::uint16_t NetworkServer::port() const {return impl_->listener.local_endpoint().port();}
const Metrics& NetworkServer::metrics() const {return impl_->metrics;}
} // namespace florr::server
