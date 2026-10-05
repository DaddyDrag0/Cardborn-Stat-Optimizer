import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,artifactLevel,artifactSlots,scaledMax,fastProbability,effective,optimizePoints,evaluate,simulateRolls} from '../core.js';
import {buildDefaults,skillSelection,skillBudget,skillCost,shopAction,shopCap} from '../build.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const setup=()=>normalize({...defaults(data),build:{...buildDefaults(),index:10000}},data),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('Constellations reject excess selection including prerequisites; imported selections are bounded',()=>{
  const s=setup();for(const id of ['CONST_LUCK','CONST_SHINY']){const r=skillSelection(s.build,id,true,data);assert.ok(!r.error);s.build.skills=r.ids}
  assert.ok(skillSelection(s.build,'CONST_VOID',true,data).error);assert.ok(skillSelection(s.build,'CONST_VOID_GREATER',true,data).error);
  s.build.skills=skillSelection(s.build,'CONST_LUCK_GREATER',true,data).ids;assert.ok(skillSelection(s.build,'CONST_SHINY_GREATER',true,data).error);
  s.build.skills=skillSelection(s.build,'CONST_LUCK_ASCENDANT',true,data).ids;assert.ok(skillSelection(s.build,'CONST_SHINY_ASCENDANT',true,data).error);
  s.build.skills.push('CONST_VOID');assert.equal(normalize(s,data).build.skills.filter(id=>id==='CONST_VOID').length,0);
});
test('Index grants 2 SP per completed 20 tier and prevents overspending including prerequisite cost',()=>{
  const s=setup();s.build.index=19;assert.equal(skillBudget(s.build,data),0);assert.ok(skillSelection(s.build,'V2_FORTUNE_CORE_1',true,data).error);
  s.build.index=20;assert.equal(skillBudget(s.build,data),2);assert.ok(skillSelection(s.build,'V2_FORTUNE_CORE_3',true,data).error);
  const r=skillSelection(s.build,'V2_FORTUNE_CORE_2',true,data);assert.equal(skillCost(r.ids,data),2);s.build.index=40;assert.equal(skillBudget(s.build,data),4);
});
test('PA level 57 follows rolls; caps and fixed slots follow level, rarity, pass and Void milestones',()=>{
  let s=setup();s.rolls=25600000;s.artifact.rarity='Celestial';s.build.passes.ArtifactSlots=true;s.build.void.PASlots=2;s=normalize(s,data);
  assert.equal(artifactLevel(s,data),57);assert.equal(artifactSlots(s,data),9);assert.equal(s.artifact.slots.length,9);assert.ok(s.artifact.slots.every(x=>x.id===''));
  const def=data.personalArtifact.stats.find(d=>d.id==='Luck');s.artifact.slots[0]={id:'Luck',value:999999,locked:false};s=normalize(s,data);assert.equal(s.artifact.slots[0].value,scaledMax(def,57));
  s.artifact.rarity='Mythic';s=normalize(s,data);assert.equal(s.artifact.slots.length,8);s.build.passes.ArtifactSlots=false;s.build.void.PASlots=0;s=normalize(s,data);assert.equal(s.artifact.slots.length,4);
  s.rolls=1e8;s.artifact.rarity='Celestial';s.build.passes.ArtifactSlots=true;s.build.void.PASlots=2;s=normalize(s,data);assert.equal(s.artifact.slots.length,11);
});
test('Tower and Void purchases enforce balances/caps, refunds return gold and Void has no refunds',()=>{
  const s=setup();s.build.currencies.tower=3;assert.ok(shopAction(s.build,'tower','Luck',1,data).error);
  s.build.currencies.tower=4;const buy=shopAction(s.build,'tower','Luck',1,data);assert.deepEqual(buy,{level:1,balance:0});s.build.tower.Luck=buy.level;s.build.currencies.tower=buy.balance;assert.deepEqual(shopAction(s.build,'tower','Luck',-1,data),{level:0,balance:4});
  s.build.tower.Luck=25;assert.ok(shopAction(s.build,'tower','Luck',1,data).error);assert.equal(shopCap(s.build,data.towerShop.find(d=>d.id==='ShinyLuck'),'tower'),25);
  s.build.void.PASlots=2;s.build.currencies.void=1000;assert.ok(shopAction(s.build,'void','PASlots',1,data).error);assert.ok(shopAction(s.build,'void','PASlots',-1,data).error);
  s.build.tower.DoubleRollChance=110;s.build.void.VoidLuckPct=999;const n=normalize(s,data);assert.equal(n.build.tower.DoubleRollChance,15);assert.equal(n.build.void.VoidLuckPct,10);
});
test('All eight form sets are exported with screenshot bonuses and add independently',()=>{
  assert.equal(data.indexSets.length,27);const s=setup();s.build.under10M=false;s.build.sets=['StarterWorld','StarterWorld_Awakened','VoidWorld_Shiny'];const r=effective(s,data);close(r.Luck,1+2+17+6);close(r.AwakenedLuck,4.3);close(r.VoidLuck,1.5);
});
test('Fabled rarity threshold applies to card targets, Lucky Hand and point optimization',()=>{
  const s=setup();s.goal.kind='rarity';s.goal.rarity=1e9;s.goal.borders=['Fabled'];s.fabledMax=1e8;s.unlocks.Fabled=true;assert.equal(fastProbability(s,data,effective(s,data)),0);s.build.relics=[{id:'RelicOfTheLuckyHand',border:1}];assert.equal(evaluate(s,data).probability,0);
  s.build.relics=[];s.rolls=1500000;s.goal.rarity=1e6;s.fabledMax=1e8;const normalized=normalize(s,data),plan=optimizePoints(normalized,data);normalized.points=plan.points;close(evaluate(normalized,data).hitsPerHour,plan.result.hitsPerHour);
});
test('Seeded simulator repeats results and never awards Fabled above the unlocked rarity limit',()=>{
  const s=setup();s.goal.rarity=1;s.goal.borders=[];s.fabledMax=0;const a=simulateRolls(s,data,1000,123),b=simulateRolls(s,data,1000,123);assert.deepEqual(a,b);assert.equal(a.cards,1000);assert.equal(a.hits,1000);assert.ok(a.best.every(r=>!r.borders.includes('Fabled')));
});
