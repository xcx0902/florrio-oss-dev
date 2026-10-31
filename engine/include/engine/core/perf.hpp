#pragma once
// Benchmark-only instrumentation. Production compilation removes every hook.
#ifdef ENGINE_PERF
#include <array>
#include <chrono>
#include <cstdint>
#include <cstring>
namespace engine::perf {
struct Metrics {
  std::uint64_t visits=0, builds=0, inserts=0, updates=0, queries=0, candidates=0, contacts=0, bounds=0, fields=0;
  std::uint64_t allocations=0, live=0, peak=0;
  std::array<double,32> phase_ms{};
  std::array<const char*,32> phase_names{};
  std::size_t phases=0;
  std::chrono::steady_clock::time_point phase_at{};
};
inline Metrics* current = nullptr;
inline void phase_start() { if(current) current->phase_at=std::chrono::steady_clock::now(); }
inline void phase(const char* name) {
  if(!current) return;
  const auto now=std::chrono::steady_clock::now();
  std::size_t i=0; while(i<current->phases && std::strcmp(name,current->phase_names[i])) ++i;
  if(i<32) { current->phase_names[i]=name; if(i==current->phases) ++current->phases;
    current->phase_ms[i]+=std::chrono::duration<double,std::milli>(now-current->phase_at).count(); }
  current->phase_at=now;
}
}
#define PERF_ADD(field, value) do { if(engine::perf::current) engine::perf::current->field += (value); } while(false)
#define PERF_PHASE(name) engine::perf::phase(name)
#define PERF_START() engine::perf::phase_start()
#else
#define PERF_ADD(field, value) do {} while(false)
#define PERF_PHASE(name) do {} while(false)
#define PERF_START() do {} while(false)
#endif
