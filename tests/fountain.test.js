import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,artifactBonuses} from '../core.js';
import {buildDefaults,calculateBuild} from '../build.js';
import {optimizeBuild} from '../optimizer.js';
import {towerCardsOnFloor,prepareRollSession,simulateRollSession} from '../tower-simulation.js';
import {pairedSimulationSummary} from '../rarity-results.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('Fountain adds 25% Luck independently of potion power and survives profile normalization',()=>{
  const s=normalize({...defaults(data),rolls:1e8,build:{...buildDefaults(),index:10000,crafted:'FrozenCrown',skills:['CONST_LUCK'],potions:['LuckPotionMythic','LuckOrbBuff','HeavenlyLuckPotion'],void:{VoidPotionPower:5}},artifact:{...defaults(data).artifact,slots:[{id:'LuckMult',value:1.5},{id:'PotionPowerMult',value:.5}]}},data);
  assert.equal(s.build.fountain,false);assert.equal(normalize({...s,build:{...s.build,fountain:'true'}},data).build.fountain,false);
  for(const percentOrder of ['combined','separate'])for(const power of [0,10]){
    s.build.percentOrder=percentOrder;s.build.void.VoidPotionPower=power;
    const before=effective(s,data);s.build.fountain=true;const after=effective(s,data);
    close(after.Luck,before.Luck*1.25);for(const key of Object.keys(before).filter(k=>k!=='Luck'))assert.deepEqual(after[key],before[key]);
    const row=calculateBuild(s,data,s.points,artifactBonuses(s,s.artifact.slots,data)).rows.find(r=>r.name==='Fountain boost');assert.deepEqual(row.mult,{Luck:1.25});assert.deepEqual(row.flat,{});
    const saved=normalize(JSON.parse(JSON.stringify(s)),data);assert.equal(saved.build.fountain,true);close(effective(saved,data).Luck,after.Luck);s.build.fountain=false;
  }
});

test('Optimizer and exact regular/Tower simulations use the same fixed Fountain boost once',()=>{
  const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{}};
  const s=normalize({...defaults(toy),rolls:0,build:{...buildDefaults(),base:{Luck:4},under10M:false,fountain:true,floor:10,dungeonSeconds:60},odds:{Shiny:1e100,Awakened:1e100,Fabled:1e100,Corrupted:1e100,Void:1e100},simulation:{tower:true},optimizer:{objective:'hits',rarity:100,seconds:60,components:{points:false,skills:false,artifact:false,equipment:false,shops:false}}},toy);
  assert.equal(effective(s,toy).Luck,5);const plan=optimizeBuild(s,toy);assert.equal(plan.profile.build.fountain,true);assert.equal(plan.result.stats.Luck,5);
  const normal=60/Math.ceil(100/(5*2.25)),tower=Array.from({length:10},(_,i)=>towerCardsOnFloor(i+1)/Math.ceil(100/((5+8*Math.floor((i+1)/5))*2.25))).reduce((a,b)=>a+b,0);
  close(plan.result.normalHits,normal);close(plan.result.towerHits,tower);
  const prepared=prepareRollSession(plan.profile,toy,60),runs=Array.from({length:500},(_,i)=>simulateRollSession(prepared,123+Math.imul(i,2654435761))),summary=pairedSimulationSummary(runs,runs,plan.settings);
  assert.ok(Math.abs(summary.current.mean-(normal+tower))<summary.current.error95*3);
});
