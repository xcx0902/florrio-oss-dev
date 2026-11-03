#include "florr/server/config.hpp"
#include <boost/asio/ip/address.hpp>
#include <algorithm>
#include <charconv>
#include <fstream>
#include <iterator>
#include <set>
#include <stdexcept>

namespace florr::server {
namespace {
[[noreturn]] void invalid() {
  throw std::invalid_argument("invalid server configuration");
}
// Configuration strings are deliberately ASCII (IP addresses, paths, origins).
// JSON escapes are accepted for ASCII; non-ASCII has no meaning in these keys.
class Reader {
 public:
  explicit Reader(std::string_view data) : data_(data) {
    if (data.size() > 65536) {
      invalid();
    }
  }
  bool take(char c) {
    ws();
    if (pos_ < data_.size() && data_[pos_] == c) {
      ++pos_;
      return true;
    }
    return false;
  }
  void need(char c) {
    if (!take(c)) {
      invalid();
    }
  }
  bool done() {
    ws();
    return pos_ == data_.size();
  }
  std::string string() {
    need('"');
    std::string out;
    while (pos_ < data_.size()) {
      auto c = static_cast<unsigned char>(data_[pos_++]);
      if (c == '"') {
        return out;
      }
      if (c == '\\') {
        if (pos_ == data_.size()) {
          invalid();
        }
        c = static_cast<unsigned char>(data_[pos_++]);
        if (c == 'u') {
          unsigned value = 0;
          for (unsigned i = 0; i < 4; ++i) {
            if (pos_ == data_.size()) {
              invalid();
            }
            const auto h = data_[pos_++];
            value *= 16;
            if (h >= '0' && h <= '9') {
              value += h - '0';
            } else if (h >= 'a' && h <= 'f') {
              value += h - 'a' + 10;
            } else if (h >= 'A' && h <= 'F') {
              value += h - 'A' + 10;
            } else {
              invalid();
            }
          }
          if (value < 32 || value > 126) {
            invalid();
          }
          c = static_cast<unsigned char>(value);
        } else if (c != '"' && c != '\\' && c != '/') {
          invalid();
        }
      }
      if (c < 32 || c > 126 || out.size() >= 1024) {
        invalid();
      }
      out.push_back(static_cast<char>(c));
    }
    invalid();
  }
  std::uint32_t number() {
    ws();
    const auto start = pos_;
    while (pos_ < data_.size() && data_[pos_] >= '0' && data_[pos_] <= '9') {
      ++pos_;
    }
    if (start == pos_ || (data_[start] == '0' && pos_ - start > 1)) {
      invalid();
    }
    std::uint32_t value = 0;
    const auto [end, error] = std::from_chars(data_.data() + start, data_.data() + pos_, value);
    if (error != std::errc{} || end != data_.data() + pos_) {
      invalid();
    }
    return value;
  }
  bool boolean() {
    ws();
    if (data_.substr(pos_, 4) == "true") {
      pos_ += 4;
      return true;
    }
    if (data_.substr(pos_, 5) == "false") {
      pos_ += 5;
      return false;
    }
    invalid();
  }
  std::vector<std::string> strings() {
    need('[');
    std::vector<std::string> out;
    if (take(']')) {
      return out;
    }
    do {
      if (out.size() >= 64) {
        invalid();
      }
      out.push_back(string());
    } while (take(','));
    need(']');
    return out;
  }

 private:
  void ws() {
    while (pos_ < data_.size() && (data_[pos_] == ' ' || data_[pos_] == '\n' ||
                                   data_[pos_] == '\r' || data_[pos_] == '\t')) {
      ++pos_;
    }
  }
  std::string_view data_;
  std::size_t pos_ = 0;
};
bool valid_origin(std::string_view origin) {
  auto offset = origin.starts_with("https://") ? 8U : origin.starts_with("http://") ? 7U : 0U;
  if (!offset || origin.size() <= offset || origin.size() > 512) {
    return false;
  }
  const auto authority = origin.substr(offset);
  if (authority.find_first_of("/@?#\\* \t\r\n") != std::string_view::npos) {
    return false;
  }
  auto host = authority;
  std::string_view port;
  if (host.starts_with('[')) {
    const auto end = host.find(']');
    if (end == std::string_view::npos) {
      return false;
    }
    boost::system::error_code ec;
    (void)boost::asio::ip::make_address(std::string(host.substr(1, end - 1)), ec);
    if (ec) {
      return false;
    }
    const auto rest = host.substr(end + 1);
    if (!rest.empty()) {
      if (!rest.starts_with(':')) {
        return false;
      }
      port = rest.substr(1);
      if (port.empty()) {
        return false;
      }
    }
  } else {
    const auto split = host.find(':');
    if (split != std::string_view::npos) {
      port = host.substr(split + 1);
      host = host.substr(0, split);
      if (port.empty()) {
        return false;
      }
    }
    if (host.empty()) {
      return false;
    }
    for (char c : host) {
      if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
            c == '.' || c == '-')) {
        return false;
      }
    }
  }
  if (!port.empty()) {
    unsigned n = 0;
    const auto [p, e] = std::from_chars(port.data(), port.data() + port.size(), n);
    if (e != std::errc{} || p != port.data() + port.size() || !n || n > 65535) {
      return false;
    }
  }
  return true;
}
}
void validate_config(const Config& c) {
#define CHECK_NUMBER(name, value, min, max) \
  if (c.name < min || c.name > max)         \
    invalid();
  FLORR_SERVER_NUMBERS(CHECK_NUMBER)
#undef CHECK_NUMBER
  boost::system::error_code ec;
  (void)boost::asio::ip::make_address(c.listenAddress, ec);
  if (ec || c.websocketPath != "/ws" || c.perMessageCompression ||
      c.maxPendingHandshakes > c.maxConnections || c.pingIntervalMs >= c.pongTimeoutMs ||
      c.allowedOrigins.size() > 64 || c.trustedProxies.size() > 64) {
    invalid();
  }
  std::set<std::string> origins, proxies;
  for (const auto& origin : c.allowedOrigins) {
    if (!valid_origin(origin) || !origins.insert(origin).second) {
      invalid();
    }
  }
  for (const auto& proxy : c.trustedProxies) {
    (void)boost::asio::ip::make_address(proxy, ec);
    if (ec || !proxies.insert(proxy).second) {
      invalid();
    }
  }
}
Config parse_config(std::string_view json) {
  Reader r(json);
  r.need('{');
  Config c;
  std::set<std::string> seen;
  if (!r.take('}')) {
    do {
      const auto key = r.string();
      if (!seen.insert(key).second) {
        invalid();
      }
      r.need(':');
#define READ_NUMBER(name, value, min, max) \
  if (key == #name) {                      \
    c.name = r.number();                   \
    continue;                              \
  }
      FLORR_SERVER_NUMBERS(READ_NUMBER)
#undef READ_NUMBER
      if (key == "listenAddress") {
        c.listenAddress = r.string();
      } else if (key == "websocketPath") {
        c.websocketPath = r.string();
      } else if (key == "perMessageCompression") {
        c.perMessageCompression = r.boolean();
      } else if (key == "allowMissingOrigin") {
        c.allowMissingOrigin = r.boolean();
      } else if (key == "allowedOrigins") {
        c.allowedOrigins = r.strings();
      } else if (key == "trustedProxies") {
        c.trustedProxies = r.strings();
      } else {
        invalid();
      }
    } while (r.take(','));
    r.need('}');
  }
  // Requiring all keys prevents an accidental partial test config from becoming
  // a release default. No silent defaults for misspelled or omitted values.
  std::size_t expected = 6;
#define COUNT_NUMBER(name, value, min, max) ++expected;
  FLORR_SERVER_NUMBERS(COUNT_NUMBER)
#undef COUNT_NUMBER
  if (!r.done() || seen.size() != expected) {
    invalid();
  }
  validate_config(c);
  return c;
}
Config load_config(const std::string& path) {
  std::ifstream stream(path, std::ios::binary);
  if (!stream) {
    invalid();
  }
  std::string data(65537, '\0');
  stream.read(data.data(), static_cast<std::streamsize>(data.size()));
  data.resize(static_cast<std::size_t>(stream.gcount()));
  return parse_config(data);
}
bool allows_origin(const Config& c, std::string_view origin, bool present) {
  return present ? std::find(c.allowedOrigins.begin(), c.allowedOrigins.end(), origin) !=
                       c.allowedOrigins.end()
                 : c.allowMissingOrigin;
}
}  // namespace florr::server
