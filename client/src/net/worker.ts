import { asBytes, type ServerFunction, type WorkerRequest, type WorkerResponse } from './protocol.js';

export type PacketHandler = (data: Uint8Array | null, final: boolean) => void;

/** Promise/callback wrapper around the worker message envelope. */
export class ServerWorkerClient {
  private readonly worker: Worker;
  private nextCallbackId = 0;
  private readonly pending = new Map<number, PacketHandler>();
  private readonly rejecters = new Map<number, (error: Error) => void>();

  constructor(url = 'server-worker.js?manual=1') {
    this.worker = new Worker(url);
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const handler = this.pending.get(response.callbackId);
      if (!handler) return;
      if (response.error) {
        this.pending.delete(response.callbackId);
        this.rejecters.get(response.callbackId)?.(new Error(response.error));
        this.rejecters.delete(response.callbackId);
        return;
      }
      handler(asBytes(response.data), response.finalResponse);
      if (response.finalResponse) this.pending.delete(response.callbackId);
    };
  }

  request(funcName: ServerFunction, data?: Uint8Array): Promise<Uint8Array | null> {
    return this.requestStream(funcName, data, () => {});
  }

  /** Like request(), but forwards every intermediate packet. The promise
   * resolves with the final payload (which may be null). */
  requestStream(
    funcName: ServerFunction,
    data: Uint8Array | undefined,
    onPacket: (payload: Uint8Array, final: boolean) => void,
  ): Promise<Uint8Array | null> {
    const callbackId = this.nextCallbackId++;
    return new Promise((resolve, reject) => {
      this.rejecters.set(callbackId, reject);
      this.pending.set(callbackId, (payload, final) => {
        if (payload) onPacket(payload, final);
        if (final) {
          this.rejecters.delete(callbackId);
          resolve(payload);
        }
      });
      try {
        const request: WorkerRequest = data
          ? { funcName, callbackId, data }
          : { funcName, callbackId };
        if (data) this.worker.postMessage(request, [data.buffer]);
        else this.worker.postMessage(request);
      } catch (error) {
        this.pending.delete(callbackId);
        this.rejecters.delete(callbackId);
        reject(error);
      }
    });
  }

  init(): Promise<Uint8Array | null> { return this.request('sp_server_init'); }
  send(packet: Uint8Array): Promise<Uint8Array | null> { return this.request('sp_server_send', packet); }
  think(): Promise<Uint8Array | null> { return this.request('sp_server_think'); }
  flush(): Promise<Uint8Array | null> { return this.request('sp_server_flush'); }

  terminate(): void { this.worker.terminate(); }
}
