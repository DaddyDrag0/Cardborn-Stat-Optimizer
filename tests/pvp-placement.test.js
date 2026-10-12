import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,artifactBonuses} from '../core.js';
import {buildDefaults,calculateBuild,skillClosure} from '../build.js';
import {optimizeBuild} from '../optimizer.js';
import {evaluateTarget} from '../target-results.js';
import {prepareRollSession,simulateRollSession,towerCardsOnFloor} from '../tower-simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const tiers=[['1',1.25,1.05,1.125],['2-3',1.175,1.04,1.09],['4-10',1.125,1.03,1.06],['11-20',1.09,1.02,1.04],['21-30',1.06,1.015,1.025],['31-50',1.04,1.01,1.015],['unranked',1,1,1]];

test('Every PvP placement applies the displayed multipliers once to its three final stats',()=>{
  const s=normalize({...defaults(data),rolls:1e8,build:{...buildDefaults(),index:10000,crafted:'FrozenCrown',craftedTier:'ShinyAwakened',craftedIndexPoints:116,skills:skillClosure(['V3_RADIANCE_MASTERY'],data),passes:{Shiny:true,Awakened:true},potions:['LuckPotionMythic','ShinyPotionMythic','AwakenedPotionMythic'],fountain:true,void:{VoidPotionPower:10,VoidArtifactPower:10}},artifact:{...defaults(data).artifact,slots:[{id:'LuckMult',value:1.5},{id:'AwakenedLuckMult',value:1.2}]}},data);
  for(const percentOrder of ['combined','separate']){
    s.build.percentOrder=percentOrder;s.build.pvpPlacement='unranked';const before=effective(s,data);
    for(const [id,luck,shiny,awakened]of tiers){
      s.build.pvpPlacement=id;const after=effective(s,data);close(after.Luck,before.Luck*luck);close(after.ShinyLuck,before.ShinyLuck*shiny);close(after.AwakenedLuck,before.AwakenedLuck*awakened);
      for(const key of Object.keys(before).filter(k=>!['Luck','ShinyLuck','AwakenedLuck'].includes(k)))assert.deepEqual(after[key],before[key]);
      const row=calculateBuild(s,data,s.points,artifactBonuses(s,s.artifact.slots,data)).rows.find(r=>r.name==='PvP leaderboard placement');assert.deepEqual(row.mult,{Luck:luck,ShinyLuck:shiny,AwakenedLuck:awakened});
    }
  }
});

test('Old and invalid profiles are unranked; all placement tiers survive export and import',()=>{
  const raw={...defaults(data),build:buildDefaults()};delete raw.build.pvpPlacement;const legacy=normalize(raw,data);assert.equal(legacy.build.pvpPlacement,'unranked');
  for(const invalid of ['','top1','51','<script>',null,{},-1]){const s=normalize({...raw,build:{...raw.build,pvpPlacement:invalid}},data);assert.equal(s.build.pvpPlacement,'unranked');assert.deepEqual(effective(s,data),effective(legacy,data));}
  for(const [id]of tiers){const s=normalize({...raw,build:{...raw.build,pvpPlacement:id}},data);assert.equal(normalize(JSON.parse(JSON.stringify(s)),data).build.pvpPlacement,id);}
});

test('Placement feeds Target, optimizer and exact regular/Tower draws with independent expected probabilities',()=>{
  const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{}};
  const s=normalize({...defaults(toy),rolls:0,fabledMax:0,build:{...buildDefaults(),pvpPlacement:'1',base:{Luck:4},under10M:false,floor:10,dungeonSeconds:60},goal:{kind:'card',card:'Rare',borders:['Shiny','Awakened']},odds:{Shiny:4,Awakened:4,Fabled:1e100,Corrupted:1e100,Void:1e100},simulation:{tower:false},optimizer:{objective:'hits',rarity:1e9,borders:['Shiny','Awakened'],seconds:60,components:{points:false,skills:false,artifact:false,equipment:false,shops:false}}},toy);
  const probability=1/Math.ceil(100/(5*2.25))*(1.05/4)*(1.125/4),target=evaluateTarget(s,toy);close(target.probability,probability);close(target.hitsPerHour,3600*probability);
  s.simulation.tower=true;const plan=optimizeBuild(s,toy);assert.equal(plan.profile.build.pvpPlacement,'1');close(plan.result.stats.Luck,5);close(plan.result.normalHits,60*probability);
  const searched=optimizeBuild({...s,optimizer:{...s.optimizer,components:{points:true,skills:true,artifact:true,equipment:true,shops:true}}},toy);assert.equal(searched.profile.build.pvpPlacement,'1');
  const expectedTower=Array.from({length:10},(_,i)=>towerCardsOnFloor(i+1)/Math.ceil(100/((5+8*Math.floor((i+1)/5))*2.25))*(1.05+.4*Math.floor((i+1)/10))/4*(1.125/4)).reduce((a,b)=>a+b,0);close(plan.result.towerHits,expectedTower);
  const prepared=prepareRollSession(plan.profile,toy,60);close(prepared.normal.stats.Luck,5);close(prepared.normal.stats.ShinyLuck,1.05);close(prepared.rewardPool(10).prepared.stats.Luck,21);
  const runs=Array.from({length:2000},(_,i)=>simulateRollSession(prepared,123+Math.imul(i,2654435761)).hits),mean=runs.reduce((a,b)=>a+b,0)/runs.length,variance=runs.reduce((sum,x)=>sum+(x-mean)**2,0)/(runs.length-1);
  assert.ok(Math.abs(mean-(60*probability+expectedTower))<6*Math.sqrt(variance/runs.length));
});
