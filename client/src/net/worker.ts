import { asBytes,type ServerFunction,type WorkerRequest,type WorkerResponse } from './protocol.js';
export type PacketHandler = (data: Uint8Array | null, final: boolean) => void;
interface PendingRequest {
  resolve:(payload:Uint8Array|null)=>void;
  reject:(error:Error)=>void;
  onPacket:(payload:Uint8Array,final:boolean)=>void;
  deadline:ReturnType<typeof setTimeout>;
}
/** One record per request, with a bounded deadline and one cleanup path. */
export class ServerWorkerClient {
  private readonly worker:Worker;
  private nextCallbackId=0;
  private closed=false;
  private stepping=false;
  private readonly pending=new Map<number,PendingRequest>();
  get pendingCount():number { return this.pending.size; }
  constructor(url='server-worker.js?manual=1',readonly timeoutMs=10000) {
    this.worker=new Worker(url);
    this.worker.onmessage=(event:MessageEvent<WorkerResponse>)=>{
      const response=event.data;
      if(!response||!Number.isSafeInteger(response.callbackId)) {this.close(new Error('Invalid worker message'));return;}
      const request=this.pending.get(response.callbackId);if(!request)return;
      if(response.error) {this.finish(response.callbackId,new Error(response.error));return;}
      try {
        const payload=asBytes(response.data);
        if(payload)request.onPacket(payload,response.finalResponse);
        if(response.finalResponse)this.finish(response.callbackId,undefined,payload);
      } catch(error) {this.finish(response.callbackId,error instanceof Error?error:new Error(String(error)));}
    };
    this.worker.onerror=event=>this.close(new Error(event.message||'Worker crashed'));
    this.worker.onmessageerror=()=>this.close(new Error('Invalid worker message'));
  }
  private finish(id:number,error?:Error,payload:Uint8Array|null=null):void {
    const request=this.pending.get(id);if(!request)return;
    this.pending.delete(id);clearTimeout(request.deadline);
    if(error)request.reject(error);else request.resolve(payload);
  }
  private close(error:Error):void {
    this.closed=true;
    for(const id of this.pending.keys())this.finish(id,error);
    this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null;
    this.worker.terminate();
  }
  private dispatch(request:Omit<WorkerRequest,'callbackId'>,onPacket:(payload:Uint8Array,final:boolean)=>void):Promise<Uint8Array|null> {
    if(this.closed)return Promise.reject(new Error('Worker terminated'));
    const callbackId=this.nextCallbackId++;
    return new Promise((resolve,reject)=>{
      const deadline=setTimeout(()=>this.close(new Error(`Worker request timeout: ${request.funcName}`)),this.timeoutMs);
      this.pending.set(callbackId,{resolve,reject,onPacket,deadline});
      try {
        const buffers=new Set<ArrayBuffer>();
        for(const packet of request.inputs??(request.data?[request.data]:[]))if(packet.buffer instanceof ArrayBuffer)buffers.add(packet.buffer);
        this.worker.postMessage({...request,callbackId},[...buffers]);
      } catch(error) {this.finish(callbackId,error instanceof Error?error:new Error(String(error)));}
    });
  }
  request(funcName:ServerFunction,data?:Uint8Array):Promise<Uint8Array|null> {return this.requestStream(funcName,data,()=>{});}
  requestStream(funcName:ServerFunction,data:Uint8Array|undefined,onPacket:(payload:Uint8Array,final:boolean)=>void):Promise<Uint8Array|null> {
    return this.dispatch({funcName,data},onPacket);
  }
  async step(inputs:readonly Uint8Array[],onPacket:(payload:Uint8Array,final:boolean)=>void):Promise<void> {
    if(this.stepping)throw new Error('Worker step already pending');
    this.stepping=true;
    try {await this.dispatch({funcName:'step',inputs},onPacket);}finally{this.stepping=false;}
  }
  init():Promise<Uint8Array|null> {return this.request('sp_server_init');}
  send(packet:Uint8Array):Promise<Uint8Array|null> {return this.request('sp_server_send',packet);}
  think():Promise<Uint8Array|null> {return this.request('sp_server_think');}
  flush():Promise<Uint8Array|null> {return this.request('sp_server_flush');}
  terminate():void {this.close(new Error('Worker terminated'));}
}
