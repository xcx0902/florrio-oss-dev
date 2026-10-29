void test_f32() {
  CHECK(engine::f32(1.0F).bits() == 0x3F800000U);
  CHECK(engine::f32::from_bits(0x3F800000U).to_float() == 1.0F);
  CHECK(engine::f32::from_double(0.5).to_float() == 0.5F);
  CHECK((engine::f32(1.5F) + engine::f32(2.25F)).to_float() == 3.75F);
  CHECK((engine::f32(3.0F) / engine::f32(2.0F)).to_float() == 1.5F);
}

void test_vec2() {
  const engine::Vec2 a(engine::f32(3.0F), engine::f32(4.0F));
  CHECK(std::fabs(a.length().to_float() - 5.0F) < 1e-6F);
  CHECK(a.length_squared().to_float() == 25.0F);
  const engine::Vec2 b = a.normalized();
  CHECK(std::fabs(b.length().to_float() - 1.0F) < 1e-6F);
  CHECK((a + engine::Vec2(engine::f32(1.0F), engine::f32(-1.0F))).x.to_float() == 4.0F);
}

void test_rng() {
  engine::ParkMillerRng park(1);
  CHECK(park.next() == 16807);
  CHECK(park.next() == 282475249);
  CHECK(park.next() == 1622650073);

  engine::MinstdRng lcg(0);
  const std::uint64_t first = lcg.next_state();
  CHECK(first == 1ULL);
  const std::uint64_t second = lcg.next_state();
  CHECK(second == 6364136223846793006ULL);
  const std::uint64_t third = lcg.next_state();
  CHECK(lcg.next_generation() == static_cast<std::uint32_t>((third * 6364136223846793005ULL + 1ULL) >> 33U));
}

void test_varint_roundtrip() {
  const std::array<std::uint32_t, 8> values{0, 1, 127, 128, 16384, 0xFFFFFF, 0xFFFFFFFFU, 42};
  for (const std::uint32_t value : values) {
    engine::ByteWriter writer;
    writer.write_varint32(value);
    engine::ByteReader reader(writer.bytes());
    const auto decoded = reader.read_varint32();
    CHECK(decoded.has_value());
    CHECK(*decoded == value);
    CHECK(reader.eof());
  }
  const std::array<std::uint8_t, 5> overflow{0x80, 0x80, 0x80, 0x80, 0x80};
  engine::ByteReader reader(overflow);
  CHECK(!reader.read_varint32().has_value());
  CHECK(reader.error() == engine::ParseError::kVarintOverflow);
}

void test_byte_reader_bounds() {
  const std::array<std::uint8_t, 3> bytes{1, 2, 3};
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(!reader.read_u32_le().has_value());
  CHECK(reader.error() == engine::ParseError::kOutOfBounds);
}

void test_xor() {
  std::array<std::uint8_t, 5> bytes{1, 2, 3, 4, 5};
  const std::array<std::uint8_t, 3> key{7, 11, 13};
  const auto original = bytes;
  engine::xor_in_place(bytes, key);
  CHECK(bytes != original);
  engine::xor_in_place(bytes, key);
  CHECK(bytes == original);
}

void test_fixed_step() {
  engine::FixedStepClock clock;
  CHECK(clock.advance(0.0) == 0);
  CHECK(clock.advance(49.0) == 0);
  CHECK(clock.advance(50.0) == 1);
  CHECK(clock.advance(1000.0) == 2); // 950 ms clamped to 100 ms => two ticks
  engine::FixedStepClock steady;
  for (int index = 0; index < 20; ++index) CHECK(steady.advance((index + 1) * 50.0) == 1);
}
