import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,artifactBonuses} from '../core.js';
import {buildDefaults,calculateBuild,skillClosure} from '../build.js';
import {optimizeBuild} from '../optimizer.js';
import {prepareRollSession} from '../tower-simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function setup(){return normalize({...defaults(data),rolls:1e8,build:{...buildDefaults(),index:10000,under10M:false}},data)}

test('Parkour keeps both its flat and percentage bonuses fixed at every potion-power level',()=>{
  const s=setup();s.build.base.Luck=100;s.build.potions=['LuckOrbBuff'];
  for(const skills of [[],skillClosure(['V3_ALCHEMY_MASTERY'],data)])for(const level of [0,5,10]){
    s.build.skills=skills;s.build.void.VoidPotionPower=level;
    close(effective(s,data).Luck,103*1.1);
    s.build.potions=[];const before=effective(s,data);s.build.potions=['LuckOrbBuff'];const after=effective(s,data);
    for(const key of ['ShinyLuck','AwakenedLuck','FabledLuck','CorruptedLuck','VoidLuck','PotionPowerMult','PotionDurationMult'])close(after[key],before[key]);
    const row=calculateBuild(s,data,s.points,artifactBonuses(s,s.artifact.slots,data)).rows.find(r=>r.name==='Active potions / Parkour Orb');
    assert.deepEqual(row.flat,{Luck:3});assert.deepEqual(row.mult,{Luck:1.1});
  }
});

test('Heavenly and ordinary Mythic potions receive total skill and Void potion power',()=>{
  const s=setup();s.build.skills=skillClosure(['V3_ALCHEMY_MASTERY'],data);s.build.potions=['HeavenlyLuckPotion'];
  const skillPower=1.78;s.build.void.VoidPotionPower=0;const before=effective(s,data);close(before.Luck,1+.4*skillPower);
  s.build.void.VoidPotionPower=10;const after=effective(s,data);close(after.PotionPowerMult,2.18);close(after.Luck,1+.4*2.18);assert.ok(after.Luck>before.Luck);
  s.build.potions.push('LuckPotionMythic','LuckOrbBuff');close(effective(s,data).Luck,(1+8*2.18+3)*(1+.05*2.18)*1.1*(1+.4*2.18));
  s.build.fountain=true;close(effective(s,data).Luck,(1+8*2.18+3)*(1+.05*2.18)*1.1*(1+.4*2.18)*1.25);
});

test('Optimizer and exact-session preparation share the corrected temporary buff rules',()=>{
  const s=setup();s.build.base.Luck=100;s.build.skills=skillClosure(['V3_ALCHEMY_MASTERY'],data);s.build.void.VoidPotionPower=10;s.build.potions=['LuckOrbBuff','HeavenlyLuckPotion'];s.simulation={tower:true};s.build.floor=10;s.build.dungeonSeconds=60;
  s.optimizer={objective:'hits',rarity:1e15,seconds:60,components:{points:false,skills:false,artifact:false,equipment:false,shops:false}};
  const expected=103*1.1*(1+.4*2.18),plan=optimizeBuild(s,data);close(effective(s,data).Luck,expected);close(plan.result.stats.Luck,expected);
  const prepared=prepareRollSession(plan.profile,data,60);close(prepared.normal.stats.Luck,expected);close(prepared.rewardPool(10).prepared.stats.Luck,expected+16);
});

test('Profile 5 Luck sources reproduce the observed 7279.16 with Heavenly receiving Void power',()=>{
  const s=setup();s.build.base.Luck=1290.7;
  s.build.skills=[...skillClosure(['V2_ALCHEMY_POTENCY_4'],data),'CONST_LUCK'];
  s.build.void.VoidPotionPower=10;s.build.fountain=true;
  s.build.potions=['LuckPotionLegendary','HeavenlyLuckPotion'];s.artifact.rarity='Celestial';
  s.artifact.slots=[{id:'Luck',value:261},{id:'LuckMult',value:1.601}];
  const stats=effective(s,data);close(stats.PotionPowerMult,2.03);close(stats.Luck,7279.164394342501);
  assert.equal(Math.round(stats.Luck*100)/100,7279.16);
  const row=calculateBuild(s,data,s.points,artifactBonuses(s,s.artifact.slots,data)).rows.find(r=>r.name==='Active potions / Parkour Orb');
  close(row.flat.Luck,10.15);close(row.mult.Luck,1.812);
});
