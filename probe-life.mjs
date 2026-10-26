import {loadOriginal} from './test/helpers/wasm-probe.mjs';
import {createObjectLifecycleSlotHooks,functionIds} from './source/game/client/object-lifecycle-slots.mjs';
const deps=[405,895,381,413,611,900,904,543,726,646,906,728,577,1024,1026,460];
const r=await loadOriginal('client',{functionIds:[...functionIds,...deps],construct:false}); const h=createObjectLifecycleSlotHooks(r);
const a={2427:[0,0],2451:[0,0],2694:[0,0],901:[0,0],905:[0,0],923:[0,0]};
for(const id of functionIds){console.log('start',id);let t=false;try{r.call(id,...(a[id]??[0]))}catch(e){t=true}console.log(' nat',t?'trap':'ok');try{h[id](...(a[id]??[0]))}catch(e){console.log(' hook trap')}console.log(' done',id)}
