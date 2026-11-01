import { ServerWorkerClient } from './worker.js';
import { InputPacketEncoder } from './input.js';
import { CommandKind, ResultCode, type CommandResult, type Message } from '../schema/multiplayer.js';
import type { Transport, TransportSnapshot, ConnectionStatus, ConnectionState, InputIntent, CommandIntent } from './transport.js';

/** Explicit offline adapter. Only this profile constructs a Worker. */
export class LocalWorkerTransport extends ServerWorkerClient implements Transport {
  readonly mode = 'local';
  state: ConnectionState = 'disconnected';
  private readonly encoder = new InputPacketEncoder();
  private readonly snapshots = new Set<(snapshot: TransportSnapshot) => void>();
  private readonly controls = new Set<(message: Message) => void>();
  private readonly closes = new Set<(status: ConnectionStatus) => void>();
  async connect(): Promise<void> { this.state = 'connecting'; await this.init(); this.state = 'connected'; }
  sendInput(intent: InputIntent): void { void this.send(this.encoder.input(intent.buttons, intent.angle, intent.strength)); }
  async sendCommand(command: CommandIntent): Promise<CommandResult> {
    let packet: Uint8Array;
    switch (command.kind) {
      case CommandKind.Spawn: packet = this.encoder.spawn(command.text ?? ''); break;
      case CommandKind.Suicide: packet = this.encoder.suicide(); break;
      case CommandKind.Swap: packet = this.encoder.swap(command.slotA ?? 0, command.typeA ?? 0, command.slotB ?? 0, command.typeB ?? 0); break;
      case CommandKind.Discard: packet = this.encoder.discard(command.slotA ?? 0, command.typeA ?? 0); break;
      default: throw new Error('Command unavailable offline');
    }
    await this.send(packet);
    return { commandSeq: 1, code: ResultCode.Ok };
  }
  override step(inputs: readonly Uint8Array[], apply: (packet: Uint8Array, final: boolean) => void): Promise<void> {
    return super.step(inputs, (packet, final) => { apply(packet, final); for (const listener of this.snapshots) listener({ kind: 'local', value: packet }); });
  }
  onSnapshot(listener: (snapshot: TransportSnapshot) => void): () => void { this.snapshots.add(listener); return () => this.snapshots.delete(listener); }
  onControl(listener: (message: Message) => void): () => void { this.controls.add(listener); return () => this.controls.delete(listener); }
  onClose(listener: (status: ConnectionStatus) => void): () => void { this.closes.add(listener); return () => this.closes.delete(listener); }
  leave(): void { this.state = 'closed'; }
  dispose(): void { this.terminate(); this.state = 'closed'; this.snapshots.clear(); this.controls.clear(); this.closes.clear(); }
}
