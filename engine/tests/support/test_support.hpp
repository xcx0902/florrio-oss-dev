#pragma once
#include <cstdio>

namespace engine::test {
inline int failures = 0;
inline int testsRun = 0;
inline int testsFailed = 0;
inline bool tapOutput = false;

inline void runTest(const char* name, void (*body)()) {
  const int before = failures;
  body();
  ++testsRun;
  const bool passed = failures == before;
  if (!passed) ++testsFailed;
  if (tapOutput) std::printf("%s %d - %s\n", passed ? "ok" : "not ok", testsRun, name);
}
} // namespace engine::test

#define CHECK(condition) do { \
  if (!(condition)) { \
    std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
    ++engine::test::failures; \
  } \
} while (false)
