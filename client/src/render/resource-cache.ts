/** Configurable renderer budgets; retained bitmap cost is an estimate, not RSS. */
export const DEFAULT_RENDER_BUDGETS = Object.freeze({ measurements:4096, labels:1024, owners:4096, rasterBytes:32*1024*1024, paths:1024, layouts:1024, maxRasterDimension:8192 });
let access = 0;
interface CacheEntry<K,V> { key:K; value:V; bytes:number; age:number; previous?:CacheEntry<K,V>; next?:CacheEntry<K,V>; }
export class CacheBudget {
  bytes = 0;
  readonly caches = new Set<ResourceCache<unknown,unknown>>();
  constructor(readonly limit: number) {}
  trim(): void {
    while(this.bytes>this.limit) {
      let oldest: ResourceCache<unknown,unknown> | undefined;
      for(const cache of this.caches) if(cache.size && (!oldest||cache.oldest<oldest.oldest)) oldest=cache;
      if(!oldest) break;
      oldest.evict();
    }
  }
}
/** Map-compatible LRU with shared cost accounting across owner/non-owner text. */
export class ResourceCache<K,V> extends Map<K,V> {
  hits=0; misses=0; evictions=0;
  private readonly records = new Map<K,CacheEntry<K,V>>();
  private first:CacheEntry<K,V>|undefined;
  private last:CacheEntry<K,V>|undefined;
  constructor(readonly limit: number, readonly cost:(v:V)=>number=()=>0, readonly budget?:CacheBudget, readonly release?:(v:V)=>void) {
    super(); budget?.caches.add(this as ResourceCache<unknown,unknown>);
  }
  get oldest(): number { return this.first?.age??Infinity; }
  private unlink(entry:CacheEntry<K,V>):void {
    if(entry.previous)entry.previous.next=entry.next;else this.first=entry.next;
    if(entry.next)entry.next.previous=entry.previous;else this.last=entry.previous;
    entry.previous=undefined;entry.next=undefined;
  }
  private touch(entry:CacheEntry<K,V>):void {
    entry.age=++access;
    if(this.last===entry)return;
    this.unlink(entry);entry.previous=this.last;
    if(this.last)this.last.next=entry;else this.first=entry;
    this.last=entry;
  }
  override get(key:K): V|undefined {
    const entry=this.records.get(key);
    if(!entry) {this.misses++;return undefined;}
    this.hits++;this.touch(entry);return entry.value;
  }
  override set(key:K,value:V):this {
    // Replacing an owner can reuse its canvas; never release that bitmap here.
    this.remove(key,false);
    const bytes=this.cost(value);
    const entry:CacheEntry<K,V>={key,value,bytes,age:++access,previous:this.last};
    if(this.last)this.last.next=entry;else this.first=entry;
    this.last=entry;this.records.set(key,entry);super.set(key,value);
    if(this.budget)this.budget.bytes+=bytes;
    while(this.size>this.limit)this.evict();
    this.budget?.trim();return this;
  }
  private remove(key:K,release:boolean):boolean {
    const entry=this.records.get(key);if(!entry)return false;
    if(this.budget)this.budget.bytes-=entry.bytes;
    this.unlink(entry);this.records.delete(key);super.delete(key);
    if(release)this.release?.(entry.value);return true;
  }
  override delete(key:K):boolean { return this.remove(key,true); }
  evict():void {if(this.first){this.evictions++;this.delete(this.first.key);}}
  override clear():void {for(const key of super.keys())this.delete(key);}
}
