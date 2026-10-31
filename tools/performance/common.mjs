import os from 'node:os';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { sha256 } from '../lib/identity.mjs';
export function distribution(values) {
  if (!values.length || values.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid performance samples');
  const sorted = [...values].sort((a,b) => a-b), at = q => sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];
  return { count: values.length, mean: values.reduce((a,b)=>a+b,0)/values.length, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) };
}
export const machine = () => ({ platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, node: process.version });
export async function execute(command,args,options={}) {
  return new Promise((resolve,reject)=>{
    const p=spawn(command,args,{...options,stdio:['ignore','pipe','pipe']});let out='',err='';
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
    p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(new Error(`${command} exited ${code}: ${err}\n${out.slice(-2000)}`)));
  });
}
export async function artifact(file) { const b=await readFile(file); return { path:file,sha256:sha256(b),bytes:b.length }; }
export const scenarios = ['boot-population','idle-world','moving-combat','many-area-effects-1','many-area-effects-10','many-area-effects-50','spawn-refill','clustered-contacts','lifecycle-soak'];
