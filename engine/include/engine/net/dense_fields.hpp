#pragma once
#include "engine/net/generated_protocol.hpp"

namespace engine {

/** Dense group for a component, or nullptr when the component carries no dense
 * payload in the current protocol. */
inline const protocol::DenseFieldGroup* dense_group(protocol::Component component) {
  for (const auto& group : protocol::kDenseGroups) {
    if (group.component == component) {
      return &group;
    }
  }
  return nullptr;
}

/** Dense group that stores a field, or nullptr for an unknown field. */
inline const protocol::DenseFieldGroup* dense_group_for_field(std::uint32_t field) {
  for (const auto& group : protocol::kDenseGroups) {
    for (const std::uint32_t candidate : group.fields) {
      if (candidate == field) {
        return &group;
      }
    }
    for (const std::uint32_t candidate : group.extended_fields) {
      if (candidate == field) {
        return &group;
      }
    }
  }
  return nullptr;
}

}  // namespace engine
