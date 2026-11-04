import {
  decodeMessage,
  encodeMessage,
  LIMITS,
  NetworkSnapshotDecoder,
} from './multiplayer-codec.js';
import {
  CommandKind,
  ErrorCode,
  MessageType,
  ResyncReason,
  type CommandResult,
  type Message,
  type Welcome,
} from '../schema/multiplayer.js';
import { NetworkClock } from '../state/network-clock.js';
import { MOTION } from '../schema/motion.js';
import type { Input } from '../schema/multiplayer.js';
import type { ConnectionConfig } from './connection-config.js';
import type {
  Transport,
  ConnectionState,
  ConnectionStatus,
  TransportSnapshot,
  InputIntent,
  CommandIntent,
} from './transport.js';

interface PendingCommand {
  resolve(value: CommandResult): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
  life: boolean;
}
interface ResumeRecord {
  token: number[];
  seenAt: number;
}
export interface NetworkOptions {
  socket?: (url: string) => WebSocket;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
  monotonicNow?: () => number;
  commandTimeoutMs?: number;
  handshakeTimeoutMs?: number;
}
const GRACE_MS = 10_000;

/** A connection owns its callbacks, counters, baseline and bounded promises. */
export class NetworkTransport implements Transport {
  readonly mode = 'network';
  readonly clock = new NetworkClock();
  resyncCount = 0;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pingNonce = 0;
  private ping?: { nonce: number; sentAt: number };
  private readonly inputs = new Set<(input: Input, eventAt?: number) => void>();
  private readonly monotonicNow: () => number;
  state: ConnectionState = 'disconnected';
  readonly decoder = new NetworkSnapshotDecoder();
  welcome?: Welcome;
  serverTick = 0;
  lifeEpoch = 0;
  private inputSeq = 0;
  private commandSeq = 0;
  private generation = 0;
  private socket?: WebSocket;
  private nickname = '';
  private resume?: ResumeRecord;
  private lostAt?: number;
  private attempt = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private resyncTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private resyncPending = false;
  private connectPromise?: Promise<void>;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: Error) => void;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly snapshots = new Set<(snapshot: TransportSnapshot) => void>();
  private readonly controls = new Set<(message: Message) => void>();
  private readonly closes = new Set<(status: ConnectionStatus) => void>();
  private readonly now: () => number;
  private readonly storage?: NetworkOptions['storage'];
  private readonly storageKey: string;
  constructor(
    readonly config: ConnectionConfig,
    private readonly options: NetworkOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.storageKey = `florr:resume:${config.url}:${config.roomId}`;
    try {
      this.storage =
        options.storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
    } catch {
      /* memory-only */
    }
    try {
      const record = JSON.parse(this.storage?.getItem(this.storageKey) ?? 'null');
      if (
        record &&
        Array.isArray(record.token) &&
        record.token.length === 32 &&
        record.token.every(
          (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255,
        ) &&
        Number.isFinite(record.seenAt) &&
        this.now() - record.seenAt >= 0 &&
        this.now() - record.seenAt < GRACE_MS
      ) {
        this.resume = record;
      } else {
        this.clearResume();
      }
    } catch {
      this.clearResume();
    }
  }
  private status(state: ConnectionState, message: string): void {
    this.state = state;
    for (const listener of this.closes) {
      listener({ state, message });
    }
  }
  connect(nickname: string): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('Connection disposed'));
    }
    if (this.state === 'connected') {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.nickname = nickname;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
    const promise = this.connectPromise;
    this.open(false);
    return promise;
  }
  private open(retry: boolean): void {
    this.detach();
    const generation = ++this.generation;
    this.status(retry ? 'reconnecting' : 'connecting', retry ? 'Reconnecting…' : 'Connecting…');
    let socket: WebSocket;
    try {
      socket = (this.options.socket ?? ((url) => new WebSocket(url)))(this.config.url);
    } catch {
      this.failedConnection();
      return;
    }
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    const current = (): boolean =>
      !this.disposed && generation === this.generation && this.socket === socket;
    const remaining = this.resume
      ? Math.max(1, GRACE_MS - (this.now() - this.resume.seenAt))
      : 5000;
    this.handshakeTimer = setTimeout(
      () => {
        if (current()) {
          this.failedConnection();
        }
      },
      Math.min(remaining, this.options.handshakeTimeoutMs ?? 5000),
    );
    socket.onopen = () => {
      if (!current()) {
        return;
      }
      this.status('handshaking', 'Joining the room…');
      try {
        this.write({
          type: 1,
          sessionEpoch: 0,
          value: {
            protocolVersion: this.config.protocolVersion,
            catalogHash: this.config.catalogHash,
            roomId: this.config.roomId,
            nickname: this.nickname,
            resumeToken: this.resume ? Uint8Array.from(this.resume.token) : undefined,
          },
        });
      } catch (error) {
        this.terminal(error instanceof Error ? error.message : 'Handshake failed');
      }
    };
    socket.onmessage = (event) => {
      if (!current()) {
        return;
      }
      if (!(event.data instanceof ArrayBuffer)) {
        this.terminal('Invalid server frame');
        return;
      }
      try {
        this.receive(new Uint8Array(event.data));
      } catch {
        this.terminal('Invalid server response');
      }
    };
    socket.onerror = () => {
      if (current()) {
        this.failedConnection();
      }
    };
    socket.onclose = () => {
      if (current()) {
        this.failedConnection();
      }
    };
  }
  private receive(bytes: Uint8Array): void {
    const message = decodeMessage(bytes);
    if (!message) {
      if (this.welcome) {
        this.requestResync(ResyncReason.Decode);
      } else {
        this.terminal('Invalid server handshake');
      }
      return;
    }
    if (message.type === MessageType.Welcome) {
      if (this.state !== 'handshaking' || message.value.roomId !== this.config.roomId) {
        this.terminal('Invalid room handshake');
        return;
      }
      const welcome = message.value;
      this.decoder.bind(welcome);
      this.welcome = welcome;
      this.serverTick = welcome.serverTick;
      this.clock.reset(welcome.serverTick, this.monotonicNow());
      this.pingNonce = 0;
      this.ping = undefined;
      this.pingTimer = setInterval(() => this.sampleClock(), MOTION.pingIntervalMs);
      this.lifeEpoch = 0;
      this.inputSeq = 0;
      this.commandSeq = 0;
      this.resyncPending = false;
      this.resume = { token: Array.from(welcome.resumeToken), seenAt: this.now() };
      this.saveResume();
      this.attempt = 0;
      this.lostAt = undefined;
      this.status('connected', '');
      for (const listener of this.controls) {
        listener(message);
      }
      return;
    }
    // Error/close are allowed before Welcome; other traffic belongs to this session.
    if (message.type === MessageType.Error || message.type === MessageType.CloseReason) {
      if (this.welcome && message.sessionEpoch !== this.welcome.sessionEpoch) {
        return;
      }
      const labels: Partial<Record<ErrorCode, string>> = {
        [ErrorCode.Version]: 'Game protocol version mismatch',
        [ErrorCode.Catalog]: 'Game catalog version mismatch',
        [ErrorCode.RoomFull]: 'This room is full',
        [ErrorCode.Stopping]: 'Server maintenance: return to the menu',
        [ErrorCode.Session]: 'Session expired or replaced',
        [ErrorCode.SlowConsumer]: 'Connection is too slow',
        [ErrorCode.EpochExhausted]: 'Room expired: return to the menu',
      };
      this.terminal(labels[message.value.code] ?? 'Server rejected the connection');
      return;
    }
    if (
      this.state !== 'connected' ||
      !this.welcome ||
      message.sessionEpoch !== this.welcome.sessionEpoch
    ) {
      return;
    }
    if (message.type === MessageType.Snapshot) {
      const applied = this.decoder.decode(bytes);
      if (!applied) {
        this.requestResync(ResyncReason.Gap);
        return;
      }
      if (message.value.full) {
        this.resyncPending = false;
        clearTimeout(this.resyncTimer);
        this.resyncTimer = undefined;
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = undefined;
      }
      if (this.lifeEpoch !== applied.snapshot.selfState.lifeEpoch) {
        this.cancelCommands('Player life changed', true);
      }
      this.lifeEpoch = applied.snapshot.selfState.lifeEpoch;
      this.serverTick = applied.snapshot.serverTick;
      this.clock.observeSnapshot(this.serverTick, this.monotonicNow());
      if (this.resume) {
        this.resume.seenAt = this.now();
        this.saveResume();
      }
      for (const listener of this.snapshots) {
        listener({ kind: 'network', value: applied });
      }
      this.resolveConnect?.();
      this.clearConnect();
      if (!this.ping && !this.clock.sampleCount) {
        this.sampleClock();
      }
    } else if (message.type === MessageType.CommandResult) {
      const pending = this.pending.get(message.value.commandSeq);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.value.commandSeq);
        pending.resolve(message.value);
      }
    } else if (message.type === MessageType.Ping) {
      this.write({
        type: MessageType.Pong,
        sessionEpoch: this.welcome.sessionEpoch,
        value: { ...message.value, serverMonotonicMs: 0, serverTimeMs: 0 },
      });
    } else if (
      message.type === MessageType.Pong &&
      this.ping &&
      message.value.nonce === this.ping.nonce
    ) {
      this.clock.sample(message.value, this.ping.sentAt, this.monotonicNow());
      this.ping = undefined;
    }
    for (const listener of this.controls) {
      listener(message);
    }
  }
  private sampleClock(): void {
    if (!this.welcome || this.state !== 'connected') {
      return;
    }
    if (this.ping && this.monotonicNow() - this.ping.sentAt < MOTION.maxRttMs) {
      return;
    }
    if (this.pingNonce + 1 >= LIMITS.counterDrainAt) {
      this.failedConnection();
      return;
    }
    const sentAt = this.monotonicNow();
    this.ping = { nonce: ++this.pingNonce, sentAt };
    try {
      this.write({
        type: 8,
        sessionEpoch: this.welcome.sessionEpoch,
        value: { nonce: this.ping.nonce, serverTick: this.serverTick, monotonicMs: sentAt },
      });
    } catch {
      this.failedConnection();
    }
  }
  onInput(listener: (input: Input, eventAt?: number) => void): () => void {
    this.inputs.add(listener);
    return () => this.inputs.delete(listener);
  }
  sendInput(intent: InputIntent, eventAt?: number): void {
    if (this.state !== 'connected' || !this.welcome || !this.lifeEpoch || this.resyncPending) {
      return;
    }
    try {
      if (this.inputSeq + 1 >= LIMITS.counterDrainAt) {
        throw new Error('Connection counter exhausted');
      }
      const input = {
        ...intent,
        angle: Math.fround(intent.angle),
        strength: Math.fround(Math.max(0, Math.min(200, intent.strength))),
        lifeEpoch: this.lifeEpoch,
        inputSeq: ++this.inputSeq,
        targetTick: this.clock.targetTick(this.monotonicNow()),
      };
      this.write({ type: 3, sessionEpoch: this.welcome.sessionEpoch, value: input });
      for (const listener of this.inputs) {
        listener(input, eventAt);
      }
    } catch {
      this.failedConnection();
    }
  }
  sendCommand(intent: CommandIntent): Promise<CommandResult> {
    if (this.state !== 'connected' || !this.welcome) {
      return Promise.reject(new Error('Not connected'));
    }
    if (this.pending.size >= LIMITS.maxQueuedCommands) {
      return Promise.reject(new Error('Command queue full'));
    }
    const commandSeq = this.commandSeq + 1;
    if (commandSeq >= LIMITS.counterDrainAt) {
      return Promise.reject(new Error('Connection counter exhausted'));
    }
    const command = {
      slotA: 0,
      typeA: 0,
      slotB: 0,
      typeB: 0,
      text: '',
      ...intent,
      commandSeq,
      lifeEpoch: this.lifeEpoch,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandSeq);
        reject(new Error('Command confirmation timed out'));
      }, this.options.commandTimeoutMs ?? 5000);
      // Spawn itself changes LifeEpoch. Its new-body snapshot can precede the
      // command confirmation, so retain this bounded promise across that change.
      this.pending.set(commandSeq, {
        resolve,
        reject,
        timer,
        life:
          intent.kind !== CommandKind.Spawn &&
          intent.kind !== CommandKind.Chat &&
          intent.kind !== CommandKind.Leave,
      });
      try {
        this.write({ type: 4, sessionEpoch: this.welcome!.sessionEpoch, value: command });
        this.commandSeq = commandSeq;
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(commandSeq);
        reject(error);
        this.failedConnection();
      }
    });
  }
  requestResync(reason = ResyncReason.Baseline): void {
    if (this.state !== 'connected' || !this.welcome || this.resyncPending) {
      return;
    }
    // A missing initial baseline cannot be recovered by a baseline-bound request.
    if (!this.decoder.baselineId) {
      this.failedConnection();
      return;
    }
    this.resyncPending = true;
    this.resyncCount++;
    this.resyncTimer = setTimeout(() => this.failedConnection(), 5000);
    try {
      this.write({
        type: 7,
        sessionEpoch: this.welcome.sessionEpoch,
        value: {
          reason,
          baselineId: this.decoder.baselineId,
          snapshotSeq: this.decoder.snapshotSeq,
        },
      });
    } catch {
      this.failedConnection();
    }
  }
  private write(message: Message): void {
    const bytes = encodeMessage(message);
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error('Socket closed');
    }
    if (this.socket.bufferedAmount + bytes.byteLength > LIMITS.maxQueuedWriteBytes) {
      throw new Error('Socket queue full');
    }
    this.socket.send(bytes);
  }
  private failedConnection(): void {
    this.detach();
    this.generation++;
    this.cancelCommands('Connection lost');
    this.welcome = undefined;
    if (this.disposed) {
      return;
    }
    this.lostAt ??= this.now();
    const delay = Math.min(4000, 500 * 2 ** this.attempt++);
    if (
      !this.resume ||
      this.now() + delay - this.lostAt >= GRACE_MS ||
      this.now() - this.resume.seenAt >= GRACE_MS
    ) {
      this.terminal(
        this.resume
          ? 'Reconnection failed: return to the menu'
          : 'Cannot connect to the game server',
      );
      return;
    }
    this.status('reconnecting', 'Connection lost. Reconnecting…');
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.open(true);
    }, delay);
  }
  private terminal(message: string): void {
    this.detach();
    this.generation++;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.cancelCommands(message);
    this.clearResume();
    this.welcome = undefined;
    this.rejectConnect?.(new Error(message));
    this.clearConnect();
    this.status('error', message);
  }
  private detach(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    this.ping = undefined;
    this.clock.reset();
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
    clearTimeout(this.resyncTimer);
    this.resyncTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState < 2) {
        socket.close();
      }
    }
  }
  private cancelCommands(message: string, lifeOnly = false): void {
    for (const [sequence, pending] of this.pending) {
      if (lifeOnly && !pending.life) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pending.delete(sequence);
      pending.reject(new Error(message));
    }
  }
  private clearConnect(): void {
    this.connectPromise = undefined;
    this.resolveConnect = undefined;
    this.rejectConnect = undefined;
  }
  private saveResume(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.resume));
    } catch {
      /* memory-only */
    }
  }
  private clearResume(): void {
    this.resume = undefined;
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      /* memory-only */
    }
  }
  leave(): void {
    if (this.state === 'connected') {
      void this.sendCommand({ kind: CommandKind.Leave }).catch(() => {});
    }
    this.clearResume();
    this.detach();
    this.generation++;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.cancelCommands('Left the room');
    this.rejectConnect?.(new Error('Left the room'));
    this.clearConnect();
    this.welcome = undefined;
    this.status('closed', '');
  }
  onSnapshot(listener: (snapshot: TransportSnapshot) => void): () => void {
    this.snapshots.add(listener);
    return () => this.snapshots.delete(listener);
  }
  onControl(listener: (message: Message) => void): () => void {
    this.controls.add(listener);
    return () => this.controls.delete(listener);
  }
  onClose(listener: (status: ConnectionStatus) => void): () => void {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }
  get pendingCount(): number {
    return this.pending.size;
  }
  get timerCount(): number {
    return (
      this.pending.size +
      Number(this.retryTimer !== undefined) +
      Number(this.handshakeTimer !== undefined) +
      Number(this.resyncTimer !== undefined) +
      Number(this.pingTimer !== undefined)
    );
  }
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.detach();
    this.generation++;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.cancelCommands('Connection disposed');
    this.rejectConnect?.(new Error('Connection disposed'));
    this.clearConnect();
    this.status('closed', '');
    this.snapshots.clear();
    this.controls.clear();
    this.closes.clear();
    this.inputs.clear();
  }
}
