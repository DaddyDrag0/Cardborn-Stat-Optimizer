import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,BORDERS} from '../core.js';
import {buildDefaults} from '../build.js';
import {prepareExactRolls,simulateExactSession} from '../exact-rolls.js';
import {aggregateSessions} from '../simulation.js';
import {towerCardsOnFloor,towerTotalCards,towerBonuses,towerSessionPlan,prepareRollSession,simulateRollSession} from '../tower-simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
function profile(floor=10,seconds=10){return normalize({...defaults(data),build:{...buildDefaults(),floor,dungeonSeconds:seconds},simulation:{tower:true}},data)}

test('Tower rewards match every band boundary in the existing calculator',()=>{
  const boundary=[[1,6],[9,6],[10,8],[19,8],[20,10],[34,10],[35,12],[49,12],[50,15],[74,15],[75,18],[99,18],[100,22],[149,22],[150,25],[189,25],[190,28],[225,28],[226,32],[325,32],[326,36],[450,36],[451,40],[525,40],[526,45],[650,45],[651,50],[50000,50]];
  for(const [floor,count]of boundary)assert.equal(towerCardsOnFloor(floor),count);
  assert.equal(towerTotalCards(0),0);assert.equal(towerTotalCards(9),54);assert.equal(towerTotalCards(10),62);assert.equal(towerTotalCards(20),144);
  assert.deepEqual(towerBonuses(120),{Luck:192,ShinyLuck:.4*12,AwakenedLuck:8,CorruptedLuck:5});
});

test('Repeating run schedule counts full runs, partial cleared floors and exact time boundaries',()=>{
  const build={floor:10,dungeonSeconds:10};
  assert.deepEqual(towerSessionPlan(build,25),{floor:10,runSeconds:10,completedRuns:2,partialFloor:5,clearedFloors:25,cards:154});
  assert.equal(towerSessionPlan(build,10).cards,62);assert.equal(towerSessionPlan(build,9.999999).cards,54);
  assert.equal(towerSessionPlan(build,.999).cards,0);assert.equal(towerSessionPlan(build,1).cards,6);
  assert.equal(towerSessionPlan({floor:960,dungeonSeconds:3600},1800).partialFloor,480);
  for(const bad of [{floor:0,dungeonSeconds:10},{floor:50001,dungeonSeconds:10},{floor:5,dungeonSeconds:0}])assert.throws(()=>towerSessionPlan(bad,20),/cleared Tower floor/);
});

test('Tower disabled is exactly the original engine and Tower settings persist through normalization',()=>{
  const s=profile();s.simulation.tower=false;
  assert.deepEqual(simulateRollSession(prepareRollSession(s,data,25),123),simulateExactSession(prepareExactRolls(s,data,25),123));
  s.simulation.tower=true;assert.equal(normalize(JSON.parse(JSON.stringify(s)),data).simulation.tower,true);
  assert.equal(normalize({...s,simulation:undefined},data).simulation.tower,false);
});

test('Combined sessions conserve every card, keep regular RNG independent, and progress includes Tower draws',()=>{
  const s=profile(),prepared=prepareRollSession(s,data,25),progress=[],seed=123;
  const r=simulateRollSession(prepared,seed,(value,work)=>progress.push({value,work})),regular=simulateExactSession(prepared.normal,seed);
  assert.equal(r.towerCards,154);assert.equal(r.regularCards,regular.cards);assert.equal(r.cards,r.regularCards+154);assert.equal(r.cycles,regular.cycles);
  assert.equal(r.inventory.reduce((n,row)=>n+row.count,0),r.cards);assert.equal(Object.values(r.combos).reduce((a,b)=>a+b,0),r.cards);
  for(const b of BORDERS)assert.equal(r.borderTotals[b],r.inventory.filter(row=>row.borders.includes(b)).reduce((n,row)=>n+row.count,0));
  for(const row of regular.inventory)assert.ok(r.inventory.find(item=>item.name===row.name&&item.mask===row.mask).count>=row.count);
  assert.ok(progress.every((x,i)=>x.value>=0&&x.value<=1&&(!i||x.value>=progress[i-1].value)));
  assert.deepEqual(progress.at(-1),{value:1,work:prepared.work});assert.deepEqual(simulateRollSession(prepared,seed),r);
  const aggregate=aggregateSessions([r,r]);assert.equal(aggregate.towerCards,308);assert.equal(aggregate.regularCards,r.regularCards*2);assert.equal(aggregate.tower.completedRuns,4);assert.equal(aggregate.inventory.reduce((n,row)=>n+row.count,0),aggregate.cards);
});

test('Fixed-floor preview cannot double-count Tower stats and floor pools reset without boosts on regular rolls',()=>{
  const s=profile(120,120);s.build.inDungeon=true;
  const prepared=prepareRollSession(s,data,240),base=structuredClone(s);base.build.inDungeon=false;
  assert.deepEqual(prepared.normal.stats,effective(base,data));
  const first=prepared.rewardPool(1).prepared.stats,last=prepared.rewardPool(120).prepared.stats;
  for(const [key,bonus]of Object.entries(towerBonuses(120)))assert.equal(last[key],first[key]+bonus);
  assert.deepEqual(prepared.rewardPool(1).prepared.stats,first);assert.deepEqual(last.periodic,[]);
  assert.equal(first.FabledLuck,last.FabledLuck);assert.equal(first.VoidLuck,last.VoidLuck);
});

test('Tower reward counts remain single draws even with guaranteed extra normal rolls and Lucky Hand',()=>{
  const s=profile(10,10),prepared=prepareRollSession(s,data,20);
  Object.assign(prepared.normal.stats,{DoubleRollChance:1,RollTwiceChance:1,TripleRollChance:1,LuckyHandChance:1});
  const result=simulateRollSession(prepared,12);
  assert.equal(result.regularCards,prepared.normal.cycles*6);assert.equal(result.towerCards,124);
});
