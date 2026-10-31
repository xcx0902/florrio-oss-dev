/** Wire contract shared with schema/protocol.yaml. */
export const MAX_INPUT_PACKET_BYTES = 65536;
export const OUTPUT_QUEUE_CAPACITY = 16;
export const PACKET_HEADER_BYTES = 16;
export const INLINE_PAYLOAD_BYTES = 4096;

export type ServerFunction =
  | 'step'
  | 'sp_server_init'
  | 'sp_server_send'
  | 'sp_server_think'
  | 'sp_server_flush'
  | 'sp_server_debug_spawn_mob'
  | 'sp_server_debug_set_loadout_slot'
  | 'sp_server_debug_set_player_position';

export interface WorkerRequest {
  readonly funcName: ServerFunction;
  readonly callbackId: number;
  readonly data?: Uint8Array;
  readonly inputs?: readonly Uint8Array[];
}

export interface WorkerResponse {
  readonly callbackId: number;
  readonly finalResponse: boolean;
  readonly data?: ArrayBuffer | Uint8Array;
  readonly error?: string;
}

export const SNAPSHOT_TYPE = 1;
export const EVENT_TYPE = 5;

export function asBytes(data: ArrayBuffer | Uint8Array | undefined): Uint8Array | null {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}
