#include "engine/net/multiplayer_wire.hpp"
#include "engine/net/generated_multiplayer.hpp"
#include "engine/net/generated_protocol.hpp"
#include <set>

namespace engine::net {
namespace {
bool whitespace(std::uint32_t cp) {
  return (cp >= 9 && cp <= 13) || cp == 32 || cp == 0x85 || cp == 0xa0 || cp == 0x1680 ||
         (cp >= 0x2000 && cp <= 0x200a) || cp == 0x2028 || cp == 0x2029 || cp == 0x202f ||
         cp == 0x205f || cp == 0x3000 || cp == 0xfeff;
}
}
bool normalize_text(std::string& value, std::size_t max, std::size_t points,
                    std::string_view kind) {
  // Bound raw input too; normalization cannot justify an oversized allocation.
  if (value.size() > max) {
    return false;
  }
  struct Scalar {
    std::uint32_t cp;
    std::size_t begin, end;
  };
  std::vector<Scalar> scalars;
  for (std::size_t i = 0; i < value.size();) {
    const auto begin = i;
    const auto first = static_cast<std::uint8_t>(value[i++]);
    std::uint32_t cp = first;
    unsigned count = 0;
    if (first >= 0xc2 && first <= 0xdf) {
      cp = first & 31;
      count = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      cp = first & 15;
      count = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      cp = first & 7;
      count = 3;
    } else if (first > 0x7f) {
      return false;
    }
    for (unsigned j = 0; j < count; ++j) {
      if (i == value.size()) {
        return false;
      }
      const auto byte = static_cast<std::uint8_t>(value[i++]);
      if ((byte & 0xc0) != 0x80) {
        return false;
      }
      cp = (cp << 6) | (byte & 63);
    }
    if ((count == 1 && cp < 0x80) || (count == 2 && cp < 0x800) || (count == 3 && cp < 0x10000) ||
        cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      return false;
    }
    scalars.push_back({cp, begin, i});
  }
  std::size_t first = 0, last = scalars.size();
  if (kind == "nickname") {
    while (first < last && whitespace(scalars[first].cp)) {
      ++first;
    }
    while (first < last && whitespace(scalars[last - 1].cp)) {
      --last;
    }
    if (first == last) {
      return false;
    }
  }
  if (last - first > points) {
    return false;
  }
  for (auto i = first; i < last; ++i) {
    if (scalars[i].cp < 32 || (scalars[i].cp >= 127 && scalars[i].cp <= 159)) {
      return false;
    }
  }
  if (kind == "nickname") {
    value = value.substr(scalars[first].begin, scalars[last - 1].end - scalars[first].begin);
  }
  if (kind == "room") {
    if (value.empty()) {
      return false;
    }
    for (const auto c : value) {
      if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') &&
          c != '_' && c != '-') {
        return false;
      }
    }
  }
  if (kind == "hash") {
    if (value.size() != 64) {
      return false;
    }
    for (const auto c : value) {
      if (!(c >= 'a' && c <= 'f') && !(c >= '0' && c <= '9')) {
        return false;
      }
    }
  }
  return true;
}
std::uint32_t WireReader::varint() {
  std::uint32_t value = 0;
  for (unsigned i = 0; i < 5; ++i) {
    const auto b = u8();
    if (i == 4 && (b & 0xf0)) {
      fail();
      return 0;
    }
    value |= static_cast<std::uint32_t>(b & 127) << (7 * i);
    if (!(b & 128)) {
      if (i && b == 0) {
        fail();
      }
      return value;
    }
  }
  fail();
  return 0;
}
std::optional<std::vector<std::uint8_t>> WireWriter::frame(std::uint8_t type, std::uint32_t epoch,
                                                           std::size_t max) const {
  if (!ok_ || out_.bytes().size() + 16 > max) {
    return {};
  }
  ByteWriter out;
  out.write_bytes(std::array<std::uint8_t, 4>{'F', 'L', 'R', '2'});
  out.write_u16_le(2);
  out.write_u8(type);
  out.write_u8(0);
  out.write_u32_le(epoch);
  out.write_u32_le(static_cast<std::uint32_t>(out_.bytes().size()));
  out.write_bytes(out_.bytes());
  return out.bytes();
}
std::optional<FrameHeader> unframe(std::span<const std::uint8_t> bytes, std::size_t max) {
  if (bytes.size() < 16 || bytes.size() > max || bytes[0] != 'F' || bytes[1] != 'L' ||
      bytes[2] != 'R' || bytes[3] != '2') {
    return {};
  }
  WireReader r(bytes.subspan(4, 12));
  r.u16(2, 2);  // Version 2; a mismatch fails the reader.
  const auto type = r.u8(1);
  r.u8(0, 0);  // Flags must be zero.
  const auto epoch = r.u32(), length = r.u32();
  if (!r.done() || length != bytes.size() - 16) {
    return {};
  }
  return FrameHeader{type, epoch};
}
}  // namespace engine::net

namespace engine::net {
bool validate_public_entity(std::span<const std::uint8_t> bytes, std::uint32_t handle) {
  if (bytes.empty() || bytes.size() > kMaxEntityFieldBytes || !handle) {
    return false;
  }
  ByteReader r(bytes);
  bool ok = true;
  auto varint = [&]() {
    std::uint32_t value = 0;
    for (unsigned i = 0; i < 5; ++i) {
      const auto b = r.read_u8();
      if (!b || (i == 4 && (*b & 0xf0))) {
        ok = false;
        return 0U;
      }
      value |= static_cast<std::uint32_t>(*b & 127) << (7 * i);
      if (!(*b & 128)) {
        if (i && *b == 0) {
          ok = false;
        }
        return value;
      }
    }
    ok = false;
    return 0U;
  };
  if (r.read_u8() != 1 || varint() != 1 || varint() != 0 || varint() != 0) {
    return false;
  }
  const auto count = varint();
  if (varint() != 0 || !count || count > kMaxEntityFieldRecords) {
    return false;
  }
  std::uint32_t mask = 0;
  std::set<std::uint32_t> seen;
  auto finite = [&]() {
    const auto value = r.read_f32_le();
    return value && std::isfinite(*value);
  };
  constexpr auto core = kPublicComponentMask;
  // Render components are optional decorations on top of the public core:
  // petal artwork and projectile presence. No other component is public.
  constexpr auto renderComponents =
      protocol::component_bit(protocol::Component::kPetalVariant) |
      protocol::component_bit(protocol::Component::kPetalSpecies) |
      protocol::component_bit(protocol::Component::kWebProjectileTag) |
      protocol::component_bit(protocol::Component::kProjectileTag);
  for (std::uint32_t i = 0; i < count; ++i) {
    if (r.read_u32_le() != handle) {
      return false;
    }
    const auto flags = r.read_u8();
    if (!flags) {
      return false;
    }
    if ((*flags ^ 54) == 8) {
      if (mask != core) {
        return false;
      }
      if (!finite() || !finite() || !r.read_u16_le() || !finite() || !finite() || !finite() ||
          !r.read_u8() || !r.read_u8() || !r.read_u8()) {
        return false;
      }
      continue;
    }
    if ((*flags ^ 54) != 1 && (*flags ^ 54) != 129) {
      return false;
    }
    const auto declared = r.read_u32_le();
    if (!declared || (*declared & ~(core | renderComponents)) || (*declared & core) != core) {
      return false;
    }
    mask = *declared;
    std::uint32_t field = 0;
    while (ok) {
      const auto delta = varint();
      if (!delta) {
        break;
      }
      if (delta > 63 - field) {
        return false;
      }
      field += delta;
      if (std::find(kPublicFields.begin(), kPublicFields.end(), field) == kPublicFields.end()) {
        return false;
      }
      seen.insert(field);
      const auto type = protocol::kFieldDefinitions[field - 1].type;
      if (type == protocol::FieldType::kByte) {
        if (!r.read_u8()) {
          return false;
        }
      } else if (field == 8) {
        if (!r.read_u16_le()) {
          return false;
        }
      } else if (field == 4) {
        auto text = r.read_cstring(129);
        if (!text || !normalize_text(*text, 128, 32, "nickname")) {
          return false;
        }
      } else if (!finite()) {
        return false;
      }
    }
  }
  for (const auto required : {2U, 7U, 8U, 26U, 28U, 31U, 38U, 49U, 53U, 55U}) {
    if (!seen.contains(required)) {
      return false;
    }
  }
  return ok && r.error() == ParseError::kNone && r.remaining() == 0;
}
}  // namespace engine::net
