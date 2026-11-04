/** Protocol tables are generated from schema/protocol.yaml. */
export {
  BIT_FIELDS,
  BYTE_ARRAY_FIELDS,
  BYTE_FIELDS,
  Component,
  DENSE_GROUP_SPECS,
  DENSE_GROUPS,
  FIELD_TYPES,
  FLOAT_FIELDS,
  INDEXED_FIELDS,
  REFERENCE_FIELDS,
  SPARSE_MODES,
  STRING_ARRAY_FIELDS,
  STRING_FIELDS,
  VARINT_FIELDS,
} from '../schema/protocol.js';
export type { DenseFieldGroup, DenseFieldSpec, DenseFieldType } from '../schema/protocol.js';

import { DENSE_GROUPS } from '../schema/protocol.js';

/** Component-mask bit for a component ordinal. */
export function componentBit(component: number): number {
  return 1 << (component - 1);
}

/** Components whose dense payload is selected by a component mask. */
export function densePresentForMask(mask: number): ReadonlySet<number> {
  const present = new Set<number>();
  for (const { component } of DENSE_GROUPS) {
    if ((mask & componentBit(component)) !== 0) {
      present.add(component);
    }
  }
  return present;
}
