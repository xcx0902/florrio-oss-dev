import type { EntitySnapshot } from './snapshot-types.js';

/**
 * Read-through accessors for wire field values.
 *
 * A decoded record stores each field once: in the map for its protocol type
 * when it arrived sparsely, or in `denseFields` when its component arrived as a
 * dense group. Consumers ask for the field by id through these helpers instead
 * of repeating `byteFields?.[id] ?? denseFields?.[id]` chains and keeping a
 * second copy of the value in the entity record.
 */

/** Numeric value of a byte field in either encoding. */
export function byteField(entity: EntitySnapshot | undefined, field: number): number | undefined {
  const value = entity?.byteFields?.[field] ?? entity?.denseFields?.[field];
  return typeof value === 'number' ? value : undefined;
}

/** Numeric value of a float field in either encoding. */
export function floatField(entity: EntitySnapshot | undefined, field: number): number | undefined {
  const value = entity?.floatFields?.[field] ?? entity?.denseFields?.[field];
  return typeof value === 'number' ? value : undefined;
}

/** String value of a string field in either encoding. */
export function stringField(entity: EntitySnapshot | undefined, field: number): string | undefined {
  const value = entity?.stringFields?.[field] ?? entity?.denseFields?.[field];
  return typeof value === 'string' ? value : undefined;
}

/** Numeric value of any scalar field, including doubles and bit flags. */
export function numberField(entity: EntitySnapshot | undefined, field: number): number | undefined {
  const value =
    entity?.byteFields?.[field] ??
    entity?.floatFields?.[field] ??
    entity?.doubleFields?.[field] ??
    entity?.varintFields?.[field] ??
    entity?.referenceFields?.[field] ??
    entity?.bitFields?.[field] ??
    entity?.denseFields?.[field];
  return typeof value === 'number' ? value : undefined;
}
