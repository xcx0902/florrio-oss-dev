import { decodeMessage, encodeMessage, LIMITS, type Snapshot, type Welcome, type EntityUpdate, type TickEvent } from '../schema/multiplayer.js';
import { SnapshotDecoder } from './snapshot-decoder.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../state/field-types.js';
import type { EntitySnapshot } from '../state/snapshot-types.js';

const plans=DENSE_GROUPS.map(group=>({offset:group.offset,specs:DENSE_GROUP_SPECS[group.offset]??[]}));
function same(a: Uint8Array,b: Uint8Array): boolean { return a.length===b.length && a.every((v,i)=>v===b[i]); }
export interface NetworkEntity {
  ownership: Omit<EntityUpdate,'fields'>;
  records: readonly EntitySnapshot[];
}
export interface AppliedNetworkSnapshot {
  snapshot: Snapshot;
  entities: ReadonlyMap<number,NetworkEntity>;
  events: readonly TickEvent[];
}
/** Transactional network receiver shared by the real socket and contract tests. */
export class NetworkSnapshotDecoder {
  private binding: Welcome | undefined;
  private baseline=0;
  private sequence=0;
  private serverTick=0;
  private eventTick=0;
  private eventOrdinal=0;
  private state=new Map<number,NetworkEntity>();

  bind(welcome: Welcome): void {
    // Validate before resetting the previous binding, including UTF-8/field limits.
    encodeMessage({type:2,sessionEpoch:welcome.sessionEpoch,value:welcome});
    if(!welcome.roomEpoch.some(v=>v!==0) || welcome.sessionEpoch>=LIMITS.counterDrainAt) throw new Error('epoch');
    this.binding={...welcome,roomEpoch:welcome.roomEpoch.slice(),resumeToken:welcome.resumeToken.slice()};
    this.baseline=0; this.sequence=0; this.serverTick=0; this.eventTick=0; this.eventOrdinal=0; this.state=new Map();
  }
  get entities(): ReadonlyMap<number,NetworkEntity> { return this.state; }
  get snapshotSeq(): number { return this.sequence; }
  get baselineId(): number { return this.baseline; }

  /** Invalid frames leave all entity, baseline and event state untouched. */
  decode(bytes: Uint8Array): AppliedNetworkSnapshot | null {
    const message=decodeMessage(bytes);
    if(!message || message.type!==6 || !this.binding || message.sessionEpoch!==this.binding.sessionEpoch) return null;
    const s=message.value;
    if(!same(s.roomEpoch,this.binding.roomEpoch) || s.snapshotSeq>=LIMITS.counterDrainAt || s.baselineId>=LIMITS.counterDrainAt
      || s.serverTick>=LIMITS.counterDrainAt || s.serverTick<this.serverTick || s.snapshotSeq<=this.sequence) return null;
    if(s.full ? s.baselineId<=this.baseline : (!this.baseline || s.baselineId!==this.baseline || s.snapshotSeq!==this.sequence+1)) return null;
    if(s.full && s.removed.length) return null;
    const next=s.full?new Map<number,NetworkEntity>():new Map(this.state);
    const touched=new Set<number>();
    for(const h of s.removed) { if(!h || touched.has(h) || !next.delete(h)) return null; touched.add(h); }
    for(const entity of s.entities) {
      if(touched.has(entity.handle)) return null; touched.add(entity.handle);
      const decoded=new SnapshotDecoder(plans).decode(entity.fields);
      if(!decoded) return null;
      const {fields: _fields,...ownership}=entity;
      next.set(entity.handle,{ownership,records:decoded.entities});
    }
    if(next.size>LIMITS.maxSnapshotEntities) return null;
    if(s.controlledHandle && next.get(s.controlledHandle)?.ownership.ownerPlayerId!==this.binding.playerId) return null;
    let tick=this.eventTick, ordinal=this.eventOrdinal;
    const events:TickEvent[]=[];
    let previousTick=0,previousOrdinal=0;
    for(const e of s.events) {
      if(e.tick>s.serverTick || e.tick<previousTick || (e.tick===previousTick && e.ordinal<=previousOrdinal)) return null;
      previousTick=e.tick; previousOrdinal=e.ordinal;
      if(e.tick<tick || (e.tick===tick && e.ordinal<=ordinal)) continue;
      events.push(e); tick=e.tick; ordinal=e.ordinal;
    }
    this.state=next; this.baseline=s.baselineId; this.sequence=s.snapshotSeq; this.serverTick=s.serverTick;
    this.eventTick=tick; this.eventOrdinal=ordinal;
    return {snapshot:s,entities:next,events};
  }
}
