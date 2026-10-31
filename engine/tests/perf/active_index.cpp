#include "engine/model/entity_pool.hpp"
#include "reference_pool.hpp"
#include <chrono>
#include <cstdio>
#include <cstdint>
#include <vector>
using Clock=std::chrono::steady_clock;
static volatile std::uint64_t sink=0;
struct Sample { double elapsed=0; std::vector<double> times; };
struct Pair { Sample array,indexed; };
// Both dense paths receive the exact same std::array specialization. Keep its
// reduction in one function: duplicating it into the two pool templates lets
// LLVM select branchless vs branchy reductions, confounding index overhead
// with different code for the same array traversal. Sparse ranges retain their
// own ordered-bitset specialization; selection and churn remain measured.
template<class Slots> [[gnu::noinline]] static std::uint64_t sum_active(const Slots& slots) {
  std::uint64_t sum=0;
  for(const auto& e:slots)if(e.active)sum+=e.handle.raw;
  return sum;
}
template<class Pool> [[gnu::always_inline]] static void scan(Pool& pool,bool churn) {
  if(churn) {const auto h=pool.allocate();if(h)(void)pool.release(*h);}
  std::uint64_t sum=0;
  if constexpr(requires{pool.active_entities();}) pool.with_ordered_slots([&](auto&& slots) {
    sum=sum_active(slots);
  });
  else sum=sum_active(pool.entities());
  sink=sum;
}
static Pair sample(engine::ReferenceEntityPool& original,engine::EntityPool& indexedPool,bool churn,int order) {
  Pair pair;pair.array.times.reserve(1000);pair.indexed.times.reserve(1000);
  for(int repeat=0;repeat<1000;++repeat) {
    // Pair adjacent traversals and alternate their order to avoid systematic
    // cache/frequency bias between two long sequential batches.
    for(int half=0;half<2;++half) {
      const bool indexed=(repeat+half+order)%2;
      const auto at=Clock::now();
      if(indexed)scan(indexedPool,churn);else scan(original,churn);
      const auto elapsed=std::chrono::duration<double,std::milli>(Clock::now()-at).count();
      auto& target=indexed?pair.indexed:pair.array;
      target.times.push_back(elapsed);target.elapsed+=elapsed;
    }
  }
  return pair;
}
int main() {
  std::puts("[");bool first=true;
  for(const auto count:{64,8192,16380})for(const bool churn:{false,true}) {
    engine::ReferenceEntityPool original;engine::EntityPool pool;
    for(int i=0;i<count;++i){(void)original.allocate();(void)pool.allocate();}
    (void)sample(original,pool,churn,0);
    for(int repeat=0;repeat<5;++repeat) {
      const auto [array,indexed]=sample(original,pool,churn,repeat);
      std::printf("%s{\"active\":%d,\"churn\":%s,\"arrayMs\":%.6f,\"indexedMs\":%.6f",first?"":",\n",count,churn?"true":"false",array.elapsed,indexed.elapsed);
      std::printf(",\"arraySamplesMs\":[");
      for(std::size_t i=0;i<array.times.size();++i)std::printf("%s%.6f",i?",":"",array.times[i]);
      std::printf("],\"indexedSamplesMs\":[");
      for(std::size_t i=0;i<indexed.times.size();++i)std::printf("%s%.6f",i?",":"",indexed.times[i]);
      std::printf("]}");first=false;
    }
  }
  std::puts("\n]");
}
