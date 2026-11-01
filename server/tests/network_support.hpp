#pragma once
#include "support.hpp"
#include "florr/server/network.hpp"
#include <boost/asio/post.hpp>
#include <boost/asio/steady_timer.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/websocket.hpp>
#include <future>
#include <thread>

namespace florr::server::test {
namespace asio=boost::asio;namespace beast=boost::beast;namespace http=beast::http;namespace ws=beast::websocket;
using tcp=asio::ip::tcp;using Error=boost::system::error_code;
inline Config network_config() {Config c;c.listenPort=0;c.allowMissingOrigin=true;c.closeTimeoutMs=100;c.shutdownDrainMs=200;return c;}
struct RunningServer {
  asio::io_context io{1};NetworkServer server;std::thread thread;std::uint16_t port;
  explicit RunningServer(Config config=network_config()):server(io,std::move(config)),port(server.port()) {
    server.start();thread=std::thread([this]{try{io.run();}catch(const std::exception& e){std::cerr<<e.what()<<'\n';std::abort();}});
  }
  template<class F> auto call(F fn) {
    auto task=std::make_shared<std::packaged_task<decltype(fn())()>>(std::move(fn));auto result=task->get_future();
    asio::post(io,[task]{(*task)();});return result.get();
  }
  void after(unsigned ms) {
    auto promise=std::make_shared<std::promise<void>>();auto future=promise->get_future();
    asio::post(io,[this,promise,ms] {
      auto timer=std::make_shared<asio::steady_timer>(io,std::chrono::milliseconds(ms));
      timer->async_wait([timer,promise](Error){promise->set_value();});
    });future.get();
  }
  Metrics metrics() {return call([this]{return server.metrics();});}
  void stop() {if(thread.joinable()){asio::post(io,[this]{server.stop();server.stop();});thread.join();}}
  ~RunningServer() {stop();}
};
struct Client {
  using Stream=ws::stream<beast::tcp_stream>;
  asio::io_context io;std::unique_ptr<Stream> owned;Stream& socket;wire::Welcome welcome;
  static std::unique_ptr<Stream> connect(asio::io_context& io,unsigned port,const std::string& origin,const std::string& path) {
    // Debug/sanitizer initialization can legitimately trigger the production
    // catch-up guard. Retry only explicit HTTP 503, within a finite wall budget.
    for(unsigned attempt=0;attempt<40;++attempt) {
      auto stream=std::make_unique<Stream>(io);
      beast::get_lowest_layer(*stream).connect(tcp::endpoint(asio::ip::make_address("127.0.0.1"),static_cast<std::uint16_t>(port)));
      if(!origin.empty())stream->set_option(ws::stream_base::decorator([origin](ws::request_type& request){request.set(http::field::origin,origin);}));
      ws::response_type response;Error ec;stream->handshake(response,"127.0.0.1",path,ec);
      if(!ec) {REQUIRE(response[http::field::sec_websocket_extensions].empty());stream->binary(true);return stream;}
      if(response.result()!=http::status::service_unavailable)throw boost::system::system_error(ec);
      asio::steady_timer backoff(io,std::chrono::milliseconds(50));backoff.wait();
    }
    REQUIRE(false);std::abort();
  }
  explicit Client(unsigned port,std::string origin="",std::string path="/ws")
    :owned(connect(io,port,origin,path)),socket(*owned) {}
  ~Client() {Error ec;beast::get_lowest_layer(socket).socket().close(ec);}
  template<class T> void send(const T& value,std::uint32_t epoch=UINT32_MAX) {
    auto bytes=wire::encode_message(value,epoch==UINT32_MAX?welcome.sessionEpoch:epoch);REQUIRE(bytes);
    socket.write(asio::buffer(*bytes));
  }
  template<class T,class F> T next(F predicate) {
    for(unsigned i=0;i<500;++i) {
      beast::flat_buffer buffer;socket.read(buffer);REQUIRE(socket.got_binary());
      const auto data=buffer.data();auto message=wire::decode_message({static_cast<const std::uint8_t*>(data.data()),data.size()},false);REQUIRE(message);
      if(const auto* ping=std::get_if<wire::Ping>(&message->value))send(wire::Pong{ping->nonce,ping->serverTick,ping->monotonicMs},message->sessionEpoch);
      if(const auto* value=std::get_if<T>(&message->value);value && predicate(*value))return *value;
    }
    REQUIRE(false);std::abort();
  }
  template<class T> T next() {return next<T>([](const T&){return true;});}
  void join(wire::Hello value=hello()) {send(value,0);welcome=next<wire::Welcome>();}
  wire::Snapshot spawn() {send(command(1,wire::CommandKind::Spawn));return next<wire::Snapshot>([](const auto& s){return s.controlledHandle!=0;});}
  void drain_close() {Error ec;for(unsigned i=0;i<500 && !ec;++i){beast::flat_buffer b;socket.read(b,ec);}REQUIRE(ec);}
};
inline http::response<http::string_body> request(unsigned port,std::string target="/healthz",std::string origin="",bool duplicate=false) {
  asio::io_context io;beast::tcp_stream socket(io);socket.connect(tcp::endpoint(asio::ip::make_address("127.0.0.1"),static_cast<std::uint16_t>(port)));
  http::request<http::empty_body> req(http::verb::get,target,11);req.set(http::field::host,"127.0.0.1");
  if(!origin.empty())req.set(http::field::origin,origin);
  if(target.starts_with("/ws")) {
    req.set(http::field::connection,"upgrade");req.set(http::field::upgrade,"websocket");
    req.set(http::field::sec_websocket_version,"13");req.set(http::field::sec_websocket_key,"dGhlIHNhbXBsZSBub25jZQ==");
  }
  if(duplicate)req.insert(http::field::origin,origin);
  http::write(socket,req);beast::flat_buffer buffer;http::response<http::string_body> response;http::read(socket,buffer,response);return response;
}
} // namespace florr::server::test
