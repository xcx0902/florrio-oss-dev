#pragma once

#include "wire/bootstrap.hpp"

#include <string>

namespace wave::app {

enum class CloseReason { protocol_error, superseded };

struct Reply {
  std::vector<wire::Bytes> frames;
  bool close = false;
  CloseReason reason = CloseReason::protocol_error;
};

class BootstrapSession {
 public:
  explicit BootstrapSession(std::string id);
  Reply receive(wire::Bytes bytes);
  Reply reject();

 private:
  wire::Bootstrap wire_;
  std::string id_;
  std::uint32_t acknowledged_ = 0;
  std::uint32_t last_tick_ = 0;
  bool greeted_ = false;
};

}  // namespace wave::app
