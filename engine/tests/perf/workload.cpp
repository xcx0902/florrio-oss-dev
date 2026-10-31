#include "engine/net/worker_api.hpp"
#include <chrono>
#include <cstdio>
#include <cstdint>
int main() {
  engine::WorkerApi api;
  api.init(true);
  const auto start = std::chrono::steady_clock::now();
  std::uint64_t bytes = 0;
  for (std::uint32_t tick = 1; tick <= 600U; ++tick) {
    api.think();
    bytes += api.domain_snapshot_bytes(tick).size();
  }
  const auto elapsed = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
  if (api.world().tick() != 600U || api.world().entities().active_count() == 0U) return 1;
  std::printf("{\"ticks\":600,\"entities\":%zu,\"snapshotBytes\":%llu,\"elapsedMs\":%.3f}\n", api.world().entities().active_count(), static_cast<unsigned long long>(bytes), elapsed);
}
