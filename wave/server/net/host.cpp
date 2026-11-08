#include "wire/economy_cache.hpp"
#include "app/garden_session.hpp"
#ifdef WAVE_HOST_DEVELOPMENT
#include "net/dev_inventory.hpp"
#endif
#ifdef WAVE_HOST_TESTING
#include "scenarios/garden-w2.hpp"
#endif

#include <boost/asio.hpp>
#include <boost/beast.hpp>

#include <algorithm>
#include <array>
#include <charconv>
#include <chrono>
#include <csignal>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <memory>
#include <stdexcept>
#include <utility>

namespace {
namespace asio = boost::asio;

namespace beast = boost::beast;
namespace http = beast::http;
namespace ws = beast::websocket;
using tcp = asio::ip::tcp;
using Error = boost::system::error_code;

struct Resource {
  std::string content_type;
  std::string body;
};
using Resources = std::map<std::string, Resource, std::less<>>;

Resources load(const std::filesystem::path& root) {
  struct File {
    const char* url;
    const char* name;
    const char* mime;
  };
  constexpr std::array files{
      File{"/", "index.html", "text/html; charset=utf-8"},
      File{"/reference.css", "reference.css", "text/css; charset=utf-8"},
      File{"/ubuntu-700.css", "ubuntu-700.css", "text/css; charset=utf-8"},
      File{"/4iCv6KVjbNBYlgoCxCvjvWyNL4U.woff2", "4iCv6KVjbNBYlgoCxCvjvWyNL4U.woff2", "font/woff2"},
      File{"/4iCv6KVjbNBYlgoCxCvjtGyNL4U.woff2", "4iCv6KVjbNBYlgoCxCvjtGyNL4U.woff2", "font/woff2"},
      File{"/4iCv6KVjbNBYlgoCxCvjvGyNL4U.woff2", "4iCv6KVjbNBYlgoCxCvjvGyNL4U.woff2", "font/woff2"},
      File{"/4iCv6KVjbNBYlgoCxCvjs2yNL4U.woff2", "4iCv6KVjbNBYlgoCxCvjs2yNL4U.woff2", "font/woff2"},
      File{"/4iCv6KVjbNBYlgoCxCvjvmyNL4U.woff2", "4iCv6KVjbNBYlgoCxCvjvmyNL4U.woff2", "font/woff2"},
      File{"/4iCv6KVjbNBYlgoCxCvjsGyN.woff2", "4iCv6KVjbNBYlgoCxCvjsGyN.woff2", "font/woff2"},
      File{"/ubuntu-LICENCE.txt", "ubuntu-LICENCE.txt", "text/plain; charset=utf-8"},
      File{"/local.js", "local.js", "text/javascript; charset=utf-8"},
      File{"/client.js", "client.js", "text/javascript; charset=utf-8"},
      File{"/client.wasm", "client.wasm", "application/wasm"},
#ifdef WAVE_HOST_DEVELOPMENT
      File{"/dev-inventory.js", "dev-inventory.js", "text/javascript; charset=utf-8"},
      File{"/dev-inventory.css", "dev-inventory.css", "text/css; charset=utf-8"},
#endif
  };
  Resources resources;
  for (const auto& file : files) {
    std::ifstream input(root / file.name, std::ios::binary);
    if (!input) {
      throw std::runtime_error(std::string("Missing assembled resource ") + file.name);
    }
    resources.emplace(file.url, Resource{file.mime, {std::istreambuf_iterator<char>(input), {}}});
  }
  resources.emplace(
      "/endpoint/florrio-waves-0/findEach/",
      Resource{"application/json", R"({"servers":{"us":{"id":"wavelocal","ipv4":"127.0.0.1"}}})"});
  resources.emplace("/server/wavelocal",
                    Resource{"application/json", R"({"id":"wavelocal","ipv4":"127.0.0.1"})"});
  return resources;
}

class Connection : public std::enable_shared_from_this<Connection> {
 public:
  Connection(tcp::socket socket, const Resources& resources, const std::string& authority,
             std::uint64_t& last_guest, std::shared_ptr<wave::app::Garden> garden)
      : socket_(std::move(socket)), resources_(resources), authority_(authority),
        last_guest_(last_guest), garden_(std::move(garden)) {}

  void publish() {
    if (session_ && upgraded_ && !closing_) {
      enqueue(session_->publish());
    }
  }

  void start() {
#ifdef WAVE_HOST_DEVELOPMENT
    parser_.body_limit(512);
#else
    parser_.body_limit(0);
#endif
    parser_.header_limit(4096);
    socket_.next_layer().expires_after(std::chrono::seconds(5));
    http::async_read(socket_.next_layer(), buffer_, parser_,
                     [self = shared_from_this()](Error error, std::size_t) {
                       if (!error) {
                         self->http_request();
                       }
                     });
  }

 private:
  void http_request() {
    const auto& request = parser_.get();
    const std::string_view target = request.target();
    if (request[http::field::host] != authority_) {
      respond(http::status::bad_request, {"text/plain", "Bad request"});
      return;
    }
#ifdef WAVE_HOST_DEVELOPMENT
    constexpr std::string_view debug_path = "/wave/dev/inventory/";
    if (target.starts_with(debug_path)) {
      const auto token = target.substr(debug_path.size());
      if (token.size() != 64 ||
          token.find_first_not_of("0123456789abcdef") != std::string_view::npos) {
        respond(http::status::bad_request, {"text/plain", "Invalid guest token"});
        return;
      }
      if (request.method() == http::verb::get) {
        if (!garden_->request_profile(
                std::string(token),
                [self = shared_from_this()](std::optional<wave::store::Profile> profile) {
                  if (profile) {
                    self->respond(http::status::ok,
                                  {"application/json", wave::dev::inventory_json(*profile)});
                  } else {
                    self->respond(http::status::not_found, {"text/plain", "Unknown guest"});
                  }
                },
                false)) {
          respond(http::status::service_unavailable, {"text/plain", "Profile queue full"});
        }
        return;
      }
      if (request.method() != http::verb::post) {
        respond(http::status::method_not_allowed, {"text/plain", "Use GET or POST"});
        return;
      }
      if (request[http::field::origin] != "http://" + authority_) {
        respond(http::status::forbidden, {"text/plain", "Forbidden origin"});
        return;
      }
      const auto edit = wave::dev::parse_inventory_edit(request.body());
      if (request[http::field::content_type] != "application/x-www-form-urlencoded" || !edit) {
        respond(http::status::bad_request, {"text/plain", "Invalid inventory edit"});
        return;
      }
      if (!garden_->debug_inventory(
              std::string(token), edit->command, edit->item, edit->count,
              [self = shared_from_this()](wave::store::Result result) {
                using wave::store::Code;
                const auto status =
                    result.code == Code::ok              ? http::status::ok
                    : result.code == Code::unknown_guest ? http::status::not_found
                    : result.code == Code::version_conflict || result.code == Code::key_conflict
                        ? http::status::conflict
                        : http::status::bad_request;
                self->respond(
                    status,
                    {"application/json",
                     "{\"code\":\"" + std::string(wave::store::code_name(result.code)) + "\"}"});
              })) {
        respond(http::status::service_unavailable, {"text/plain", "Profile queue full"});
      }
      return;
    }
#endif
    constexpr std::string_view cache_path = "/wave/cache/";
    if (target.starts_with(cache_path) && request.method() == http::verb::get) {
      const auto token = target.substr(cache_path.size());
      if (token.size() > 128 ||
          token.find_first_not_of("0123456789abcdef") != std::string_view::npos) {
        respond(http::status::bad_request, {"text/plain", "Invalid guest token"});
        return;
      }
      if (!garden_->request_profile(
              std::string(token),
              [self = shared_from_this()](std::optional<wave::store::Profile> profile) {
                if (!profile) {
                  self->respond(http::status::not_found, {"text/plain", "No profile"});
                  return;
                }
                self->respond(
                    http::status::ok,
                    {"application/json",
                     "{\"token\":\"" + profile->guest_token + "\",\"equipped\":\"" +
                         wave::wire::equipped_cache(wave::wire::client_equipment(*profile)) +
                         "\",\"inventory\":\"" + wave::wire::inventory_cache(profile->inventory) +
                         "\",\"level\":\"" + wave::wire::signed_cache(profile->level) +
                         "\",\"numPetals\":\"" +
                         wave::wire::signed_cache(wave::store::unlocked_main_slots(profile->level),
                                                  "cached_num_petals") +
                         "\"}"});
              })) {
        respond(http::status::service_unavailable, {"text/plain", "Profile queue full"});
      }
      return;
    }
#ifdef WAVE_HOST_TESTING
    if (target == "/wave/test/state" && request.method() == http::verb::get) {
      respond(http::status::ok, {"application/json", wave::fixtures::garden_state(*garden_)});
      return;
    }
    constexpr std::string_view step_path = "/wave/test/step/";
    if (target.starts_with(step_path) && request.method() == http::verb::post) {
      const auto argument = target.substr(step_path.size());
      unsigned count = 0;
      const auto [end, error] =
          std::from_chars(argument.data(), argument.data() + argument.size(), count);
      if (error != std::errc{} || end != argument.data() + argument.size() || count == 0 ||
          count > 4096) {
        respond(http::status::bad_request, {"text/plain", "Invalid test step count"});
        return;
      }
      for (unsigned i = 0; i < count; ++i) {
        garden_->step();
      }
      respond(http::status::ok, {"application/json", wave::fixtures::garden_state(*garden_)});
      return;
    }
#endif
    if (request.method() != http::verb::get) {
      respond(http::status::bad_request, {"text/plain", "Bad request"});
      return;
    }
    if (target == "/wave/socket" && ws::is_upgrade(request)) {
      if (request[http::field::origin] != "http://" + authority_ || buffer_.size() != 0) {
        respond(http::status::forbidden, {"text/plain", "Forbidden"});
        return;
      }
      session_.emplace(*garden_, ++last_guest_);
      socket_.next_layer().expires_never();
      auto timeouts = ws::stream_base::timeout::suggested(beast::role_type::server);
      timeouts.handshake_timeout = std::chrono::seconds(5);
      timeouts.idle_timeout = std::chrono::seconds(30);
      socket_.set_option(timeouts);
      // Bound application buffering ourselves. Beast's automatic size failure
      // can tear down TCP before Chromium receives its close frame. Reading
      // only limit + 1 bytes lets async_close drain the remainder and complete
      // the WebSocket handshake with a reliable 1009, under its timeout.
      socket_.read_message_max(0);
      socket_.binary(true);
      socket_.async_accept(request, [self = shared_from_this()](Error error) {
        if (!error) {
          self->upgraded_ = true;
          self->read_frame();
        }
      });
      return;
    }
    if (const auto resource = resources_.find(target); resource != resources_.end()) {
      respond(http::status::ok, resource->second);
    } else {
      respond(http::status::not_found, {"text/plain", "Not found"});
    }
  }

  void respond(http::status status, const Resource& resource) {
    response_.result(status);
    response_.version(parser_.get().version());
    response_.set(http::field::content_type, resource.content_type);
    response_.set(http::field::cache_control, "no-store");
    response_.set("X-Content-Type-Options", "nosniff");
    response_.body() = resource.body;
    response_.prepare_payload();
    http::async_write(socket_.next_layer(), response_,
                      [self = shared_from_this()](Error, std::size_t) {});
  }

  void read_frame() {
    socket_.async_read_some(buffer_, wave::wire::max_frame_bytes + 1 - buffer_.size(),
                            [self = shared_from_this()](Error error, std::size_t) {
                              if (error) {
                                self->closing_ = true;
                                self->session_.reset();
                                return;
                              }
                              if (self->buffer_.size() > wave::wire::max_frame_bytes) {
                                self->session_.reset();
                                self->close_code_ = ws::close_code::too_big;
                                self->enqueue({{}, true});
                                return;
                              }
                              if (!self->socket_.is_message_done()) {
                                self->read_frame();
                                return;
                              }
                              if (self->socket_.got_binary()) {
                                const auto data = self->buffer_.data();
                                const auto* first = static_cast<const std::uint8_t*>(data.data());
                                self->enqueue(
                                    self->session_->receive({first, first + data.size()}));
                              } else {
                                self->enqueue(self->session_->reject());
                              }
                              self->buffer_.consume(self->buffer_.size());
                              if (!self->closing_) {
                                self->read_frame();
                              }
                            });
  }

  void enqueue(wave::app::Reply reply) {
    if (closing_) {
      return;
    }
    if (outgoing_.size() + reply.frames.size() > 64) {
      closing_ = true;
      Error ignored;
      socket_.next_layer().socket().shutdown(tcp::socket::shutdown_both, ignored);
      return;
    }
    const bool writing = !outgoing_.empty();
    for (auto& frame : reply.frames) {
      outgoing_.push_back(std::move(frame));
    }
    closing_ = reply.close;
    if (!writing && (!outgoing_.empty() || closing_)) {
      write_frame();
    }
  }

  void write_frame() {
    if (!outgoing_.empty()) {
      socket_.async_write(asio::buffer(outgoing_.front()),
                          [self = shared_from_this()](Error error, std::size_t) {
                            if (error) {
                              self->closing_ = true;
                              self->session_.reset();
                              return;
                            }
                            self->outgoing_.pop_front();
                            self->write_frame();
                          });
    } else if (closing_) {
      socket_.async_close(close_code_, [self = shared_from_this()](Error) {});
    }
  }

  ws::stream<beast::tcp_stream> socket_;
  const Resources& resources_;
  const std::string& authority_;
  std::uint64_t& last_guest_;
  std::shared_ptr<wave::app::Garden> garden_;
  std::optional<wave::app::GardenSession> session_;
  beast::flat_buffer buffer_{wave::wire::max_frame_bytes + 1};
#ifdef WAVE_HOST_DEVELOPMENT
  http::request_parser<http::string_body> parser_;
#else
  http::request_parser<http::empty_body> parser_;
#endif
  http::response<http::string_body> response_;
  std::deque<wave::wire::Bytes> outgoing_;
  bool upgraded_ = false;
  bool closing_ = false;
  ws::close_code close_code_ = ws::close_code::protocol_error;
};

class Host {
 public:
  Host(asio::io_context& io, unsigned short port, Resources resources, const std::string& database,
       std::optional<std::uint32_t> craft_roll = {})
      : acceptor_(io, {asio::ip::address_v4::loopback(), port}), resources_(std::move(resources)),
        authority_("localhost:" + std::to_string(acceptor_.local_endpoint().port())), timer_(io) {
    std::shared_ptr<wave::store::Store> store;
    if (!database.empty()) {
      wave::store::Options options;
#ifdef WAVE_HOST_DEVELOPMENT
      options.allow_debug_inventory = true;
#endif
#ifdef WAVE_HOST_TESTING
      if (craft_roll) {
        options.random_word = [value = *craft_roll] { return value; };
      }
#else
      (void)craft_roll;
#endif
      store = std::make_shared<wave::store::Store>(database, std::move(options));
    }
#ifdef WAVE_HOST_TESTING
    if (!store) {
      garden_ = std::make_shared<wave::app::Garden>(
          wave::fixtures::wire_garden_rules(), 20221030,
          std::vector<std::vector<wave::sim::Petal>>{
              std::vector<wave::sim::Petal>(5, wave::sim::Petal::rose),
              std::vector<wave::sim::Petal>(5, wave::sim::Petal::basic)});
    } else {
      garden_ = std::make_shared<wave::app::Garden>(
          wave::sim::garden_rules(), 20221030, std::vector<std::vector<wave::sim::Petal>>{}, store);
    }
#else
    garden_ = std::make_shared<wave::app::Garden>(
        wave::sim::garden_rules(), 20221030, std::vector<std::vector<wave::sim::Petal>>{}, store);
#endif
    tick();
  }

  void accept() {
    acceptor_.async_accept([this](Error error, tcp::socket socket) {
      if (error) {
        return;
      }
      std::erase_if(connections_, [](const auto& entry) { return entry.expired(); });
      if (connections_.size() < 32) {
        auto connection = std::make_shared<Connection>(std::move(socket), resources_, authority_,
                                                       last_guest_, garden_);
        connections_.push_back(connection);
        connection->start();
      }
      accept();
    });
  }

  const std::string& authority() const { return authority_; }
  void drain_storage() { garden_->drain_storage(); }

 private:
  void tick() {
    timer_.expires_after(std::chrono::milliseconds(25));
    timer_.async_wait([this](Error error) {
      if (error) {
        return;
      }
#ifndef WAVE_HOST_TESTING
      garden_->step();
#endif
      garden_->poll_storage();
      if (++ticks_ % 4 == 0)
        for (const auto& weak : connections_) {
          if (auto connection = weak.lock())
            connection->publish();
        }
      tick();
    });
  }
  tcp::acceptor acceptor_;
  Resources resources_;
  std::string authority_;
  std::uint64_t last_guest_ = 0;
  std::shared_ptr<wave::app::Garden> garden_;
  asio::steady_timer timer_;
  std::uint64_t ticks_ = 0;
  std::vector<std::weak_ptr<Connection>> connections_;
};
}  // namespace

int main(int argc, char** argv) {
  try {
    if (argc < 3 || argc > 5) {
      throw std::runtime_error("Usage: wave_host WEB_ROOT PORT [DATABASE]");
    }
    const std::string_view argument = argv[2];
    unsigned short port = 0;
    const auto [end, error] = std::from_chars(argument.begin(), argument.end(), port);
    if (error != std::errc{} || end != argument.end()) {
      throw std::runtime_error("Invalid port");
    }
    asio::io_context io;
    std::optional<std::uint32_t> craft_roll;
#ifdef WAVE_HOST_TESTING
    if (argc > 4) {
      std::uint32_t value = 0;
      const std::string_view argument = argv[4];
      const auto [end, error] = std::from_chars(argument.begin(), argument.end(), value);
      if (error != std::errc{} || end != argument.end()) {
        throw std::runtime_error("Invalid fixture RNG word");
      }
      craft_roll = value;
    }
#else
    if (argc > 4) {
      throw std::runtime_error("Unexpected argument");
    }
#endif
    Host host(io, port, load(argv[1]), argc > 3 ? argv[3] : "", craft_roll);
    asio::signal_set signals(io, SIGINT, SIGTERM);
    signals.async_wait([&](Error, int) {
      // Drain while connections and their profile callbacks still exist. Some
      // async HTTP callbacks retain Garden, so destructor-only draining is late.
      host.drain_storage();
      io.stop();
    });
    host.accept();
    std::cout << "http://" << host.authority() << '/' << std::endl;
    io.run();
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
