#pragma once

#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <exception>
#include <functional>
#include <mutex>
#include <thread>

namespace wave::app {

// Work runs on one I/O thread. Completions run only when the room manager executor
// polls. The bound includes running work and unconsumed completions.
class EconomyQueue {
 public:
  using Work = std::function<void()>;
  using Completion = std::function<void(std::exception_ptr)>;
  explicit EconomyQueue(std::size_t capacity);
  ~EconomyQueue();
  EconomyQueue(const EconomyQueue&) = delete;
  EconomyQueue& operator=(const EconomyQueue&) = delete;
  bool submit(Work work, Completion completion);
  std::size_t poll();
  bool wait(std::chrono::milliseconds timeout);
  [[nodiscard]] std::size_t pending() const;
  [[nodiscard]] std::size_t capacity() const { return capacity_; }

 private:
  struct Job {
    Work work;
    Completion completion;
    std::exception_ptr error;
  };
  void run();
  const std::size_t capacity_;
  mutable std::mutex mutex_;
  std::condition_variable changed_;
  std::deque<Job> work_;
  std::deque<Job> completed_;
  std::size_t pending_ = 0;
  bool stopping_ = false;
  std::thread worker_;
};

}  // namespace wave::app
