import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,rollOutcomes,batchDistribution,BORDERS} from '../core.js';
import {buildDefaults} from '../build.js';
import {periodicGroups} from '../roll-timing.js';
import {optimizerSettings,createBuildEvaluator,optimizeBuild} from '../optimizer.js';
import {towerSessionPlan,towerCardsOnFloor,towerBonuses,prepareRollSession,simulateRollSession} from '../tower-simulation.js';
import {simulationMetric,pairedSimulationSummary} from '../rarity-results.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function profile(){
  const s=normalize({...defaults(toy),build:{...buildDefaults(),index:400,floor:25,dungeonSeconds:20},simulation:{tower:true},optimizer:{objective:'borders',seconds:61}},toy);
  s.build.tower.DoubleRollChance=15;s.build.tower.RollTwiceChance=15;s.build.corrupted.FracturedRoll=6;s.build.tower.LuckyHandChance=15;s.build.relics=[{id:'RelicOfBonus',border:1}];s.fabledMax=10;s.odds=Object.fromEntries(BORDERS.map(b=>[b,100]));return s;
}
function independent(s,settings,mask){
  const base=structuredClone(s);base.build.inDungeon=false;
  const stats=effective(base,toy),cycles=Math.floor(settings.seconds/stats.RollInterval),batches=batchDistribution(stats),mean=batches.reduce((n,b)=>n+b.n*b.p,0),qualifies=o=>settings.match==='exact'?o.mask===mask:(o.mask&mask)===mask;
  let normal=0,tower=0,miss=1;
  for(const group of periodicGroups(cycles,stats.periodic,s.rollCounter||0)){
    const outcomes=rollOutcomes(s,toy,stats,group.mult).filter(qualifies),p=outcomes.reduce((n,o)=>n+o.p,0),h=outcomes.reduce((n,o)=>n+o.handP,0);
    normal+=group.cycles*mean*((1-stats.LuckyHandChance)*p+stats.LuckyHandChance*h);
    miss*=batches.reduce((n,b)=>n+b.p*((1-stats.LuckyHandChance)*(1-p)**b.n+stats.LuckyHandChance*(1-h)**b.n),0)**group.cycles;
  }
  const plan=towerSessionPlan(s.build,settings.seconds);
  for(let floor=1;floor<=plan.floor;floor++){
    const count=(plan.completedRuns+(floor<=plan.partialFloor?1:0))*towerCardsOnFloor(floor);if(!count)continue;
    const boosted={...stats};for(const [k,v] of Object.entries(towerBonuses(floor)))boosted[k]+=v;
    const p=rollOutcomes(s,toy,boosted).filter(qualifies).reduce((n,o)=>n+o.p,0);tower+=count*p;miss*=(1-p)**count;
  }
  return{normal,tower,total:normal+tower,chance:1-miss};
}
test('All 31 selectable border combinations match independent exact and contains forecasts with Tower, Fabled gates and Lucky Hand',()=>{
  const s=profile();
  for(let mask=1;mask<32;mask++)for(const match of ['contains','exact']){
    s.optimizer.borders=BORDERS.filter((b,i)=>mask&(1<<i));s.optimizer.match=match;
    const settings=optimizerSettings(s,toy),result=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s),expected=independent(s,settings,mask);
    close(result.score,expected.total);close(result.normalHits,expected.normal);close(result.towerHits,expected.tower);close(result.chance,expected.chance);
  }
});
test('Simulation counts chosen combinations per session and distinguishes extra borders',()=>{
  const run={seconds:1800,inventory:[{borders:['Shiny'],count:2},{borders:['Shiny','Awakened'],count:3},{borders:['Shiny','Awakened','Void'],count:7},{borders:['Fabled','Void'],count:11}]},settings={objective:'borders',borders:['Shiny','Awakened'],match:'contains'};
  assert.equal(simulationMetric(run,settings),10);assert.equal(simulationMetric(run,{...settings,match:'exact'}),3);assert.equal(simulationMetric(run,{...settings,borders:['Void']}),18);assert.equal(simulationMetric(run,{...settings,borders:['Void'],match:'exact'}),0);assert.equal(simulationMetric(run,{...settings,borders:[]}),0);
});
test('Border settings persist independently of rarity and Setup targets; empty selection is rejected',()=>{
  const s=profile();s.optimizer.borders=['Void','Fabled','Void','unknown'];s.optimizer.match='exact';s.optimizer.rarity=1e100;
  const n=normalize(JSON.parse(JSON.stringify(s)),toy);assert.deepEqual(n.optimizer.borders,['Fabled','Void']);assert.equal(n.optimizer.match,'exact');
  const a=createBuildEvaluator(n,toy).evaluate(n);n.goal={kind:'card',card:'Common',borders:['Shiny']};n.optimizer.rarity=1;
  close(createBuildEvaluator(n,toy).evaluate(n).score,a.score);n.optimizer.borders=[];assert.throws(()=>createBuildEvaluator(n,toy),/Choose at least one border/);
});
test('Seeded individual-roll border counts agree with exact forecasts for both match modes',()=>{
  const s=profile();s.optimizer.borders=['Shiny','Awakened'];const prepared=prepareRollSession(s,toy,61),runs=Array.from({length:600},(_,i)=>simulateRollSession(prepared,321+Math.imul(i,2654435761)));
  for(const match of ['contains','exact']){
    s.optimizer.match=match;const settings=optimizerSettings(s,toy),summary=pairedSimulationSummary(runs,runs,settings),forecast=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s);
    assert.ok(Math.abs(summary.current.mean-forecast.score)<Math.max(.05,summary.current.error95*3));assert.equal(summary.difference.mean,0);
  }
});
test('Border optimization improves the chosen combination and reports the exact Tower comparison',()=>{
  const s=profile();s.optimizer.borders=['Void'];s.optimizer.components={points:false,skills:false,artifact:false,equipment:false,shops:true};s.build.currencies={tower:20,void:0,corrupted:0};
  const plan=optimizeBuild(s,toy),exact=createBuildEvaluator(s,toy,plan.settings,{exactTower:true});
  assert.ok(plan.result.score>plan.current.score);close(plan.current.score,exact.evaluate(s).score);close(plan.result.score,exact.evaluate(plan.profile).score);assert.ok(plan.profile.build.currencies.tower>=0);assert.deepEqual(plan.settings.borders,['Void']);
});
