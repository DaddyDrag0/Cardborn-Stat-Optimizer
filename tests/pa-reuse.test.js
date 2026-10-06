import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,artifactLevel,scaledMax} from '../core.js';
import {buildDefaults} from '../build.js';
import {optimizeBuild,reuseOwnedPARolls,createBuildEvaluator} from '../optimizer.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const slot=(id,value,locked=false)=>({id,value,locked});
function setup(){return normalize({...defaults(data),rolls:26175180,build:{...buildDefaults(),base:{ShinyLuck:8},under10M:false},optimizer:{objective:'borders',borders:['Shiny'],seconds:60,components:{points:false,skills:false,artifact:true,equipment:false,shops:false}},artifact:{rarity:'Celestial',quality:.95,slots:[slot('ShinyLuck',7.46/1.3),slot('ShinyLuckMult',1+.582/1.3),slot('PotionDurationMult',.05),slot('Luck',5,true),slot('FabledLuck',.5,true)]}},data)}
function planned(s,id){const d=data.personalArtifact.stats.find(x=>x.id===id);return Math.round((d.min+(scaledMax(d,artifactLevel(s,data))-d.min)*s.artifact.quality)*10**d.decimals)/10**d.decimals}
function propose(s,slots){return{...s,artifact:{...s.artifact,slots}}}

test('An improved PA build keeps the existing above-quality Shiny rolls in their own slots',()=>{
  const s=setup(),before=structuredClone(s),plan=optimizeBuild(s,data);
  assert.deepEqual(s,before);
  for(const i of [0,1,3,4])assert.deepEqual(plan.profile.artifact.slots[i],s.artifact.slots[i]);
  assert.notEqual(plan.profile.artifact.slots[2].id,'PotionDurationMult');
  assert.ok(plan.result.score>plan.current.score);
  const downgraded=structuredClone(plan.profile);
  for(const i of [0,1])downgraded.artifact.slots[i].value=planned(s,downgraded.artifact.slots[i].id);
  assert.ok(plan.result.score>createBuildEvaluator(s,data).evaluate(downgraded).score);
  assert.deepEqual(effective(normalize(plan.profile,data),data),plan.result.stats);
});

test('Slot permutations reuse the same owned values without inventing rerolls or moving Keep slots',()=>{
  const s=setup(),candidate=propose(s,[slot('ShinyLuckMult',planned(s,'ShinyLuckMult')),slot('ShinyLuck',planned(s,'ShinyLuck')),slot('RollTwiceChance',planned(s,'RollTwiceChance')),...s.artifact.slots.slice(3)]),before=structuredClone(candidate),result=reuseOwnedPARolls(candidate,s,data);
  for(const i of [0,1,3,4])assert.deepEqual(result.artifact.slots[i],s.artifact.slots[i]);
  assert.equal(result.artifact.slots[2].id,'RollTwiceChance');assert.deepEqual(candidate,before);
});

test('One owned strong roll is reused only once when requesting two copies',()=>{
  const s=setup(),p=planned(s,'ShinyLuck'),candidate=propose(s,[slot('ShinyLuck',p),slot('ShinyLuck',p),slot('RollTwiceChance',planned(s,'RollTwiceChance')),...s.artifact.slots.slice(3)]),result=reuseOwnedPARolls(candidate,s,data);
  const copies=result.artifact.slots.filter(x=>x.id==='ShinyLuck');
  assert.equal(copies.length,2);assert.equal(copies.filter(x=>x.value===s.artifact.slots[0].value).length,1);assert.equal(copies.filter(x=>x.value===p).length,1);
});

test('Dropping one duplicate retains the stronger owned copy at its existing position',()=>{
  const s=setup();s.artifact.slots[2]=slot('ShinyLuck',5.85);
  const candidate=propose(s,[slot('ShinyLuck',planned(s,'ShinyLuck')),slot('ShinyLuckMult',planned(s,'ShinyLuckMult')),slot('RollTwiceChance',planned(s,'RollTwiceChance')),...s.artifact.slots.slice(3)]),result=reuseOwnedPARolls(candidate,s,data);
  assert.deepEqual(result.artifact.slots[2],s.artifact.slots[2]);assert.equal(result.artifact.slots.filter(x=>x.id==='ShinyLuck').length,1);assert.equal(result.artifact.slots[0].id,'RollTwiceChance');
});

test('Locked rolls cannot be cloned into an extra unlocked copy',()=>{
  const s=setup();s.artifact.slots[0].locked=true;
  const p=planned(s,'ShinyLuck'),candidate=propose(s,[s.artifact.slots[0],slot('ShinyLuck',p),slot('RollTwiceChance',planned(s,'RollTwiceChance')),...s.artifact.slots.slice(3)]),result=reuseOwnedPARolls(candidate,s,data);
  assert.deepEqual(result.artifact.slots[0],s.artifact.slots[0]);assert.equal(result.artifact.slots[1].value,p);
});

test('The planned quality still improves weaker rolls and allows genuine stat changes',()=>{
  const s=setup();s.artifact.slots[0].value=1;
  const p=planned(s,'ShinyLuck'),candidate=propose(s,[slot('ShinyLuck',p),...s.artifact.slots.slice(1)]),result=reuseOwnedPARolls(candidate,s,data);
  assert.equal(result.artifact.slots[0].value,p);
  const other=propose(s,[slot('VoidLuck',planned(s,'VoidLuck')),...s.artifact.slots.slice(1)]);
  assert.equal(reuseOwnedPARolls(other,s,data).artifact.slots[0].id,'VoidLuck');
  // Later search passes may reselect a stat removed by an intermediate build.
  const original=setup();assert.equal(reuseOwnedPARolls(candidate,original,data).artifact.slots[0].value,original.artifact.slots[0].value);
});
