import {normalize} from './core.js?v=8.2';
import {prepareExactRolls,simulateExactSession} from './exact-rolls.js?v=8.2';
self.onmessage=e=>{
  const {id,profile,data,seconds,runs,seed,indices}=e.data;
  try{
    const count=Math.max(1,Math.min(1000,Math.floor(runs))),assigned=indices||Array.from({length:count},(_,i)=>i),prepared=prepareExactRolls(normalize(profile,data),data,Math.max(1,Math.min(172800,seconds))),results=[];
    let last=0;
    for(let i=0;i<assigned.length;i++){
      results.push(simulateExactSession(prepared,(seed+Math.imul(assigned[i],2654435761))>>>0,(fraction,cycles)=>{
        const now=performance.now();if(now-last>100||fraction===1){last=now;postMessage({id,type:'progress',cycles:i*prepared.cycles+cycles,total:count*prepared.cycles})}
      }));
    }
    postMessage({id,type:'result',indices:assigned,totalRuns:count,result:{runs:results}});
  }catch(error){postMessage({id,type:'error',message:error.message})}
};
