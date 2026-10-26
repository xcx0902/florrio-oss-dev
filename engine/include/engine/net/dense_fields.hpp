#pragma once
#include "engine/net/generated_protocol.hpp"

namespace engine {

// Public compatibility names; all protocol values come from protocol.yaml.
using protocol::DenseFieldGroup;
using protocol::kDenseGroups;
using protocol::kDenseFields52;
using protocol::kDenseFields56;
using protocol::kDenseFields68;
using protocol::kDenseFields72;
using protocol::kDenseFields76;
using protocol::kDenseFieldsMinus8;
using protocol::kDenseFields84;
using protocol::kDenseFields100;
using protocol::kDenseFieldsMinus15;
using protocol::kDenseFieldsMinus16;
using protocol::kDenseFields112;
using protocol::kDenseFields116;
using protocol::kDenseFields120;
using protocol::kDenseFields124;
using protocol::kDenseFields136;
using protocol::kDenseFields140;
using protocol::kDenseFieldsMinus27;
using protocol::kDenseFields144;
using protocol::kDenseFields152;
using protocol::kDenseFields152Extended;

inline const DenseFieldGroup* dense_group_by_offset(int offset) {
  for (const auto& group : kDenseGroups)
    if (group.offset == offset) return &group;
  return nullptr;
}

inline const DenseFieldGroup* dense_group_for_field(std::uint32_t field) {
  for (const auto& group : kDenseGroups) {
    for (const std::uint32_t candidate : group.fields)
      if (candidate == field) return &group;
    for (const std::uint32_t candidate : group.extended_fields)
      if (candidate == field) return &group;
  }
  return nullptr;
}

} // namespace engine
