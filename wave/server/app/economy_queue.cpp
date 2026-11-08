#include "app/economy_queue.hpp"

#include <stdexcept>
#include <utility>

namespace wave::app {

EconomyQueue::EconomyQueue(std::size_t capacity) : capacity_(capacity) {
  if (!capacity_) {
    throw std::invalid_argument("Economy queue capacity must be positive");
  }
  worker_ = std::thread([this] { run(); });
}

EconomyQueue::~EconomyQueue() {
  {
    std::lock_guard lock(mutex_);
    stopping_ = true;
  }
  changed_.notify_all();
  worker_.join();
}

bool EconomyQueue::submit(Work work, Completion completion) {
  std::lock_guard lock(mutex_);
  if (stopping_ || pending_ == capacity_) {
    return false;
  }
  work_.push_back({std::move(work), std::move(completion), {}});
  ++pending_;
  changed_.notify_all();
  return true;
}

void EconomyQueue::run() {
  for (;;) {
    Job job;
    {
      std::unique_lock lock(mutex_);
      changed_.wait(lock, [this] { return stopping_ || !work_.empty(); });
      if (work_.empty()) {
        return;
      }
      job = std::move(work_.front());
      work_.pop_front();
    }
    try {
      job.work();
    } catch (...) {
      job.error = std::current_exception();
    }
    job.work = {};
    {
      std::lock_guard lock(mutex_);
      completed_.push_back(std::move(job));
    }
    changed_.notify_all();
  }
}

std::size_t EconomyQueue::poll() {
  std::deque<Job> completed;
  {
    std::lock_guard lock(mutex_);
    completed.swap(completed_);
    pending_ -= completed.size();
  }
  for (auto& job : completed) {
    job.completion(job.error);
  }
  return completed.size();
}

bool EconomyQueue::wait(std::chrono::milliseconds timeout) {
  std::unique_lock lock(mutex_);
  return changed_.wait_for(lock, timeout, [this] { return !completed_.empty() || pending_ == 0; });
}

std::size_t EconomyQueue::pending() const {
  std::lock_guard lock(mutex_);
  return pending_;
}

}  // namespace wave::app
