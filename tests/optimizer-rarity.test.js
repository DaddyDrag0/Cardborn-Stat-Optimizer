import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,rollOutcomes,batchDistribution} from '../core.js';
import {buildDefaults} from '../build.js';
import {periodicGroups} from '../roll-timing.js';
import {optimizerSettings,createBuildEvaluator,optimizeBuild} from '../optimizer.js';
import {towerSessionPlan,towerCardsOnFloor,towerBonuses,prepareRollSession,simulateRollSession} from '../tower-simulation.js';
import {rarityResults,pairedSimulationSummary} from '../rarity-results.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{}};
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function profile(){const s=normalize({...defaults(toy),build:{...buildDefaults(),index:400,floor:25,dungeonSeconds:20},simulation:{tower:true},optimizer:{objective:'hits',rarity:123456,seconds:61}},toy);s.build.tower.DoubleRollChance=15;s.build.tower.RollTwiceChance=15;s.build.corrupted.FracturedRoll=6;s.build.tower.LuckyHandChance=15;s.build.relics=[{id:'RelicOfBonus',border:1}];s.fabledMax=10;s.odds={Shiny:100,Awakened:100,Fabled:100,Corrupted:100,Void:100};return s}
function independent(s,settings,threshold){
  const base=structuredClone(s);if(settings.tower)base.build.inDungeon=false;const stats=effective(base,toy),cycles=Math.floor(settings.seconds/stats.RollInterval),batches=batchDistribution(stats),mean=batches.reduce((n,b)=>n+b.n*b.p,0);let hits=0,miss=1,towerHits=0;
  for(const group of periodicGroups(cycles,stats.periodic,s.rollCounter||0)){
    const outcomes=rollOutcomes(s,toy,stats,group.mult),p=outcomes.filter(o=>o.rarity>=threshold).reduce((n,o)=>n+o.p,0),h=outcomes.filter(o=>o.rarity>=threshold).reduce((n,o)=>n+o.handP,0);
    hits+=group.cycles*mean*((1-stats.LuckyHandChance)*p+stats.LuckyHandChance*h);miss*=batches.reduce((n,b)=>n+b.p*((1-stats.LuckyHandChance)*(1-p)**b.n+stats.LuckyHandChance*(1-h)**b.n),0)**group.cycles;
  }
  if(settings.tower){const plan=towerSessionPlan(s.build,settings.seconds);for(let f=1;f<=plan.floor;f++){
    const count=(plan.completedRuns+(f<=plan.partialFloor?1:0))*towerCardsOnFloor(f);if(!count)continue;const boosted={...stats};for(const [k,v]of Object.entries(towerBonuses(f)))boosted[k]+=v;
    const p=rollOutcomes(s,toy,boosted).filter(o=>o.rarity>=threshold).reduce((n,o)=>n+o.p,0);towerHits+=count*p;miss*=(1-p)**count;
  }}return{hits:hits+towerHits,chance:1-miss,towerHits,normalHits:hits};
}
test('Final-rarity goals match independent full distributions with Tower, periodic boosts, Fabled gates and correlated batches',()=>{
  const s=profile(),settings=optimizerSettings(s,toy),result=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s),expected=independent(s,settings,settings.rarity);
  close(result.expectedHits,expected.hits);close(result.chance,expected.chance);close(result.towerHits,expected.towerHits);close(result.normalHits,expected.normalHits);close(result.score,expected.hits);
  const other=structuredClone(s);other.goal={kind:'card',card:'Common',borders:['Void']};close(createBuildEvaluator(other,toy,settings,{exactTower:true}).evaluate(other).score,result.score);
});
test('Higher-best Tower survival curve checks every floor against independent probabilities',()=>{
  const s=profile();s.optimizer.objective='highest';const settings=optimizerSettings(s,toy),result=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s);
  for(const row of result.curve)close(row.chance,independent(s,settings,row.rarity).chance,1e-8);
});
test('Card throughput includes fixed Tower rewards, and weighted search preserves exact reward counts',()=>{
  const s=profile();s.build.floor=960;s.build.dungeonSeconds=3600;s.optimizer.seconds=28800;s.optimizer.objective='cards';const result=createBuildEvaluator(s,toy).evaluate(s),plan=towerSessionPlan(s.build,s.optimizer.seconds);
  close(result.expectedCards,result.normalExpectedCards+plan.cards);close(result.towerExpectedCards,plan.cards);close(result.cardsPerHour,result.expectedCards/8);
});
test('Final recommendation never lowers exact Tower score and keeps equipment, buffs, locks and budgets valid',()=>{
  const s=profile();s.build.currencies={tower:20,void:0,corrupted:0};s.optimizer.components={points:false,skills:false,artifact:false,equipment:false,shops:true};
  const plan=optimizeBuild(s,toy),exact=createBuildEvaluator(s,toy,optimizerSettings(s,toy),{exactTower:true});close(plan.current.score,exact.evaluate(s).score);close(plan.result.score,exact.evaluate(plan.profile).score);assert.ok(plan.result.score>=plan.current.score);assert.deepEqual(plan.profile.build.potions,s.build.potions);assert.equal(plan.profile.build.crafted,s.build.crafted);assert.ok(plan.profile.build.currencies.tower>=0);assert.equal(plan.profile.build.floor,25);assert.equal(plan.profile.build.dungeonSeconds,20);
});
test('Rarity results count final rarity cumulatively and measure overlapping pulls by run',()=>{
  const runs=[{inventory:[{rarity:100,count:2},{rarity:200,count:3}]},{inventory:[{rarity:20,count:10}]}],rows=rarityResults(runs,[20,100,200,201]);
  assert.deepEqual(rows,[{rarity:20,total:15,average:7.5,chance:1},{rarity:100,total:5,average:2.5,chance:.5},{rarity:200,total:3,average:1.5,chance:.5},{rarity:201,total:0,average:0,chance:0}]);assert.equal(rarityResults([],[100])[0].chance,0);
});
test('95% is the PA default; legacy default migrates and explicitly edited quality persists',()=>{
  assert.equal(defaults(data).artifact.quality,.95);assert.equal(normalize({...defaults(data),artifact:{quality:.9}},data).artifact.quality,.95);assert.equal(normalize({...defaults(data),artifact:{quality:.9,qualityEdited:true}},data).artifact.quality,.9);assert.equal(normalize({...defaults(data),artifact:{quality:.8}},data).artifact.quality,.8);
});
test('Simulation mean agrees with exact Tower forecast within its measured sampling uncertainty',()=>{
  const s=profile(),settings=optimizerSettings(s,toy),prepared=prepareRollSession(s,toy,61),runs=Array.from({length:500},(_,i)=>simulateRollSession(prepared,123+Math.imul(i,2654435761))),summary=pairedSimulationSummary(runs,runs,settings),forecast=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s);
  assert.ok(Math.abs(summary.current.mean-forecast.expectedHits)<Math.max(.05,summary.current.error95*2));assert.equal(summary.difference.mean,0);assert.equal(summary.difference.error95,0);
});
test('Unavailable rarity goals fail clearly and new goal values survive profile round trips',()=>{
  const s=profile();s.optimizer.rarity=1e100;assert.throws(()=>createBuildEvaluator(s,toy),/highest modeled final rarity/);s.optimizer.rarity=1.25e15;assert.equal(normalize(JSON.parse(JSON.stringify(s)),toy).optimizer.rarity,1.25e15);
});

test('Very rare goals still optimize relative improvement instead of being stopped by an absolute epsilon',()=>{
  const s=normalize({...defaults(toy),build:{...buildDefaults(),currencies:{tower:4}},optimizer:{objective:'hits',rarity:1e22,seconds:60,components:{points:false,skills:false,artifact:false,equipment:false,shops:true}}},toy);
  const plan=optimizeBuild(s,toy);assert.ok(plan.current.score>0&&plan.current.score<1e-10);assert.ok(plan.result.score>plan.current.score*1.1);assert.equal(plan.profile.build.tower.Luck,1);
});
