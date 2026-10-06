import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize} from '../core.js';
import {prepareExactRolls,simulateExactSession} from '../exact-rolls.js';
import {runSimulations} from '../simulation-runner.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const profile=normalize(defaults(data),data);

function factory({failure=false,hold=false}={}){
  const workers=[];
  return{workers,create(){const worker={stopped:false,terminate(){this.stopped=true},postMessage(config){
    this.config=config;if(hold)return;
    setTimeout(()=>{
      if(this.stopped)return;
      if(failure){this.onmessage({data:{id:config.id,type:'error',message:'Worker failure'}});return}
      const prepared=prepareExactRolls(config.profile,config.data,config.seconds),results=config.indices.map((index,i)=>{
        const result=simulateExactSession(prepared,(config.seed+Math.imul(index,2654435761))>>>0);
        this.onmessage({data:{id:config.id,type:'progress',cycles:(i+1)*prepared.cycles,total:config.runs*prepared.cycles}});return result;
      });
      this.onmessage({data:{id:config.id,type:'result',indices:config.indices,result:{runs:results}}});
    },config.indices[0]%2?1:10);
  }};workers.push(worker);return worker}};
}

test('Serial and parallel individual-roll sessions match exactly despite different completion order',async()=>{
  const config={id:123,profile,data,seconds:30,runs:11,seed:55},a=factory(),b=factory(),progress=[];
  const serial=await runSimulations(config,{workerCount:1,workerFactory:()=>a.create()}).promise;
  const parallel=await runSimulations(config,{workerCount:4,workerFactory:()=>b.create(),onProgress:x=>progress.push(x)}).promise;
  assert.deepEqual(parallel,serial);assert.equal(parallel.runs.length,11);
  assert.ok(progress.every((x,i)=>x.value>=0&&x.value<=1&&(!i||x.value>=progress[i-1].value)));assert.equal(progress.at(-1).value,1);
  assert.ok(b.workers.every(w=>w.stopped));assert.deepEqual(b.workers.flatMap(w=>w.config.indices).sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i));
});

test('Cancelling terminates every worker and ignores stale progress and completion messages',async()=>{
  const f=factory({hold:true}),progress=[];
  const run=runSimulations({id:1,profile,data,seconds:30,runs:50,seed:1},{workerCount:8,workerFactory:()=>f.create(),onProgress:x=>progress.push(x)});
  run.cancel();await assert.rejects(run.promise,{name:'AbortError'});assert.ok(f.workers.every(w=>w.stopped));
  for(const worker of f.workers)worker.onmessage({data:{id:1,type:'progress',cycles:100,total:100}});assert.deepEqual(progress,[]);
});

test('Worker errors stop the complete pool and hardware limits cannot create more workers than runs',async()=>{
  const f=factory({failure:true}),run=runSimulations({id:1,profile,data,seconds:30,runs:2,seed:1},{workerCount:128,workerFactory:()=>f.create()});
  assert.equal(f.workers.length,2);await assert.rejects(run.promise,/Worker failure/);assert.ok(f.workers.every(w=>w.stopped));
});

test('Individual border sampling retains all 32 independent combinations',()=>{
  const d={...data,cards:[{name:'Common',rarityValue:1}],secretSkins:{}},s=defaults(d);s.unlocks={Awakened:true,Fabled:true,Corrupted:true};s.fabledMax=1e30;
  for(const border of ['Shiny','Awakened','Fabled','Corrupted','Void']){s.stats[border+'Luck']=1;s.odds[border]=2}
  const r=simulateExactSession(prepareExactRolls(s,d,100000),123);
  assert.equal(Object.keys(r.combos).length,32);for(const count of Object.values(r.combos))assert.ok(Math.abs(count/100000-1/32)<.004);
});
