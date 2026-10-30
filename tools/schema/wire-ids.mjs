/** Publication limits shared by schema validation and catalog generation.
 *
 * A type id is stored as uint16_t in the catalog and engine model, but the
 * shipping snapshot/loadout wire still serializes it as one byte. Keep the
 * catalog sparse inside that byte until a protocol-width change is designed.
 */
export const PUBLISHABLE_TYPE_ID_MAX = 0xff;
