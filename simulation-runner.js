import {aggregateSessions} from './simulation.js?v=8.2';

// Runs retain their seeds and counter phase regardless of worker count.
export function runSimulations(config,{workerCount=1,onProgress=()=>{},workerFactory=()=>new Worker('./sim-worker.js?v=8.2',{type:'module'})}={}){
  const runs=Math.max(1,Math.min(1000,Math.floor(config.runs))),count=Math.min(runs,Math.max(1,Math.min(8,Math.floor(workerCount)))),workers=[],completed=new Array(runs),cycles=new Array(count).fill(0);let settled=false,finish,reject;
  const promise=new Promise((resolve,fail)=>{finish=resolve;reject=fail});
  const stop=()=>{for(const worker of workers)worker.terminate()};
  const fail=error=>{if(settled)return;settled=true;stop();reject(error)};
  try{
    for(let slot=0;slot<count;slot++){
      const worker=workerFactory();workers.push(worker);
      const indices=Array.from({length:runs},(_,i)=>i).filter(i=>i%count===slot);
      worker.onmessage=e=>{
        const message=e.data;if(settled||message.id!==config.id)return;
        if(message.type==='error'){fail(Error(message.message));return}
        if(message.type==='progress'){
          cycles[slot]=message.cycles;
          const done=cycles.reduce((a,b)=>a+b,0);onProgress({value:message.total?done/message.total:0,cycles:done,total:message.total,workers:count});return;
        }
        if(message.type==='result'){
          for(let i=0;i<message.indices.length;i++)completed[message.indices[i]]=message.result.runs[i];
          worker.terminate();
          if(completed.filter(Boolean).length===runs){settled=true;stop();finish({runs:completed,aggregate:aggregateSessions(completed)})}
        }
      };
      worker.onerror=e=>fail(Error(e.message||'Simulation failed.'));
      worker.postMessage({...config,runs,indices});
    }
  }catch(error){fail(error)}
  return{promise,workerCount:count,cancel(){if(settled)return;const error=Error('Simulation cancelled.');error.name='AbortError';fail(error)}};
}
