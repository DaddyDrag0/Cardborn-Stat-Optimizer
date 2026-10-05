import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,evaluate,optimizePoints,validPoints,artifactBonuses,artifactSlots,profileWarnings,fastProbability,batchDistribution} from '../core.js';
import {buildDefaults,skillClosure,removeSkill,calculateBuild,craftedBonuses,luckVariants} from '../build.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function setup(){const s=defaults(data);s.build=buildDefaults();s.build.index=10000;return normalize(s,data)}

test('All 16 crafted tiers reproduce the source; Frozen Crown tier preview matches the screenshot',()=>{
  assert.deepEqual(data.craftedTiers.map(t=>t.boost),[0,60,110,175,230,350,500,750,800,900,1000,1200,1400,1600,2000,2500]);
  const s=setup();s.build.crafted='FrozenCrown';s.build.craftedTier='FabledCorrupted';s.build.craftedIndexPoints=49;
  const r=craftedBonuses(s.build,data);
  for(const [k,v]of Object.entries({Luck:660,ShinyLuck:11,AwakenedLuck:15.4,CorruptedLuck:13.2,VoidLuck:9.9,RollSpeed:.3}))close(r.preview[k],v);
  assert.equal(r.indexPercent,240);assert.equal(r.pointsToNext,1);close(r.flat.Luck,2244);close(r.flat.RollSpeed,.3);
  for(const tier of data.craftedTiers){s.build.craftedTier=tier.id;const c=craftedBonuses(s.build,data);close(c.preview.Luck,60*(1+tier.boost/100));close(c.preview.RollSpeed,.3)}
});

test('Index boundaries, separate/combined assumptions and speed toggle feed totals once',()=>{
  const s=setup();s.build.crafted='FrozenCrown';s.build.craftedTier='FabledCorrupted';s.build.under10M=false;
  for(const [points,percent,next]of [[0,0,2],[1,0,1],[2,10,2],[48,240,2],[49,240,1],[50,250,2]]){s.build.craftedIndexPoints=points;const c=craftedBonuses(s.build,data);assert.equal(c.indexPercent,percent);assert.equal(c.pointsToNext,next)}
  s.build.craftedIndexPoints=49;close(effective(s,data).Luck,2245);close(effective(s,data).RollSpeed,.3);
  s.build.craftedIndexOrder='combined';close(effective(s,data).Luck,805);
  s.build.craftedIndexSpeed=true;close(effective(s,data).RollSpeed,1.02);close(effective(s,data).RollInterval,.2);
  s.build.craftedIndexSpeed=false;s.build.craftedIndexOrder='separate';s.build.void.VoidArtifactPower=2;
  s.artifact.slots=[{id:'LuckMult',value:1.5,locked:false}];const pa=artifactBonuses(s,s.artifact.slots,data);
  close(effective(s,data).Luck,(1+2244*1.1)*pa.mult.Luck);close(effective(s,data).RollSpeed,.33);
  s.build.crafted='';close(effective(s,data).Luck,pa.mult.Luck);close(effective(s,data).RollSpeed,0);
});

test('Old profiles default to normal/index zero, new values round-trip and optimizer uses the same equipment',()=>{
  const s=setup();delete s.build.craftedTier;delete s.build.craftedIndexPoints;const old=normalize(s,data);assert.equal(old.build.craftedTier,'Normal');assert.equal(old.build.craftedIndexPoints,0);
  s.rolls=1500000;s.build.crafted='FrozenCrown';s.build.craftedTier='FabledCorrupted';s.build.craftedIndexPoints=49;
  const roundtrip=normalize(JSON.parse(JSON.stringify(s)),data);assert.equal(roundtrip.build.craftedTier,'FabledCorrupted');assert.equal(roundtrip.build.craftedIndexPoints,49);
  const plan=optimizePoints(roundtrip,data);roundtrip.points=plan.points;close(evaluate(roundtrip,data).hitsPerHour,plan.result.hitsPerHour);assert.equal(roundtrip.build.craftedIndexPoints,49);
  s.build.craftedTier='<script>';s.build.craftedIndexPoints=-10;assert.equal(normalize(s,data).build.craftedTier,'Normal');assert.equal(normalize(s,data).build.craftedIndexPoints,0);
});
test('Build catalog has all 102 unique nodes with real prerequisites and complete equipment',()=>{assert.equal(data.skillNodes.length,102);assert.equal(new Set(data.skillNodes.map(x=>x.id)).size,102);for(const node of data.skillNodes)for(const req of node.requires)assert.ok(data.skillNodes.some(n=>n.id===req),`${node.name}: ${req}`);assert.equal(Object.keys(data.craftedArtifacts).length,13);assert.equal(Object.keys(data.relics).length,16);assert.equal(Object.keys(data.potions).length,22)});
test('Starting values, exact point gains, and under-10M boundary derive totals without entered stats',()=>{const s=setup();s.rolls=9999999;s.points={Luck:20,Shiny:10,Awakened:10,Void:10};s.stats.Luck=999;const r=effective(s,data);close(r.Luck,11*1.25);close(r.ShinyLuck,1.5);close(r.AwakenedLuck,2);close(r.VoidLuck,2.5);close(r.FabledLuck,2);s.rolls=1e7;close(effective(s,data).Luck,11)});
test('Selecting Transcendence closes both paths and mastery requirements; removals cascade',()=>{const ids=skillClosure(['V5_TRANSCEND_FINAL'],data);assert.ok(ids.includes('V5_TRANSCEND_STAR_2'));assert.ok(ids.includes('V5_TRANSCEND_ABYSS_2'));assert.ok(ids.includes('V4_CORRUPTED_MASTERY'));assert.equal(ids.length,81);const remaining=removeSkill(ids,'V5_TRANSCEND_STAR_1',data);assert.ok(!remaining.includes('V5_TRANSCEND_FINAL'));assert.ok(remaining.includes('V5_TRANSCEND_ABYSS_2'))});
test('Fortune flat and percentage bonuses add as ComputeBonuses; pass final Shiny multiplier is separate',()=>{const s=setup();s.build.skills=skillClosure(['V3_FORTUNE_MASTERY'],data);s.build.passes.Shiny=true;const result=calculateBuild(s,data,s.points,artifactBonuses(s,[],data));const row=result.rows.find(x=>x.name==='Skill tree');close(row.flat.Luck,36);close(row.percent.Luck,.10);close(row.flat.LuckyHandChance,.23);close(result.stats.Luck,37*1.10);close(result.stats.ShinyLuck,1.5*1.1)});
test('Crafted artifacts, relic borders, Index Sets and Tower levels all feed the build',()=>{const s=setup();s.build.crafted='RuinedClover';s.build.relics=[{id:'OldBoot',border:6}];s.build.sets=['StarterWorld'];s.build.tower.Luck=3;s.build.tower.AwakenedLuck=2;const r=effective(s,data);close(r.Luck,1+.5+10+2+6);close(r.ShinyLuck,1.1);close(r.AwakenedLuck,1.8);s.build.towerAwakenedGain=.3;close(effective(s,data).AwakenedLuck,1.6)});
test('Void resonance leaves PA bonuses unchanged; other Void upgrades retain their effects',()=>{const s=setup();s.build.void={PASlots:2,VoidArtifactPower:2,VoidPotionPower:5,VoidLuckPct:3};s.build.passes.ArtifactSlots=true;s.artifact.rarity='Celestial';s.artifact.slots=[{id:'Luck',value:100,locked:false},{id:'LuckMult',value:1.2,locked:false}];s.build.potions=['LuckPotionLarge'];const n=normalize(s,data),r=effective(n,data),pa=artifactBonuses(n,n.artifact.slots,data);close(pa.flat.Luck,130);close(pa.mult.Luck,1.26);close(r.PotionPowerMult,1.2);close(r.Luck,(1+130+3.6)*1.26);close(r.VoidLuck,1.09);assert.equal(artifactSlots(n,data),9);n.rolls=1e8;assert.equal(artifactSlots(n,data),11)});
test('Mythic potion percentage, Parkour and Heavenly Luck stay distinct; model order is selectable',()=>{const s=setup();s.build.potions=['LuckPotionMythic','LuckOrbBuff','HeavenlyLuckPotion'];const r=effective(s,data);close(r.Luck,(1+8+3)*1.05*1.1*1.4);s.build.skills=['CONST_LUCK'];s.artifact.slots=[{id:'LuckMult',value:1.5,locked:false}];const separate=effective(s,data).Luck;s.build.percentOrder='combined';const combined=effective(s,data).Luck;assert.ok(separate>combined)});
test('Weather applies once, Dungeon estimate is opt-in and observed values never affect totals',()=>{const s=setup();s.weather='GlaringSun';s.build.observed.Luck=999;close(effective(s,data).Luck,7*1.1);s.build.inDungeon=true;s.build.floor=30;const r=effective(s,data);close(r.Luck,7*1.1+48);close(r.ShinyLuck,2.2);close(r.AwakenedLuck,3);close(r.CorruptedLuck,2)});
test('Periodic relic weights use synchronized intersections and never become flat Luck',()=>{const s=setup();s.build.passes.TwoRelic=true;s.build.relics=[{id:'RelicOfBonus',border:1},{id:'WeightedDice',border:1}];const r=effective(s,data),variants=luckVariants(r);close(r.Luck,1);close(variants.reduce((n,v)=>n+v.weight,0),1);close(variants.find(v=>v.mult===8).weight,1/50);const expected=variants.reduce((n,v)=>n+v.weight*fastProbability(s,data,{...r,Luck:r.Luck*v.mult,periodic:[]}),0);close(evaluate(s,data).probability,expected)});
test('Build point optimization agrees with independent brute force under tree and artifact multipliers',()=>{const s=setup();s.rolls=1500000;s.build.skills=['CONST_LUCK'];s.artifact.slots=[{id:'LuckMult',value:1.2,locked:false}];const actual=optimizePoints(s,data);let best=0;for(let l=0;l<=20;l++)for(let sh=0;sh<=10;sh++)for(let aw=0;aw<=10;aw++)for(let v=0;v<=10;v++)if(l+sh+aw+v<=30)best=Math.max(best,evaluate(s,data,{Luck:l,Shiny:sh,Awakened:aw,Void:v}).hitsPerHour);close(actual.result.hitsPerHour,best);assert.ok(validPoints(actual.points,30,data));s.points=actual.points;close(evaluate(s,data).hitsPerHour,actual.result.hitsPerHour)});
test('Impossible constellation/relic builds warn, and imported identifiers and numeric extremes are bounded',()=>{const s=setup();s.build.skills=['CONST_LUCK','CONST_SHINY','CONST_VOID'];s.build.relics=[{id:'OldBoot',border:1},{id:'OldBoot',border:6}];assert.ok(profileWarnings(s,data).some(w=>w.includes('Constellations')));assert.ok(profileWarnings(s,data).some(w=>w.includes('once')));s.build.skills.push('<script>');s.build.void.PASlots=999;s.build.tower.ThirdRelicSlot=999;const clean=normalize(s,data);assert.ok(!clean.build.skills.includes('<script>'));assert.equal(clean.build.void.PASlots,2);assert.equal(clean.build.tower.ThirdRelicSlot,1)});
