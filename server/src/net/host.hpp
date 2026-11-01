#pragma once
#include "florr/server/network.hpp"
#include "florr/server/room_manager.hpp"
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/steady_timer.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/websocket.hpp>
#include <deque>

namespace florr::server {
namespace asio=boost::asio;
namespace beast=boost::beast;
namespace http=beast::http;
namespace websocket=beast::websocket;
using tcp=asio::ip::tcp;
using Error=boost::system::error_code;
std::uint64_t monotonic_ms();
class Connection;
struct NetworkServer::Impl : std::enable_shared_from_this<Impl> {
  Impl(asio::io_context& context,Config settings,engine::WorldConfig world);
  void start();void accept();void schedule();void stop();void finish();
  void removed(ConnectionId id,bool pending,CloseCause cause);
  asio::io_context& io;Config config;Metrics metrics;RoomManager rooms;
  tcp::acceptor listener;asio::steady_timer tickTimer,drainTimer;
  FixedTickScheduler scheduler;
  std::map<ConnectionId,std::shared_ptr<Connection>> connections;
  ConnectionId nextId=1;bool stopping=false,finished=false;
};
class Connection : public std::enable_shared_from_this<Connection> {
 public:
  Connection(std::shared_ptr<NetworkServer::Impl> host,tcp::socket socket,ConnectionId id);
  void start();void shutdown();void abort(CloseCause cause);
 private:
  friend struct NetworkTestAccess;
  void http_read();void http_reply(http::status status,std::string body);
  void upgrade();void read();void pump();void heartbeat();void close_stream();
  void deadline(std::uint32_t ms);
  void reject(wire::ErrorCode code,std::string_view reason);
  bool send(Bytes bytes);
  void refresh_pending();
  std::shared_ptr<NetworkServer::Impl> host_;
  ConnectionId id_;
  websocket::stream<beast::tcp_stream> stream_;
  beast::flat_buffer input_;
  http::request_parser<http::empty_body> parser_;
  std::shared_ptr<http::response<http::string_body>> response_;
  asio::steady_timer deadline_,writeDeadline_,heartbeat_;
  std::shared_ptr<Session> session_;
  std::deque<std::shared_ptr<const Bytes>> writes_;
  std::size_t queuedBytes_=0;
  bool upgraded_=false,pending_=true,hello_=false,writing_=false,closing_=false,closeStarted_=false,done_=false;
  CloseCause closeCause_=CloseCause::Normal;
};
} // namespace florr::server
