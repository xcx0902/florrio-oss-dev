/** Protocol tables are generated from schema/protocol.yaml. */
export {
  BYTE_FIELDS, FLOAT_FIELDS, VARINT_FIELDS, BIT_FIELDS, STRING_FIELDS,
  STRING_ARRAY_FIELDS, BYTE_ARRAY_FIELDS, REFERENCE_FIELDS,
  DENSE_GROUPS, DENSE_GROUP_COMPONENTS, DENSE_GROUP_SPECS, FIELD_COMPONENTS,
  FIELD_TYPES, INDEXED_FIELDS, SPARSE_MODES,
} from '../schema/protocol.js';
export type {
  DenseFieldGroup, DenseFieldType, DenseFieldSpec, FieldComponent,
} from '../schema/protocol.js';

import { DENSE_GROUP_COMPONENTS } from '../schema/protocol.js';

export function densePresentForMask(mask: number): ReadonlySet<number> {
  const present = new Set<number>();
  for (const [offsetText, ordinal] of Object.entries(DENSE_GROUP_COMPONENTS)) {
    if ((mask & (1 << (ordinal - 1))) !== 0) present.add(Number(offsetText));
  }
  return present;
}
