import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,evaluate,simulateRolls} from '../core.js';
import {buildDefaults} from '../build.js';
import {optimizerSettings,createBuildEvaluator} from '../optimizer.js';
import {evaluateTarget} from '../target-results.js';
import {prepareRollSession,simulateRollSession} from '../tower-simulation.js';
import {pairedSimulationSummary} from '../rarity-results.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},borderRarity:{...data.borderRarity,Shiny:200}},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function profile(){return normalize({...defaults(toy),stats:{Luck:4,ShinyLuck:1,LuckyHandChance:.5,DoubleRollChance:.3,RollTwiceChance:.2,TripleRollChance:.1},odds:{Shiny:5,Awakened:1e100,Fabled:1e100,Corrupted:1e100,Void:1e100},goal:{kind:'final',rarity:100,borders:[]},optimizer:{objective:'hits',rarity:100,seconds:60},minutes:1},toy)}
test('Final-rarity targets count bordered common cards and agree with independent shared Lucky Hand and extra-roll probabilities',()=>{
  const s=profile(),p=1-(1-1/12)*.8,h=1-(1-p)**2,result=evaluateTarget(s,toy),optimizer=createBuildEvaluator(s,toy,optimizerSettings(s,toy)).evaluate(s),mean=1+.3+2*.2+2*.1;
  const noHit=q=>(1-q)*(1-.3*q)*(1-.2*(2*q-q*q))*(1-.1*(2*q-q*q));
  close(result.probability,(p+h)/2);close(result.expectedHits,60*mean*(p+h)/2);close(result.chance,1-((noHit(p)+noHit(h))/2)**60);close(result.expectedHits,optimizer.score);close(result.chance,optimizer.chance);
  const legacy={...s,goal:{...s.goal,kind:'rarity'}};assert.ok(evaluate(legacy,toy).expectedHits<result.expectedHits);
  const rolls=simulateRolls(s,toy,1000,123);assert.ok(Math.abs(rolls.hits/rolls.cards-result.probability)<.05);
});
test('Final-rarity targets require selected borders and keep Fabled eligibility tied to base rarity',()=>{
  const s=profile();s.stats.LuckyHandChance=0;s.odds.Fabled=10;s.stats.FabledLuck=1;s.fabledMax=1;s.unlocks.Fabled=true;s.goal.borders=['Fabled'];
  close(evaluateTarget(s,toy).probability,(11/12)*.1);
  s.goal.kind='card';s.goal.card='Rare';assert.equal(evaluateTarget(s,toy).probability,0);s.goal.card='Common';close(evaluateTarget(s,toy).probability,(11/12)*.1);
  s.goal.kind='final';s.goal.rarity=1e30;assert.equal(evaluateTarget(s,toy).expectedHits,0);assert.equal(evaluateTarget(s,toy).averageSeconds,Infinity);
});
test('Target forecasts include entered Tower runs and match individual final-rarity inventory counts',()=>{
  const s=profile();s.build={...buildDefaults(),base:{Luck:4,ShinyLuck:1},under10M:false,floor:25,dungeonSeconds:20};s.simulation.tower=true;s.minutes=1;
  const settings=optimizerSettings(s,toy),result=evaluateTarget(s,toy),optimizer=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s);close(result.expectedHits,optimizer.score);close(result.chance,optimizer.chance);assert.ok(result.towerHits>0);
  const prepared=prepareRollSession(s,toy,60),runs=Array.from({length:500},(_,i)=>simulateRollSession(prepared,123+Math.imul(i,2654435761))),summary=pairedSimulationSummary(runs,runs,settings);
  for(const run of runs)assert.equal(run.hits,run.inventory.filter(row=>row.rarity>=100).reduce((n,row)=>n+row.count,0));assert.ok(Math.abs(summary.current.mean-result.expectedHits)<summary.current.error95*3);
  s.goal.borders=['Shiny'];const filtered=evaluateTarget(s,toy);const independent={...settings,requiredBorders:['Shiny']};close(filtered.expectedHits,createBuildEvaluator(s,toy,independent,{exactTower:true}).evaluate(s).score);
  s.goal.kind='card';s.goal.card='Rare';const card=evaluateTarget(s,toy);close(card.expectedHits,createBuildEvaluator(s,toy,{...independent,rarity:1,targetCard:'Rare'},{exactTower:true}).evaluate(s).score);const specific=simulateRollSession(prepareRollSession(s,toy,60),123);assert.equal(specific.hits,specific.inventory.filter(row=>row.name==='Rare'&&row.borders.includes('Shiny')).reduce((n,row)=>n+row.count,0));
});
test('Invalid Tower inputs do not prevent editing Target and final-rarity mode survives profile round trips',()=>{
  const s=profile();s.build=buildDefaults();s.simulation.tower=true;assert.match(evaluateTarget(s,toy).towerError,/cleared Tower floor/);assert.equal(normalize(JSON.parse(JSON.stringify(s)),toy).goal.kind,'final');
});
test('Guaranteed Tower targets keep wait estimates positive and unavailable targets remain infinite',()=>{
  const s=profile();s.build={...buildDefaults(),floor:10,dungeonSeconds:60};s.simulation.tower=true;s.goal.rarity=1;
  const r=evaluateTarget(s,toy);assert.equal(r.chance,1);assert.ok(r.averageSeconds>0);assert.ok(r.medianSeconds>0);assert.ok(Number.isFinite(r.p90Seconds));
  s.goal.rarity=1e30;const unavailable=evaluateTarget(s,toy);assert.equal(unavailable.chance,0);assert.equal(unavailable.medianSeconds,Infinity);
});
