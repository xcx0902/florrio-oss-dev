#pragma once
#include <algorithm>
#include <cstdint>

namespace florr::server {
// Integer monotonic milliseconds; callers inject the clock. Discarded wall time
// never increments a World counter or changes the simulation's fixed dt.
class FixedTickScheduler {
 public:
  FixedTickScheduler(std::uint64_t now,std::uint32_t step,std::uint32_t max)
    : next_(now+step),step_(step),max_(max) {}
  struct Due { std::uint32_t ticks; std::uint64_t discardedMs; bool overloaded; };
  Due poll(std::uint64_t now) {
    if(now<next_) return {0,0,false};
    const auto due=(now-next_)/step_+1;
    const auto ticks=static_cast<std::uint32_t>(std::min<std::uint64_t>(due,max_));
    const auto dropped=due-ticks;
    next_+=due*step_;
    return {ticks,dropped*step_,due>=max_};
  }
  std::uint64_t next() const {return next_;}
 private:
  std::uint64_t next_; std::uint32_t step_,max_;
};
class TokenBucket {
 public:
  TokenBucket(std::uint32_t rate,std::uint32_t burst,std::uint64_t now)
    : tokens_(burst),rate_(rate),burst_(burst),last_(now) {}
  bool consume(std::uint64_t now) {
    if(now>last_) {tokens_=std::min<double>(burst_,tokens_+static_cast<double>(now-last_)*rate_/1000);last_=now;}
    if(tokens_<1) return false;
    tokens_-=1; return true;
  }
 private:
  double tokens_; std::uint32_t rate_,burst_; std::uint64_t last_;
};
} // namespace florr::server
