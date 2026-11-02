#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>
namespace florr::server {
// Fixed labels, no per-IP/nickname/token cardinality or untrusted log strings.
enum class CloseCause : std::size_t { Normal, Http, Timeout, Read, Write, Protocol, SlowConsumer, Stopping, Count };
struct TickSample {
  std::uint64_t tick=0;
  std::uint32_t micros=0;
  std::uint32_t cpuMicros=0;
};
struct Metrics {
  std::uint64_t accepted=0,rejected=0,teardowns=0,joins=0,resumes=0,leaves=0;
  std::uint64_t ticks=0,overloads=0,discardedWallMs=0,rateRejected=0,bytesSent=0,maxTickMicros=0;
  std::uint64_t connections=0,pending=0,rooms=0,players=0,entities=0;
  std::uint64_t snapshotBytes=0,snapshotMessages=0,maxQueuedWriteBytes=0;
  std::uint64_t maxRoomEntities=0,maxRoomPlayers=0,maxEventLoopLagMs=0;
  std::uint64_t roomTicksOver50ms=0,roundsOver50ms=0;
  std::vector<TickSample> roomTickSamples,roundSamples,eventLoopLagSamples;
  std::array<std::uint64_t,static_cast<std::size_t>(CloseCause::Count)> closed{};
  void record_room_tick(std::uint64_t micros,std::uint64_t cpuMicros,std::uint64_t tick);
  void record_round(std::uint64_t micros,std::uint64_t cpuMicros,std::uint64_t tick);
  void record_event_loop_lag(std::uint64_t micros,std::uint64_t tick);
  // detail=true is an internal diagnostics view used by the capacity harness.
  std::string json(bool detail=false) const;
};
} // namespace florr::server
