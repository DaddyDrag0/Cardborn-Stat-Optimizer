import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,cardDistribution,borderProbabilities,targetProbability,evaluate,effective,artifactLevel,artifactSlots,artifactBonuses,scaledMax,validPoints,optimizePoints,optimizeArtifact,profileWarnings,sum,POINTS} from '../core.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},weather:{Clear:{boostMultiplier:1}}};
const fresh=d=>{const s=defaults(d);s.stats.Luck=1;s.goal.rarity=100;s.goal.borders=[];return s};
const near=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
test('Game data keeps the Cardborn channels, exact point gains, and all cap stages',()=>{
  assert.equal(data.cards.length,160);assert.equal(data.pointCaps.length,8);assert.equal(data.pointGains.Void,.15);assert.equal(data.pointGains.Luck,.5);assert.equal(sum(data.pointCaps.at(-1)),2075);assert.equal(data.personalArtifact.stats.length,18);assert.deepEqual(data.estimatedBorderOdds,['Fabled','Corrupted','Void']);
});
test('Sequential rarest-first card checks use ceil, rather than a continuous luck ratio',()=>{
  const s=fresh(toy),distribution=cardDistribution(s,toy,3);near(distribution[0].p,1/34);near(distribution.reduce((n,o)=>n+o.p,0),1);assert.equal(distribution[0].card.name,'Rare');
});
test('Secret skin upgrades split the base probability and preserve total mass',()=>{
  const d={...toy,cards:[...toy.cards,{name:'Secret',rarityValue:900000,isSecret:true}],secretSkins:{Rare:[{to:'Secret',chanceDenom:9000}]}},s=fresh(d),p=cardDistribution(s,d,1);near(p.find(o=>o.card.name==='Secret').p,1/900000);near(p.reduce((n,o)=>n+o.p,0),1);
});
test('Badge and weather filters exclude unavailable cards without deleting the fallback',()=>{
  const d={...toy,cards:[{name:'Boss',rarityValue:1000,badgeRequired:'BossBadge'},{name:'Weather',rarityValue:500,weatherLock:'Storm'},...toy.cards]},s=fresh(d);assert.deepEqual(cardDistribution(s,d,1).map(x=>x.card.name),['Rare','Common']);s.badges=['BossBadge'];s.weather='Storm';assert.equal(cardDistribution(s,d,1).length,4);
});
test('Borders stack independently, gates apply, and probabilities never exceed one',()=>{
  const s=fresh(toy);s.unlocks.Awakened=true;s.goal.borders=['Shiny','Awakened'];const stats={...s.stats,ShinyLuck:10,AwakenedLuck:1000};near(targetProbability(s,toy,stats).p,.01*.1*.001);assert.equal(borderProbabilities(s,{...stats,ShinyLuck:1000}).Shiny,1);s.unlocks.Awakened=false;assert.equal(targetProbability(s,toy,stats).p,0);
});
test('Void probability uses rounded-up odds at the entered base odds',()=>{
  const s=fresh(toy);s.odds.Void=100;s.stats.VoidLuck=3;near(borderProbabilities(s,s.stats).Void,1/34);
});
test('Lucky Hand selects the stronger candidate instead of blindly doubling the target chance',()=>{
  const s=fresh(toy);s.stats.ShinyLuck=0;s.stats.VoidLuck=0;s.odds.Void=1e30;s.stats.LuckyHandChance=1;near(targetProbability(s,toy,s.stats).p,1-.99**2);s.goal={kind:'card',card:'Common',borders:[]};near(targetProbability(s,toy,s.stats).p,.99**2);
});
test('A stronger border on a common card can beat the desired rare card under Lucky Hand',()=>{
  const s=fresh(toy);s.stats.LuckyHandChance=1;s.stats.VoidLuck=0;s.odds.Void=1e30;near(targetProbability(s,toy,s.stats).p,.01980199);assert.ok(targetProbability(s,toy,s.stats).p<1-.99**2);
});
test('Session chance uses the complement of repeated misses and remains at most 100%',()=>{
  const s=fresh(toy);s.stats.RollInterval=1;s.minutes=1;const result=evaluate(s,toy);near(result.chance,1-.99**60);near(result.averageSeconds,100);s.minutes=1e8;assert.equal(evaluate(s,toy).chance,1);
});
test('Extra-roll batch chance is distinct from expected hits and mean kept cards',()=>{
  const s=fresh(toy);s.stats.DoubleRollChance=1;const result=evaluate(s,toy);near(result.cycleP,1-.99**2);near(result.cardsPerHour,7200);near(result.hitsPerHour,72);near(result.averageSeconds,1/(1-.99**2));
});
test('Artifact level, level ranges, rarity slots and two Void slots follow exported definitions',()=>{
  const s=fresh(data);s.rolls=1e8;s.artifact.rarity='Celestial';s.artifact.gamepass=true;s.artifact.voidSlots=2;assert.equal(artifactLevel(s,data),100);assert.equal(artifactSlots(s,data),11);s.rolls=0;assert.equal(artifactSlots(s,data),0);assert.equal(scaledMax(data.personalArtifact.stats.find(d=>d.id==='Luck'),50),253);
});
test('Second copies halve the bonus above one; rarity affects the bonus rather than the whole multiplier',()=>{
  const s=fresh(data);s.artifact.rarity='Celestial';const b=artifactBonuses(s,[{id:'LuckMult',value:1.5},{id:'LuckMult',value:1.5},{id:'Luck',value:10},{id:'Luck',value:10}],data);near(b.mult.Luck,1.65*1.325);near(b.flat.Luck,19.5);
});
test('Changing points removes current point contributions, and applying a plan does not double count',()=>{
  const s=fresh(toy);s.stats.Luck=6;s.points.Luck=10;const next={...s.points,Luck:20},result=effective(s,toy,next);near(result.Luck,11);const adopted={...s,points:next,stats:result};near(effective(adopted,toy).Luck,11);s.pointScale.Luck=0;near(effective(s,toy,next).Luck,6);
});
test('Invalid current allocations and inconsistent displayed artifact totals are surfaced',()=>{
  const s=fresh(data);s.points.Luck=30;assert.match(profileWarnings(s,data).join(' '),/cap/);s.points.Luck=0;s.artifact.slots=[{id:'Luck',value:10}];assert.match(profileWarnings(s,data).join(' '),/displayed total/);
});
test('No points can exceed an early cap without filling every prerequisite stat',()=>{
  assert.equal(validPoints({Luck:21,Shiny:0,Awakened:0,Void:0},100,toy),false);assert.equal(validPoints({Luck:21,Shiny:10,Awakened:10,Void:10},51,toy),true);
});
test('Exhaustive point search matches independent brute force for a small budget',()=>{
  const s=fresh(toy);s.rolls=30*50000;s.goal.borders=['Shiny'];const result=optimizePoints(s,toy);let best=0;
  for(let l=0;l<=20;l++)for(let sh=0;sh<=10;sh++)for(let aw=0;aw<=10;aw++)for(let v=0;v<=10;v++){const p={Luck:l,Shiny:sh,Awakened:aw,Void:v};if(validPoints(p,30,toy))best=Math.max(best,evaluate(s,toy,p).hitsPerHour)}
  near(result.result.hitsPerHour,best);assert.ok(validPoints(result.points,30,toy));
});
test('Maximum-budget point search stays valid and includes the actual rounded Void odds',()=>{
  const s=fresh(toy);s.rolls=2075*50000;s.goal.borders=['Shiny','Awakened','Void'];s.unlocks.Awakened=true;const result=optimizePoints(s,toy);assert.ok(validPoints(result.points,2075,toy));assert.ok(result.result.hitsPerHour>=result.current.hitsPerHour);assert.ok(result.checked>100000);
});
test('Artifact search respects physical locked slots, copy limits, level limits and unlocked slot count',()=>{
  const s=fresh(toy);s.stats.Luck=100;s.stats.ShinyLuck=5;s.artifact.slots=[{id:'Luck',value:5,locked:false},{id:'ShinyLuck',value:1,locked:true}];const plan=optimizeArtifact(s,toy);assert.equal(plan.slots.length,artifactSlots(s,toy));assert.equal(plan.slots[1].id,'ShinyLuck');assert.equal(plan.slots[1].value,1);assert.equal(plan.slots[1].locked,true);assert.ok(plan.result.hitsPerHour>=plan.current.hitsPerHour);for(const d of data.personalArtifact.stats)assert.ok(plan.slots.filter(x=>x.id===d.id).length<=2);
});
test('Imported profile values are bounded and unknown fields cannot become executable UI',()=>{
  const s=normalize({stats:{Luck:-1,LuckyHandChance:5},goal:{card:'<script>',borders:['Platinum','Void']},artifact:{slots:[{id:'bad',value:1}]}},data);assert.equal(s.stats.Luck,.0001);assert.equal(s.stats.LuckyHandChance,1);assert.deepEqual(s.goal.borders,['Void']);assert.equal(s.artifact.slots.length,0);assert.notEqual(s.goal.card,'<script>');
});
