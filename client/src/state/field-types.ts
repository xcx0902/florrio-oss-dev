/** Protocol tables are generated from schema/protocol.yaml. */
export {
BIT_FIELDS,BYTE_ARRAY_FIELDS,BYTE_FIELDS,DENSE_GROUP_COMPONENTS,DENSE_GROUP_SPECS,DENSE_GROUPS,FIELD_COMPONENTS,
FIELD_TYPES,FLOAT_FIELDS,INDEXED_FIELDS,REFERENCE_FIELDS,SPARSE_MODES,STRING_ARRAY_FIELDS,STRING_FIELDS,VARINT_FIELDS
} from '../schema/protocol.js';
export type {
DenseFieldGroup,DenseFieldSpec,DenseFieldType,FieldComponent
} from '../schema/protocol.js';

import { DENSE_GROUP_COMPONENTS } from '../schema/protocol.js';

export function densePresentForMask(mask: number): ReadonlySet<number> {
  const present = new Set<number>();
  for (const [offsetText, ordinal] of Object.entries(DENSE_GROUP_COMPONENTS)) {
    if ((mask & (1 << (ordinal - 1))) !== 0) present.add(Number(offsetText));
  }
  return present;
}
