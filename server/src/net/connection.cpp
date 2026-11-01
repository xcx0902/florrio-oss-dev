#include "host.hpp"

namespace florr::server {
Connection::Connection(std::shared_ptr<NetworkServer::Impl> host,tcp::socket socket,ConnectionId id)
  :host_(std::move(host)),id_(id),stream_(std::move(socket)),input_(host_->config.httpHeaderMaxBytes+host_->config.maxClientFrameBytes),
   deadline_(stream_.get_executor()),writeDeadline_(stream_.get_executor()),heartbeat_(stream_.get_executor()) {}
void Connection::deadline(std::uint32_t ms) {
  deadline_.expires_after(std::chrono::milliseconds(ms));
  deadline_.async_wait([self=shared_from_this()](Error ec) {if(!ec)self->abort(CloseCause::Timeout);});
}
void Connection::start() {
  const auto weak=weak_from_this();
  session_=std::make_shared<Session>(id_,host_->config,host_->metrics,PeerSink{
    [weak](Bytes bytes) {auto self=weak.lock();return self && self->send(std::move(bytes));},
    [weak](wire::ErrorCode code,std::string_view reason) {if(auto self=weak.lock())self->reject(code,reason);}},monotonic_ms());
  parser_.header_limit(host_->config.httpHeaderMaxBytes);parser_.body_limit(0);
  deadline(host_->config.httpTimeoutMs);http_read();
}
void Connection::http_read() {
  http::async_read(stream_.next_layer(),input_,parser_,[self=shared_from_this()](Error ec,std::size_t) {
    if(self->done_)return;
    if(ec) {self->abort(CloseCause::Http);return;}
    const auto& request=self->parser_.get();
    if(request.method()!=http::verb::get || request.version()!=11 || self->input_.size()!=0) {
      self->http_reply(http::status::bad_request,"{\"error\":\"BAD_REQUEST\"}");return;
    }
    if(request.target()=="/healthz") {self->http_reply(http::status::ok,"{\"alive\":true}");return;}
    if(request.target()=="/readyz") {
      const auto ready=self->host_->rooms.ready() && !self->host_->stopping;
      self->http_reply(ready?http::status::ok:http::status::service_unavailable,ready?"{\"ready\":true}":"{\"ready\":false}");return;
    }
    if(request.target()=="/metrics") {self->http_reply(http::status::ok,self->host_->metrics.json());return;}
    if(request.target()!=self->host_->config.websocketPath || !websocket::is_upgrade(request)) {
      self->http_reply(http::status::not_found,"{\"error\":\"NOT_FOUND\"}");return;
    }
    if(!self->host_->rooms.ready()) {self->http_reply(http::status::service_unavailable,"{\"error\":\"NOT_READY\"}");return;}
    const auto origin=request[http::field::origin];
    // Forwarded/X-Forwarded-* are never used for authorization or identity.
    // Origin must itself be unique and exactly on the configured allowlist.
    if(request.count(http::field::origin)>1 || !allows_origin(self->host_->config,origin,request.count(http::field::origin)!=0)) {
      self->http_reply(http::status::forbidden,"{\"error\":\"ORIGIN\"}");return;
    }
    self->upgrade();
  });
}
void Connection::http_reply(http::status status,std::string body) {
  response_=std::make_shared<http::response<http::string_body>>(status,11);
  response_->set(http::field::content_type,"application/json");response_->set(http::field::cache_control,"no-store");
  response_->keep_alive(false);response_->body()=std::move(body);response_->prepare_payload();
  http::async_write(stream_.next_layer(),*response_,[self=shared_from_this(),response=response_](Error,std::size_t) {
    (void)response;self->abort(CloseCause::Http);
  });
}
void Connection::upgrade() {
  deadline_.cancel();
  beast::get_lowest_layer(stream_).expires_never();
  stream_.set_option(websocket::stream_base::timeout{
    std::chrono::milliseconds(host_->config.websocketHandshakeTimeoutMs),websocket::stream_base::none(),false});
  websocket::permessage_deflate compression;compression.server_enable=false;compression.client_enable=false;stream_.set_option(compression);
  stream_.read_message_max(host_->config.maxClientFrameBytes);stream_.binary(true);
  stream_.async_accept(parser_.get(),[self=shared_from_this()](Error ec) {
    if(self->done_)return;
    if(ec) {self->abort(CloseCause::Http);return;}
    self->upgraded_=true;self->deadline(self->host_->config.helloTimeoutMs);self->read();self->heartbeat();
  });
}
void Connection::refresh_pending() {
  if(pending_ && session_->bound()) {pending_=false;--host_->metrics.pending;deadline_.cancel();heartbeat();}
}
void Connection::read() {
  if(done_ || closeStarted_)return;
  stream_.async_read(input_,[self=shared_from_this()](Error ec,std::size_t) {
    if(self->done_)return;
    if(ec) {self->abort(self->closing_?self->closeCause_:ec==websocket::error::closed?CloseCause::Normal:CloseCause::Read);return;}
    if(self->closing_) {self->input_.consume(self->input_.size());return;}
    if(!self->stream_.got_binary()) {self->reject(wire::ErrorCode::Protocol,"BINARY_REQUIRED");return;}
    const auto data=self->input_.data();
    const auto bytes=std::span<const std::uint8_t>(static_cast<const std::uint8_t*>(data.data()),data.size());
    const auto message=wire::decode_message(bytes,true);
    self->input_.consume(self->input_.size());
    if(!message) {self->reject(wire::ErrorCode::Protocol,"DECODE");return;}
    self->refresh_pending();
    if(!self->hello_) {
      if(const auto* hello=std::get_if<wire::Hello>(&message->value)) {
        self->hello_=true;self->host_->rooms.hello(self->session_,*hello);
      } else {self->reject(wire::ErrorCode::Protocol,"HELLO_REQUIRED");return;}
    } else self->session_->receive(*message,monotonic_ms());
    if(!self->closing_) {self->read();self->heartbeat();}
  });
}
bool Connection::send(Bytes bytes) {
  if(done_ || closing_)return false;
  refresh_pending();
  if(bytes.size()>host_->config.maxServerFrameBytes || bytes.size()>host_->config.maxQueuedWriteBytes-queuedBytes_) {
    // Pending and active buffers both count. Never discard an accepted delta.
    abort(CloseCause::SlowConsumer);return false;
  }
  queuedBytes_+=bytes.size();writes_.push_back(std::make_shared<const Bytes>(std::move(bytes)));pump();return true;
}
void Connection::pump() {
  if(done_ || writing_ || !upgraded_ || closeStarted_)return;
  if(writes_.empty()) {if(closing_)close_stream();return;}
  writing_=true;const auto bytes=writes_.front();
  writeDeadline_.expires_after(std::chrono::milliseconds(host_->config.writeTimeoutMs));
  writeDeadline_.async_wait([self=shared_from_this()](Error ec) {if(!ec)self->abort(CloseCause::Timeout);});
  stream_.async_write(asio::buffer(*bytes),[self=shared_from_this(),bytes](Error ec,std::size_t size) {
    if(self->done_)return;
    self->writeDeadline_.cancel();self->writing_=false;
    if(ec) {self->abort(CloseCause::Write);return;}
    self->host_->metrics.bytesSent+=size;self->queuedBytes_-=bytes->size();self->writes_.pop_front();self->pump();
  });
}
void Connection::reject(wire::ErrorCode code,std::string_view reason) {
  if(done_ || closing_)return;
  closeCause_=code==wire::ErrorCode::Stopping?CloseCause::Stopping:CloseCause::Protocol;
  if(reason=="PONG_TIMEOUT")closeCause_=CloseCause::Timeout;
  // Close has its own total deadline, even while an earlier write is active.
  // The notification itself enters the same bounded FIFO before closing starts.
  auto bytes=wire::encode_message(wire::Error{code,std::string(reason),code==wire::ErrorCode::Stopping},session_->epoch());
  if(upgraded_ && bytes && !send(std::move(*bytes)))return;
  closing_=true;session_->deactivate();heartbeat_.cancel();deadline(host_->config.closeTimeoutMs);
  if(!upgraded_) {abort(closeCause_);return;}
  pump();
}
void Connection::close_stream() {
  if(done_ || closeStarted_)return;
  closeStarted_=true;
  stream_.set_option(websocket::stream_base::timeout{
    std::chrono::milliseconds(host_->config.closeTimeoutMs),websocket::stream_base::none(),false});
  stream_.async_close(websocket::close_code::normal,[self=shared_from_this()](Error) {self->abort(self->closeCause_);});
}
void Connection::heartbeat() {
  if(done_ || closing_)return;
  const auto now=monotonic_ms();
  const auto next=session_->bound()?session_->next_poll():now+std::min(50U,host_->config.pingIntervalMs);
  heartbeat_.expires_after(std::chrono::milliseconds(next>now?next-now:1));
  heartbeat_.async_wait([self=shared_from_this()](Error ec) {
    if(ec || self->done_ || self->closing_)return;
    self->refresh_pending();self->session_->poll(monotonic_ms());self->heartbeat();
  });
}
void Connection::shutdown() {reject(wire::ErrorCode::Stopping,"STOPPING");}
void Connection::abort(CloseCause cause) {
  if(done_)return;
  done_=true;session_->deactivate();deadline_.cancel();writeDeadline_.cancel();heartbeat_.cancel();
  Error ignored;auto& socket=beast::get_lowest_layer(stream_).socket();socket.cancel(ignored);
  socket.shutdown(tcp::socket::shutdown_both,ignored);socket.close(ignored);
  host_->removed(id_,pending_,cause);
  // Handler captures retain the active buffer and this object through completion.
  writes_.clear();queuedBytes_=0;
}
} // namespace florr::server
