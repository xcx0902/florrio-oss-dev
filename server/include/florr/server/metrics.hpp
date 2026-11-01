#pragma once
#include <array>
#include <cstdint>
#include <string>
namespace florr::server {
// Fixed labels, no per-IP/nickname/token cardinality or untrusted log strings.
enum class CloseCause : std::size_t { Normal, Http, Timeout, Read, Write, Protocol, SlowConsumer, Stopping, Count };
struct Metrics {
  std::uint64_t accepted=0,rejected=0,teardowns=0,joins=0,resumes=0,leaves=0;
  std::uint64_t ticks=0,overloads=0,discardedWallMs=0,rateRejected=0,bytesSent=0,maxTickMicros=0;
  std::uint64_t connections=0,pending=0,rooms=0,players=0;
  std::array<std::uint64_t,static_cast<std::size_t>(CloseCause::Count)> closed{};
  std::string json() const;
};
} // namespace florr::server
