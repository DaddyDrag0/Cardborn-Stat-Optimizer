import {rollRandom,prepareExactRolls,simulateExactSession} from './exact-rolls.js?v=9.5';
import {BORDERS,effective,rollOutcomes,batchDistribution} from './core.js?v=9.5';
import {periodicGroups} from './roll-timing.js?v=9.5';
export {periodicGroups};

// Count sampling adapted from Hit Calculator's roll-sim-worker-v39.js.
// https://github.com/DaddyDrag0/HitCalculator/blob/main/roll-sim-worker-v39.js
export const randomSource=rollRandom;
function normal(random){return Math.sqrt(-2*Math.log(Math.max(Number.MIN_VALUE,random.unit53())))*Math.cos(2*Math.PI*random.unit53())}
function poisson(lambda,random){if(!lambda)return 0;if(lambda<24){const stop=Math.exp(-lambda);let product=1;for(let k=0;k<128;k++){product*=Math.max(Number.MIN_VALUE,random.unit53());if(product<=stop)return k}}return Math.max(0,Math.round(lambda+Math.sqrt(lambda)*normal(random)))}
export function binomial(n,p,random){n=Math.max(0,Math.floor(n));p=Math.max(0,Math.min(1,p));if(!n||!p)return 0;if(p===1)return n;if(p>.5)return n-binomial(n,1-p,random);if(n<=64){let hits=0;for(let i=0;i<n;i++)if(random.unit53()<p)hits++;return hits}const mean=n*p;if(mean<24&&p<=.08)return Math.min(n,poisson(mean,random));const z=normal(random),skew=(1-2*p)/6*(z*z-1);return Math.max(0,Math.min(n,Math.round(mean+Math.sqrt(mean*(1-p))*z+skew)))}
export function multinomial(n,probabilities,random,preparedOrder){const counts=Array(probabilities.length).fill(0);let remaining=Math.floor(n),mass=probabilities.reduce((a,b)=>a+b,0);const order=preparedOrder||probabilities.map((p,i)=>({p,i})).filter(x=>x.p>0).sort((a,b)=>a.p-b.p);for(let j=0;j<order.length;j++){const {p,i}=order[j];const count=j===order.length-1?remaining:binomial(remaining,p/mass,random);counts[i]=count;remaining-=count;mass=Math.max(0,mass-p)}return counts}
export function simulationOutcomes(s,data,stats,mult=1){
  return rollOutcomes(s,data,stats,mult).map(o=>({...o,p:(1-stats.LuckyHandChance)*o.p+stats.LuckyHandChance*o.handP}));
}
function sampler(probabilities){return{probabilities,order:probabilities.map((p,i)=>({p,i})).filter(x=>x.p>0).sort((a,b)=>a.p-b.p)}}
export function prepareSimulation(s,data,seconds){
  const stats=effective(s,data),cycles=Math.floor(seconds/stats.RollInterval);
  const batches=batchDistribution(stats).flatMap(b=>[{...b,hand:false,p:b.p*(1-stats.LuckyHandChance)},{...b,hand:true,p:b.p*stats.LuckyHandChance}]).filter(b=>b.p>0);
  return{...prepareExactRolls(s,data,seconds),stats,cycles,seconds,batches,batchSampler:sampler(batches.map(b=>b.p)),groups:periodicGroups(cycles,stats.periodic,s.rollCounter||0).map(g=>{
    const outcomes=rollOutcomes(s,data,stats,g.mult);
    return{...g,outcomes,plain:sampler(outcomes.map(o=>o.p)),hand:sampler(outcomes.map(o=>o.handP))};
  })};
}
export function sampleSessionCounts(prepared,seed){
  const random=randomSource(seed),borderTotals=Object.fromEntries(BORDERS.map(b=>[b,0])),combos={},inventory=new Map();let cards=0,hits=0;
  for(const group of prepared.groups){
    const batchCounts=multinomial(group.cycles,prepared.batchSampler.probabilities,random,prepared.batchSampler.order),amounts={plain:0,hand:0};
    for(let i=0;i<batchCounts.length;i++){const b=prepared.batches[i];amounts[b.hand?'hand':'plain']+=batchCounts[i]*b.n}
    // Lucky Hand is rolled once per cycle, then used for every card in that
    // batch. Sampling mixed per-card odds loses that shared-cycle correlation.
    for(const mode of ['plain','hand']){
      if(!amounts[mode])continue;
      const distribution=group[mode],counts=multinomial(amounts[mode],distribution.probabilities,random,distribution.order);
      for(let i=0;i<counts.length;i++){
        const count=counts[i];if(!count)continue;
        const o=group.outcomes[i],key=o.name+'|'+o.mask;cards+=count;if(o.hit)hits+=count;combos[o.mask]=(combos[o.mask]||0)+count;for(const b of o.borders)borderTotals[b]+=count;
        const row=inventory.get(key)||{name:o.name,baseRarity:o.baseRarity,rarity:o.rarity,borders:o.borders,mask:o.mask,count:0,hit:o.hit};row.count+=count;inventory.set(key,row);
      }
    }
  }
  const rows=[...inventory.values()].sort((a,b)=>b.rarity-a.rarity);
  return{seed,cycles:prepared.cycles,seconds:prepared.seconds,cards,hits,uniqueCards:new Set(rows.map(o=>o.name)).size,borderTotals,combos,best:rows.length?{...rows[0]}:null,inventory:rows};
}
export function aggregateSessions(runs){const inventory=new Map(),borderTotals=Object.fromEntries(BORDERS.map(b=>[b,0])),combos={};let cards=0,hits=0,best=null;for(const run of runs){cards+=run.cards;hits+=run.hits;if(run.best&&(!best||run.best.rarity>best.rarity))best=run.best;for(const b of BORDERS)borderTotals[b]+=run.borderTotals[b];for(const [mask,count] of Object.entries(run.combos))combos[mask]=(combos[mask]||0)+count;for(const row of run.inventory){const key=row.name+'|'+row.mask,item=inventory.get(key)||{...row,count:0,runsHit:0};item.count+=row.count;item.runsHit++;inventory.set(key,item)}}return{...(runs[0]?.tower?{regularCards:runs.reduce((n,r)=>n+r.regularCards,0),towerCards:runs.reduce((n,r)=>n+r.towerCards,0),tower:{...runs[0].tower,completedRuns:runs.reduce((n,r)=>n+r.tower.completedRuns,0),clearedFloors:runs.reduce((n,r)=>n+r.tower.clearedFloors,0)}}:{}),runCount:runs.length,cards,hits,cycles:runs.reduce((n,r)=>n+r.cycles,0),seconds:runs[0]?.seconds||0,hitRuns:runs.filter(r=>r.hits>0).length,uniqueCards:new Set([...inventory.values()].map(o=>o.name)).size,borderTotals,combos,best,inventory:[...inventory.values()].sort((a,b)=>b.rarity-a.rarity)}}

export const simulateSession=simulateExactSession;
