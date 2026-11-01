import type { AppliedNetworkSnapshot } from './multiplayer-snapshot.js';
import type { Command, CommandResult, Message } from '../schema/multiplayer.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'reconnecting' | 'closed' | 'error';
export interface InputIntent { buttons: number; angle: number; strength: number }
export type CommandIntent = Pick<Command, 'kind'> & Partial<Omit<Command, 'kind' | 'commandSeq' | 'lifeEpoch'>>;
export type TransportSnapshot = { kind: 'network'; value: AppliedNetworkSnapshot } | { kind: 'local'; value: Uint8Array };
export interface ConnectionStatus { state: ConnectionState; message: string }
export interface Transport {
  readonly mode: 'network' | 'local';
  readonly state: ConnectionState;
  connect(nickname: string): Promise<void>;
  sendInput(intent: InputIntent): void;
  sendCommand(command: CommandIntent): Promise<CommandResult>;
  onSnapshot(listener: (snapshot: TransportSnapshot) => void): () => void;
  onControl(listener: (message: Message) => void): () => void;
  onClose(listener: (status: ConnectionStatus) => void): () => void;
  leave(): void;
  dispose(): void;
}
