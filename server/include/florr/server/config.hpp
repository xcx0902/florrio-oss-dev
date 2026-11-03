#pragma once
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

// name, default, inclusive minimum, inclusive maximum. Protocol/physics limits
// have equal bounds: changing them requires changing the schema/contract first.
#define FLORR_SERVER_NUMBERS(X)                            \
  X(tickMs, 50, 50, 50)                                    \
  X(snapshotEveryTicks, 1, 1, 1)                           \
  X(inputSendMs, 50, 1, 1000)                              \
  X(initialMaxPlayersPerRoom, 2, 1, 8)                     \
  X(certificationPlayersPerRoom, 8, 8, 8)                  \
  X(certificationRooms, 2, 2, 2)                           \
  X(maxRooms, 2, 1, 64)                                    \
  X(maxConnections, 64, 1, 4096)                           \
  X(maxPendingHandshakes, 16, 1, 4096)                     \
  X(inputTtlTicks, 5, 5, 5)                                \
  X(reconnectGraceTicks, 200, 1, 12000)                    \
  X(emptyRoomTtlTicks, 1200, 1, 72000)                     \
  X(maxCatchupTicks, 4, 1, 4)                              \
  X(spawnCooldownTicks, 50, 50, 50)                        \
  X(corpseTicks, 20, 20, 20)                               \
  X(nicknameMaxUtf8Bytes, 128, 128, 128)                   \
  X(nicknameMaxCodePoints, 32, 32, 32)                     \
  X(roomIdMaxUtf8Bytes, 64, 64, 64)                        \
  X(chatMaxUtf8Bytes, 512, 512, 512)                       \
  X(chatMaxCodePoints, 256, 256, 256)                      \
  X(maxClientFrameBytes, 4096, 4096, 4096)                 \
  X(maxServerFrameBytes, 1048576, 1048576, 1048576)        \
  X(maxSnapshotEntities, 16384, 16384, 16384)              \
  X(maxSnapshotEvents, 4096, 4096, 4096)                   \
  X(maxEntityFieldBytes, 2048, 2048, 2048)                 \
  X(maxEntityFieldRecords, 16, 16, 16)                     \
  X(counterDrainAt, 4294966271U, 4294966271U, 4294966271U) \
  X(maxQueuedWriteBytes, 1048576, 1048576, 1048576)        \
  X(maxQueuedCommands, 128, 128, 128)                      \
  X(maxCommandsPerTick, 4, 4, 4)                           \
  X(maxFutureInputTicks, 2, 2, 2)                          \
  X(maxPastInputTicks, 5, 5, 5)                            \
  X(maxSequenceAdvance, 1024, 1024, 1024)                  \
  X(commandResultWindow, 128, 128, 128)                    \
  X(resumeTokenBytes, 32, 32, 32)                          \
  X(listenPort, 8787, 1, 65535)                            \
  X(httpHeaderMaxBytes, 8192, 512, 65536)                  \
  X(httpTimeoutMs, 5000, 1, 60000)                         \
  X(websocketHandshakeTimeoutMs, 5000, 1, 60000)           \
  X(helloTimeoutMs, 5000, 1, 60000)                        \
  X(pingIntervalMs, 5000, 1, 60000)                        \
  X(pongTimeoutMs, 15000, 1, 180000)                       \
  X(writeTimeoutMs, 10000, 1, 60000)                       \
  X(closeTimeoutMs, 5000, 1, 60000)                        \
  X(shutdownDrainMs, 5000, 1, 60000)                       \
  X(inputRatePerSecond, 40, 1, 1000)                       \
  X(inputBurst, 10, 1, 1000)                               \
  X(commandRatePerSecond, 10, 1, 100)                      \
  X(commandBurst, 20, 1, 128)                              \
  X(chatRatePerSecond, 1, 1, 10)                           \
  X(chatBurst, 3, 1, 20)

namespace florr::server {
struct Config {
#define FIELD(name, value, min, max) std::uint32_t name = value;
  FLORR_SERVER_NUMBERS(FIELD)
#undef FIELD
  std::string listenAddress = "127.0.0.1", websocketPath = "/ws";
  bool perMessageCompression = false, allowMissingOrigin = false;
  std::vector<std::string> allowedOrigins, trustedProxies;
};
// Complete flat JSON object, strict types, unique/known keys, bounded allocation.
[[nodiscard]] Config parse_config(std::string_view json);
[[nodiscard]] Config load_config(const std::string& path);
void validate_config(const Config& config);
[[nodiscard]] bool allows_origin(const Config& config, std::string_view origin, bool present);
}  // namespace florr::server
