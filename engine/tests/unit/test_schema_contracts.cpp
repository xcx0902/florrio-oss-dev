// Report compiler-observed layout, without embedding expected sizes/offsets.
// check-schema-layouts.mjs compares this report with the current YAML inputs.
#include "engine/schema/generated.hpp"
#include <cstdio>
#include <type_traits>

int main() {
#define SCHEMA_TYPE(Type) \
  std::printf("{\"kind\":\"struct\",\"name\":\"" #Type "\",\"size\":%zu,\"alignment\":%zu," \
              "\"standardLayout\":%s,\"triviallyCopyable\":%s}\n", \
              sizeof(engine::schema::Type), alignof(engine::schema::Type), \
              std::is_standard_layout_v<engine::schema::Type> ? "true" : "false", \
              std::is_trivially_copyable_v<engine::schema::Type> ? "true" : "false");
#define SCHEMA_FIELD(Type, Field, ExpectedType) \
  std::printf("{\"kind\":\"field\",\"owner\":\"" #Type "\",\"name\":\"" #Field "\"," \
              "\"offset\":%zu,\"size\":%zu,\"typeMatches\":%s}\n", \
              offsetof(engine::schema::Type, Field), sizeof(decltype(engine::schema::Type::Field)), \
              std::is_same_v<std::remove_all_extents_t<decltype(engine::schema::Type::Field)>, \
                             ExpectedType> ? "true" : "false");
#define SCHEMA_GLOBAL(Name, Symbol) \
  std::printf("{\"kind\":\"global\",\"name\":\"" #Name "\",\"address\":%llu}\n", \
              static_cast<unsigned long long>(engine::schema::globals::Symbol));
#include "schema-contracts-probe.inc"
#undef SCHEMA_GLOBAL
#undef SCHEMA_FIELD
#undef SCHEMA_TYPE
  return 0;
}
