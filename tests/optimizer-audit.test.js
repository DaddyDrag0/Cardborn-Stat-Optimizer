import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,artifactCopyWeights,profileWarnings} from '../core.js';
import {buildDefaults} from '../build.js';
import {periodicGroups} from '../roll-timing.js';
import {optimizeBuild,createBuildEvaluator} from '../optimizer.js';
import {pairedSimulationSummary} from '../rarity-results.js';
import {prepareRollSession,simulateRollSession,towerBonuses} from '../tower-simulation.js';
import {prepareExactRolls,simulateExactSession} from '../exact-rolls.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('Void dice use their own scales and synchronized counter intersections',()=>{
  const s=normalize({...defaults(data),rolls:1e8,build:{...buildDefaults(),under10M:false,passes:{TwoRelic:true},relics:[{id:'RelicOfBonus',border:6},{id:'WeightedDice',border:6}]}},data);
  const stats=effective(s,data);assert.deepEqual(stats.periodic,[{every:10,mult:2},{every:20,mult:4}]);
  assert.deepEqual(periodicGroups(100,stats.periodic),[{cycles:90,mult:1},{cycles:5,mult:2},{cycles:5,mult:8}]);
  s.build.relics=[{id:'SunforgedHammer',border:6}];const hammer=effective(s,data);
  close(hammer.ShinyLuck,1+.8*3.3);close(hammer.AwakenedLuck,1+1.1*3.3);
  s.build.relics=[{id:'ChronoCore',border:6}];const chrono=effective(s,data);
  close(chrono.AwakenedLuck,1+.5*3);close(chrono.FabledLuck,2+3);close(chrono.RollSpeed,.1*3);
});

test('PA effect labels use the same strongest-first weighting without moving slots',()=>{
  const slots=[{id:'AwakenedLuck',value:36.1,locked:true},{id:'AwakenedLuck',value:47.3},{id:'AwakenedLuck',value:10},{id:'LuckMult',value:1.2},{id:'LuckMult',value:1.5}];
  const before=structuredClone(slots);assert.deepEqual(artifactCopyWeights(slots),[.5,1,0,.5,1]);
  slots[0].value=50.3;assert.deepEqual(artifactCopyWeights(slots),[1,.5,0,.5,1]);assert.deepEqual(slots.slice(1),before.slice(1));
});

test('Dice boosts every extra normal roll and both candidates of every Lucky Hand draw',()=>{
  const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},weather:{Clear:{boostMultiplier:1}}};
  const s=defaults(toy);s.globalLuck=1;s.odds=Object.fromEntries(Object.keys(s.odds).map(k=>[k,1e100]));
  const stats={...s.stats,Luck:10,RollInterval:1,LuckyHandChance:1,DoubleRollChance:1,RollTwiceChance:1,TripleRollChance:1,periodic:[{every:1,mult:4}]};
  const prepared=prepareExactRolls(s,toy,1,{stats}),boosted=prepared.pool(4),seen=[],draw=prepared.drawPool;
  prepared.drawPool=(selection,rng)=>{seen.push(selection);return draw(selection,rng)};
  const result=simulateExactSession(prepared,17);
  assert.equal(result.cards,6);assert.equal(seen.length,12);assert.ok(seen.every(selection=>selection===boosted));
  // 40 Luck gives a rounded-up 1/3 check; unboosted 10 Luck gives 1/10.
  close(boosted.cdf[0],1/3);close(prepared.pool(1).cdf[0],.1);
});

test('Relic alternatives retain original gear, refit legal allocations, and use exact Tower forecasts',()=>{
  const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},weather:{Clear:{boostMultiplier:1}}};
  const s=normalize({...defaults(toy),globalLuck:1,rolls:4e6,build:{...buildDefaults(),index:1000,under10M:false,passes:{TwoRelic:true},relics:[{id:'RelicOfBonus',border:6},{id:'WeightedDice',border:6}],floor:20,dungeonSeconds:30},simulation:{tower:true},optimizer:{objective:'hits',rarity:1e6,seconds:60,relics:[{id:'AllSeeingEye',border:6},{id:'SunforgedHammer',border:6}],components:{points:false,skills:false,artifact:true,shops:false}},artifact:{...defaults(toy).artifact,slots:[{id:'Luck',value:5,locked:true}]}},toy);
  const plan=optimizeBuild(s,toy),original=plan.relicAlternatives.find(a=>a.originalGear);
  assert.ok(original);assert.deepEqual(original.profile.build.relics,s.build.relics);
  assert.ok(plan.result.score>=plan.current.score);
  for(const alternative of plan.relicAlternatives){
    assert.deepEqual(alternative.profile.artifact.slots[0],s.artifact.slots[0]);assert.deepEqual(profileWarnings(alternative.profile,toy),[]);
    assert.ok(alternative.profile.build.relics.every(x=>plan.settings.relics.some(y=>y.id===x.id&&y.border===x.border)));
    const forecast=createBuildEvaluator(s,toy,plan.settings,{exactTower:true}).evaluate(alternative.profile);close(alternative.result.score,forecast.score);
    assert.ok(plan.result.score+1e-10>=forecast.score);
    const prepared=prepareRollSession(alternative.profile,toy,60),base=effective({...alternative.profile,build:{...alternative.profile.build,inDungeon:false}},toy);
    for(const f of [1,15,20])for(const[k,v]of Object.entries(towerBonuses(f)))close(prepared.rewardPool(f).prepared.stats[k],base[k]+v);
    const run=simulateRollSession(prepared,17);assert.equal(run.towerCards,prepared.plan.cards);assert.equal(run.inventory.reduce((n,x)=>n+x.count,0),run.cards);
  }
});

test('Zero-hit simulations are marked inconclusive instead of implying perfect certainty',()=>{
  const run=n=>({inventory:[{rarity:1e15,count:n}],seconds:60,cards:n,best:{rarity:1e15}}),settings={objective:'hits',rarity:1e15};
  const zeros=Array.from({length:50},()=>run(0));assert.equal(pairedSimulationSummary(zeros,zeros,settings).evidence,'insufficient');
  assert.equal(pairedSimulationSummary(zeros,zeros.map(()=>run(1)),settings).evidence,'improved');
  assert.equal(pairedSimulationSummary(zeros.map(()=>run(1)),zeros,settings).evidence,'worse');
  assert.equal(pairedSimulationSummary(zeros.map(()=>run(2)),zeros.map(()=>run(2)),settings).evidence,'overlap');
});
