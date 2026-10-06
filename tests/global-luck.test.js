import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,cardDistribution,borderProbabilities} from '../core.js';
import {buildDefaults} from '../build.js';
import {optimizerSettings,createBuildEvaluator} from '../optimizer.js';
import {towerCardsOnFloor,prepareRollSession,simulateRollSession} from '../tower-simulation.js';
import {pairedSimulationSummary} from '../rarity-results.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{}};
test('2.25 is the default Global Luck multiplier; explicit values and edit flags survive saving',()=>{
  assert.equal(defaults(data).globalLuck,2.25);assert.equal(normalize({},data).globalLuck,2.25);
  const s=normalize({...defaults(data),globalLuck:1,globalLuckEdited:true},data);assert.equal(normalize(JSON.parse(JSON.stringify(s)),data).globalLuck,1);assert.equal(s.globalLuckEdited,true);
  assert.equal(normalize({...s,globalLuck:3.5},data).globalLuck,3.5);
});
test('Regular rolls, Tower rewards and optimizer forecasts apply Global Luck exactly once without changing regular stats or borders',()=>{
  const s=normalize({...defaults(toy),rolls:0,build:{...buildDefaults(),base:{Luck:4},under10M:false,floor:10,dungeonSeconds:60},odds:{Shiny:1e100,Awakened:1e100,Fabled:1e100,Corrupted:1e100,Void:1e100},simulation:{tower:true},optimizer:{objective:'hits',rarity:100,seconds:60}},toy),stats=effective(s,toy);
  assert.equal(stats.Luck,4);assert.equal(cardDistribution(s,toy,stats.Luck)[0].p,1/12);
  assert.deepEqual(borderProbabilities(s,stats),borderProbabilities({...s,globalLuck:1},stats));
  const expectedNormal=60/12,expectedTower=Array.from({length:10},(_,i)=>{const floor=i+1;return towerCardsOnFloor(floor)/Math.ceil(100/((4+8*Math.floor(floor/5))*2.25))}).reduce((a,b)=>a+b,0),settings=optimizerSettings(s,toy),result=createBuildEvaluator(s,toy,settings,{exactTower:true}).evaluate(s);
  assert.ok(Math.abs(result.normalHits-expectedNormal)<1e-9);assert.ok(Math.abs(result.towerHits-expectedTower)<1e-9);
  const prepared=prepareRollSession(s,toy,60),runs=Array.from({length:500},(_,i)=>simulateRollSession(prepared,123+Math.imul(i,2654435761))),summary=pairedSimulationSummary(runs,runs,settings);
  assert.ok(Math.abs(summary.current.mean-result.score)<summary.current.error95*3);
});
