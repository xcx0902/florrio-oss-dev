#include "florr/server/metrics.hpp"
#include <algorithm>
#include <sstream>
#include <sys/resource.h>
namespace florr::server {
namespace {
struct ProcessUsage {
  std::uint64_t rssBytes = 0;
  std::uint64_t cpuMicros = 0;
};
ProcessUsage process_usage() {
  struct rusage usage{};
  if (getrusage(RUSAGE_SELF, &usage) != 0) {
    return {};
  }
  const auto micros = [](const timeval& value) {
    return static_cast<std::uint64_t>(value.tv_sec) * 1000000U +
           static_cast<std::uint64_t>(value.tv_usec);
  };
#ifdef __APPLE__
  const auto rss = static_cast<std::uint64_t>(usage.ru_maxrss);
#else
  const auto rss = static_cast<std::uint64_t>(usage.ru_maxrss) * 1024U;
#endif
  return {rss, micros(usage.ru_utime) + micros(usage.ru_stime)};
}

constexpr std::size_t kMaxSamples = 200000;
std::uint32_t percentile(const std::vector<std::uint32_t>& values, std::uint32_t p) {
  if (values.empty()) {
    return 0;
  }
  auto sorted = values;
  std::sort(sorted.begin(), sorted.end());
  const auto rank = (static_cast<std::uint64_t>(p) * sorted.size() + 99) / 100;
  const auto index =
      std::min<std::size_t>(sorted.size() - 1, rank ? static_cast<std::size_t>(rank - 1) : 0);
  return sorted[index];
}
void append_summary(std::ostringstream& o, const char* name,
                    const std::vector<std::uint32_t>& values) {
  o << '"' << name << "\":{\"count\":" << values.size() << ",\"p50\":" << percentile(values, 50)
    << ",\"p95\":" << percentile(values, 95) << ",\"p99\":" << percentile(values, 99)
    << ",\"max\":" << (values.empty() ? 0 : *std::max_element(values.begin(), values.end())) << '}';
}
std::vector<std::uint32_t> micros(const std::vector<TickSample>& samples) {
  std::vector<std::uint32_t> values;
  values.reserve(samples.size());
  for (const auto& sample : samples) {
    values.push_back(sample.micros);
  }
  return values;
}
}  // namespace
void Metrics::record_room_tick(std::uint64_t micros, std::uint64_t cpuMicros, std::uint64_t tick) {
  if (roomTickSamples.size() < kMaxSamples) {
    roomTickSamples.push_back(
        {tick, static_cast<std::uint32_t>(std::min<std::uint64_t>(micros, 0xffffffffU)),
         static_cast<std::uint32_t>(std::min<std::uint64_t>(cpuMicros, 0xffffffffU))});
  }
  if (micros > 50000) {
    ++roomTicksOver50ms;
  }
}
void Metrics::record_round(std::uint64_t micros, std::uint64_t cpuMicros, std::uint64_t tick) {
  if (roundSamples.size() < kMaxSamples) {
    roundSamples.push_back(
        {tick, static_cast<std::uint32_t>(std::min<std::uint64_t>(micros, 0xffffffffU)),
         static_cast<std::uint32_t>(std::min<std::uint64_t>(cpuMicros, 0xffffffffU))});
  }
  maxTickMicros = std::max(maxTickMicros, micros);
  if (micros > 50000) {
    ++roundsOver50ms;
  }
}
void Metrics::record_event_loop_lag(std::uint64_t micros, std::uint64_t tick) {
  const auto clamped = static_cast<std::uint32_t>(std::min<std::uint64_t>(micros, 0xffffffffU));
  if (eventLoopLagSamples.size() < kMaxSamples) {
    eventLoopLagSamples.push_back({tick, clamped});
  }
  maxEventLoopLagMs = std::max(maxEventLoopLagMs, static_cast<std::uint64_t>(clamped / 1000));
}
std::string Metrics::json(bool detail) const {
  std::ostringstream o;
  o << "{\"connections\":" << connections << ",\"pending\":" << pending << ",\"rooms\":" << rooms
    << ",\"players\":" << players << ",\"entities\":" << entities << ",\"accepted\":" << accepted
    << ",\"rejected\":" << rejected << ",\"teardowns\":" << teardowns << ",\"joins\":" << joins
    << ",\"resumes\":" << resumes << ",\"leaves\":" << leaves << ",\"ticks\":" << ticks
    << ",\"overloads\":" << overloads << ",\"discardedWallMs\":" << discardedWallMs
    << ",\"rateRejected\":" << rateRejected << ",\"bytesSent\":" << bytesSent
    << ",\"snapshotBytes\":" << snapshotBytes << ",\"snapshotMessages\":" << snapshotMessages
    << ",\"maxQueuedWriteBytes\":" << maxQueuedWriteBytes
    << ",\"maxRoomEntities\":" << maxRoomEntities << ",\"maxRoomPlayers\":" << maxRoomPlayers
    << ",\"maxEventLoopLagMs\":" << maxEventLoopLagMs
    << ",\"roomTicksOver50ms\":" << roomTicksOver50ms << ",\"roundsOver50ms\":" << roundsOver50ms
    << ",\"maxTickMicros\":" << maxTickMicros;
  const auto usage = process_usage();
  o << ",\"process\":{\"rssBytes\":" << usage.rssBytes << ",\"cpuMicros\":" << usage.cpuMicros
    << '}';
  o << ',';
  append_summary(o, "roomTickMicros", micros(roomTickSamples));
  o << ',';
  append_summary(o, "roundMicros", micros(roundSamples));
  o << ',';
  append_summary(o, "eventLoopLagMicros", micros(eventLoopLagSamples));
  if (detail) {
    o << ",\"roomTickSamples\":[";
    for (std::size_t i = 0; i < roomTickSamples.size(); ++i) {
      if (i) {
        o << ',';
      }
      o << '[' << roomTickSamples[i].tick << ',' << roomTickSamples[i].micros << ','
        << roomTickSamples[i].cpuMicros << ']';
    }
    o << "],\"roundSamples\":[";
    for (std::size_t i = 0; i < roundSamples.size(); ++i) {
      if (i) {
        o << ',';
      }
      o << '[' << roundSamples[i].tick << ',' << roundSamples[i].micros << ','
        << roundSamples[i].cpuMicros << ']';
    }
    o << "]";
    if (detail) {
      o << ",\"eventLoopLagSamples\":[";
      for (std::size_t i = 0; i < eventLoopLagSamples.size(); ++i) {
        if (i) {
          o << ',';
        }
        o << '[' << eventLoopLagSamples[i].tick << ',' << eventLoopLagSamples[i].micros << ']';
      }
      o << ']';
    }
  }
  o << ",\"closed\":{";
  constexpr const char* labels[] = {"NORMAL", "HTTP",     "TIMEOUT",       "READ",
                                    "WRITE",  "PROTOCOL", "SLOW_CONSUMER", "STOPPING"};
  for (std::size_t i = 0; i < closed.size(); ++i) {
    if (i) {
      o << ',';
    }
    o << '"' << labels[i] << "\":" << closed[i];
  }
  o << "}}";
  return o.str();
}
}  // namespace florr::server
