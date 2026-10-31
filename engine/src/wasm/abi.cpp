#include "engine/abi.h"
#include "engine/net/packet_key.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/petals.hpp"
#include <cmath>
#include <cstddef>
#include <new>
#include <span>
#include <vector>

namespace {

// The standalone wasm module has no CRT constructor pass. Construct the API
// explicitly on first use instead of relying on a global C++ constructor.
alignas(engine::WorkerApi) unsigned char g_api_storage[sizeof(engine::WorkerApi)];
engine::WorkerApi* g_api = nullptr;
std::vector<std::vector<std::uint8_t>> g_flushed;
std::uint32_t g_snapshot_sequence = 0;


engine::WorkerApi& api() {
  if (g_api == nullptr) g_api = new (g_api_storage) engine::WorkerApi();
  return *g_api;
}

} // namespace

extern "C" void sp_server_init(void) {
  if (g_api != nullptr) g_api->~WorkerApi();
  g_api = new (g_api_storage) engine::WorkerApi();
  g_api->init(true);
  g_flushed.clear();
  g_snapshot_sequence = 0;
}

extern "C" void sp_server_send(const std::uint8_t* data, std::uint32_t length) {
  if (data == nullptr || length == 0U) return;
  (void)api().send(std::span<const std::uint8_t>(data, length),
                   std::span<const std::uint8_t>(engine::net::kPacketXorKey));
}

extern "C" void sp_server_think(void) {
  api().think();
  api().enqueue_domain_snapshot(++g_snapshot_sequence);
}

extern "C" void sp_server_flush(void) {
  g_flushed.clear();
  for (auto& packet : api().flush()) g_flushed.push_back(std::move(packet.payload));
}

extern "C" std::uint32_t sp_server_entity_count(void) {
  return static_cast<std::uint32_t>(api().world().entities().active_count());
}

extern "C" std::uint32_t sp_server_output_count(void) {
  return static_cast<std::uint32_t>(g_flushed.size());
}

extern "C" const std::uint8_t* sp_server_output_data(std::uint32_t index) {
  if (index >= g_flushed.size()) return nullptr;
  return g_flushed[index].data();
}

extern "C" std::uint32_t sp_server_output_size(std::uint32_t index) {
  if (index >= g_flushed.size()) return 0U;
  return static_cast<std::uint32_t>(g_flushed[index].size());
}

namespace engine { WorkerApi& current_worker_api() { return api(); } }
