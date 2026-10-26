/** Audio boundary. The first version may stay silent; the interface keeps the
 * game loop free of Web Audio details. */
export interface AudioBus {
  play(effect: string, gain?: number): void;
  setMuted(muted: boolean): void;
}

export class SilentAudioBus implements AudioBus {
  private muted = false;
  play(): void { /* intentionally silent */ }
  setMuted(muted: boolean): void { this.muted = muted; }
  get isMuted(): boolean { return this.muted; }
}
