import {interpolateEntityInto,type MutableTransform} from '../state/interpolation.js';
import type { CameraState } from '../state/camera.js';
import type { EntityState,WorldState } from '../state/world.js';
/** Reusable draw membership. Position/radius culling still runs every frame;
 * display and camera scalars retain their separate interpolation clocks. */
export class FrameContext {
  now=0;dt=0;viewportWidth=0;viewportHeight=0;dpr=1;
  player:EntityState|undefined;
  camera:CameraState|undefined;
  loadout:readonly number[]=[];
  level=1;
  membershipRevision=-1;
  private orderRevision=-1;
  private readonly transforms=new Map<number,{entity:EntityState;value:MutableTransform;settled:boolean;at:number}>();
  transform(entity:EntityState,now:number):MutableTransform {
    let cached=this.transforms.get(entity.handle);
    if(cached?.entity===entity&&cached.settled&&now>=cached.at)return cached.value;
    if(!cached){cached={entity,value:{x:0,y:0,angle:0},settled:false,at:now};this.transforms.set(entity.handle,cached);}
    interpolateEntityInto(entity,now,cached.value);this.stats.interpolations++;
    cached.entity=entity;cached.at=now;
    cached.settled=now>=Math.max(entity.receivedXAt??entity.receivedAt,entity.receivedYAt??entity.receivedAt,
      entity.receivedAngleAt??entity.receivedAt,entity.receivedRadiusAt??entity.receivedAt)+120;
    return cached.value;
  }
  readonly orderedHandles:number[]=[];
  readonly stats={worldScans:0,sorts:0,visible:0,drawn:0,interpolations:0};
  begin(world:WorldState,camera:CameraState,now:number,dt:number,layer:(e:EntityState)=>number):void {
    this.now=now;this.dt=dt;this.viewportWidth=camera.viewportWidth;this.viewportHeight=camera.viewportHeight;this.dpr=camera.pixelRatio;
    this.player=world.playerEntity();this.level=this.player?.level??1;this.camera=camera;
    this.loadout=this.player?world.playerLoadout():[];
    this.stats.worldScans=0;this.stats.sorts=0;this.stats.visible=0;this.stats.drawn=0;this.stats.interpolations=0;
    if(this.membershipRevision!==world.membershipRevision&&this.transforms.size) {
      // This is a complete retained-membership scan and is counted as one.
      this.stats.worldScans++;
      for(const handle of this.transforms.keys())if(!world.get(handle))this.transforms.delete(handle);
    }
    if(this.orderRevision!==world.renderOrderRevision) {
      this.orderedHandles.length=0;
      for(const entity of world.all())this.orderedHandles.push(entity.handle);
      this.orderedHandles.sort((a,b)=>layer(world.get(a)!)-layer(world.get(b)!)||a-b);
      this.orderRevision=world.renderOrderRevision;this.stats.worldScans++;this.stats.sorts++;
    }
    this.membershipRevision=world.membershipRevision;
  }
}
