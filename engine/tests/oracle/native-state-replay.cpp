/** Native simulation replay only. Input is captured production packets; output
 * is each tick's authoritative 48-byte state records, never client snapshots. */
#include "engine/net/worker_api.hpp"
#include "engine/net/packet_key.hpp"
#include <array>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

extern "C" void sp_server_debug_record_all_contacts(std::uint32_t);
extern "C" std::uint32_t sp_server_debug_contact_count();
extern "C" float sp_server_debug_contact_field(std::uint32_t, std::uint32_t);

namespace {
std::uint32_t read_u32(std::istream& input) {
  std::array<unsigned char, 4> bytes{};
  if (!input.read(reinterpret_cast<char*>(bytes.data()), bytes.size())) std::exit(2);
  return bytes[0] | (std::uint32_t(bytes[1]) << 8) | (std::uint32_t(bytes[2]) << 16) | (std::uint32_t(bytes[3]) << 24);
}
void write_u32(std::uint32_t value) {
  const std::array<unsigned char, 4> bytes{static_cast<unsigned char>(value), static_cast<unsigned char>(value >> 8),
    static_cast<unsigned char>(value >> 16), static_cast<unsigned char>(value >> 24)};
  std::cout.write(reinterpret_cast<const char*>(bytes.data()), bytes.size());
}
struct Packet { std::uint32_t at; std::vector<std::uint8_t> bytes; };
}

int main(int argc, char** argv) {
  if (argc != 3) return 2;
  const auto ticks = static_cast<std::uint32_t>(std::strtoul(argv[2], nullptr, 10));
  if (ticks == 0U || ticks > 100000U) return 2;
  std::ifstream input(argv[1], std::ios::binary);
  const auto packet_count = read_u32(input);
  if (packet_count > 100000U) return 2;
  std::vector<Packet> packets;
  for (std::uint32_t index = 0; index < packet_count; ++index) {
    const auto at = read_u32(input), size = read_u32(input);
    if (size > 65536U) return 2;
    Packet packet{at, std::vector<std::uint8_t>(size)};
    if (!input.read(reinterpret_cast<char*>(packet.bytes.data()), size)) return 2;
    packets.push_back(std::move(packet));
  }
  engine::WorkerApi api;
  api.init(true);
  const char* contact_tick_text = std::getenv("R04_CONTACT_TICK");
  const auto contact_tick = contact_tick_text == nullptr ? 0U
    : static_cast<std::uint32_t>(std::strtoul(contact_tick_text, nullptr, 10));
  std::size_t next = 0;
  for (std::uint32_t tick = 1; tick <= ticks; ++tick) {
    while (next < packets.size() && packets[next].at <= tick * 50U) {
      if (!api.send(packets[next].bytes, engine::net::kPacketXorKey)) return 3;
      ++next;
    }
    if (tick == contact_tick) sp_server_debug_record_all_contacts(1U);
    api.think();
    if (tick == contact_tick) {
      std::cerr << "{\"tick\":" << tick << ",\"contacts\":[";
      for (std::uint32_t index = 0; index < sp_server_debug_contact_count(); ++index) {
        const auto field = [index](std::uint32_t number) { return sp_server_debug_contact_field(index, number); };
        const auto a = static_cast<std::uint32_t>(field(1)) | (static_cast<std::uint32_t>(field(12)) << 16);
        const auto b = static_cast<std::uint32_t>(field(0)) | (static_cast<std::uint32_t>(field(11)) << 16);
        if (index != 0U) std::cerr << ',';
        std::cerr << "{\"a\":" << a << ",\"b\":" << b
          << ",\"ax\":" << field(5) << ",\"ay\":" << field(6)
          << ",\"bx\":" << field(3) << ",\"by\":" << field(4) << '}';
      }
      std::cerr << "]}\n";
      sp_server_debug_record_all_contacts(0U);
    }
    const auto count = api.dump_state(nullptr, 0U);
    std::vector<std::uint8_t> records(count * 48U);
    if (api.dump_state(records.data(), count) != count) return 4;
    write_u32(tick); write_u32(api.world().random().state());
    write_u32(api.world().player().raw); write_u32(count);
    std::cout.write(reinterpret_cast<const char*>(records.data()), records.size());
  }
  return std::cout.good() ? 0 : 5;
}
