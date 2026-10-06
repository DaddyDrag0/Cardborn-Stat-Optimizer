import {BORDERS,effective} from './core.js?v=8.3';
import {prepareExactRolls,simulateExactSession,rollRandom} from './exact-rolls.js?v=8.3';

// Existing Tower calculator reward bands. Server reward generation is absent
// from the export: additive floor bonuses and single reward draws are modeled.
export const TOWER_REWARD_BANDS=[[1,9,6],[10,19,8],[20,34,10],[35,49,12],[50,74,15],[75,99,18],[100,149,22],[150,189,25],[190,225,28],[226,325,32],[326,450,36],[451,525,40],[526,650,45],[651,50000,50]];
export function towerCardsOnFloor(floor){return TOWER_REWARD_BANDS.find(([a,b])=>floor>=a&&floor<=b)?.[2]||0}
export function towerTotalCards(floor){return TOWER_REWARD_BANDS.reduce((total,[a,b,n])=>total+Math.max(0,Math.min(floor,b)-a+1)*n,0)}
export function towerBonuses(floor){return{Luck:8*Math.floor(floor/5),ShinyLuck:.4*Math.floor(floor/10),AwakenedLuck:Math.floor(floor/15),CorruptedLuck:.5*Math.floor(floor/12)}}
export function towerSessionPlan(build,seconds){
  const floor=Math.floor(Number(build?.floor)),runSeconds=Number(build?.dungeonSeconds);
  if(!(floor>=1&&floor<=50000&&runSeconds>=1&&Number.isFinite(runSeconds)))throw Error('Enter a cleared Tower floor from 1 to 50,000 and a run time of at least 1 second.');
  const completedRuns=Math.floor(seconds/runSeconds),remaining=Math.max(0,seconds-completedRuns*runSeconds),partialFloor=Math.min(floor-1,Math.floor(remaining*floor/runSeconds+1e-9));
  return{floor,runSeconds,completedRuns,partialFloor,clearedFloors:completedRuns*floor+partialFloor,cards:completedRuns*towerTotalCards(floor)+towerTotalCards(partialFloor)};
}
export function prepareRollSession(profile,data,seconds){
  if(!profile.simulation?.tower)return{normal:prepareExactRolls(profile,data,seconds),work:Math.floor(seconds/effective(profile,data).RollInterval)};
  const plan=towerSessionPlan(profile.build,seconds),baseProfile=structuredClone(profile);
  // Fixed-floor preview is for the Setup calculator. Repeating Tower runs
  // start at zero bonus, and only their reward cards receive floor bonuses.
  baseProfile.build.inDungeon=false;
  const stats=effective(baseProfile,data),normal=prepareExactRolls(baseProfile,data,seconds),cache=new Map(),rows=normal.rows;
  function rewardPool(floor){
    if(!cache.has(floor)){
      const rewardStats={...stats,periodic:[]};for(const [key,value]of Object.entries(towerBonuses(floor)))rewardStats[key]+=value;
      const prepared=prepareExactRolls(baseProfile,data,0,{stats:rewardStats,rows});
      cache.set(floor,{prepared,selection:prepared.pool(1)});
      // Bound memory even for 50,000-floor inputs; ordinary runs retain all
      // their pools and reuse them between repeated sessions in a worker.
      if(cache.size>2048)cache.delete(cache.keys().next().value);
    }
    return cache.get(floor);
  }
  return{normal,plan,rewardPool,rows,work:normal.cycles+plan.cards};
}
export function simulateRollSession(prepared,seed,progress=()=>{}){
  if(!prepared.plan)return simulateExactSession(prepared.normal,seed,progress);
  const {normal,plan,work}=prepared,result=simulateExactSession(normal,seed,(_,cycles)=>progress(cycles/work,cycles));
  // Independent stream keeps regular pulls unchanged when Tower is enabled.
  const rng=rollRandom((seed^0x7f4a7c15)>>>0),counts=new Float64Array(normal.capacity),combos=new Float64Array(32);let cards=0,hits=0;
  function clearFloor(floor){
    const {prepared:pool,selection}=prepared.rewardPool(floor);
    for(let i=0;i<towerCardsOnFloor(floor);i++){
      const row=pool.drawPool(selection,rng);counts[row.index]++;combos[row.mask]++;cards++;if(row.hit)hits++;
      if(cards%10000===0)progress((normal.cycles+cards)/work,normal.cycles+cards);
    }
  }
  for(let run=0;run<plan.completedRuns;run++)for(let floor=1;floor<=plan.floor;floor++)clearFloor(floor);
  for(let floor=1;floor<=plan.partialFloor;floor++)clearFloor(floor);
  const inventory=new Map(result.inventory.map(row=>[row.name+'|'+row.mask,{...row}]));
  for(let i=0;i<counts.length;i++)if(counts[i]){
    const {index,key,score,...row}=prepared.rows[i],old=inventory.get(key);
    inventory.set(key,{...row,count:(old?.count||0)+counts[i]});
  }
  for(let mask=0;mask<32;mask++)if(combos[mask]){result.combos[mask]=(result.combos[mask]||0)+combos[mask];for(let b=0;b<5;b++)if(mask&(1<<b))result.borderTotals[BORDERS[b]]+=combos[mask]}
  const items=[...inventory.values()].sort((a,b)=>b.rarity-a.rarity);
  progress(1,work);
  return{...result,regularCards:result.cards,towerCards:cards,cards:result.cards+cards,hits:result.hits+hits,tower:plan,inventory:items,uniqueCards:new Set(items.map(row=>row.name)).size,best:items[0]?{...items[0]}:null};
}
