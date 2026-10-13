import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,statPointBudget,normalizeStatPoints,setStatPoint,validPoints,sum} from '../core.js';
import {buildDefaults} from '../build.js';
import {optimizeBuild} from '../optimizer.js';
import {prepareRollSession} from '../tower-simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),shown={Luck:237,Shiny:65,Awakened:200,Void:130};

test('Earned points floor lifetime rolls at the exact 50,000-roll boundaries',()=>{
  for(const [rolls,earned]of [[0,0],[49999,0],[50000,1],[99999,1],[100000,2],[31599999,631],[31600000,632]])assert.equal(statPointBudget({rolls},data),earned);
});

test('Manual edits respect points already allocated in the other three stats',()=>{
  const s=normalize({...defaults(data),rolls:31600000,points:shown,build:buildDefaults()},data);assert.deepEqual(s.points,shown);
  assert.match(setStatPoint(s,'Luck',238,data).error,/At most 237/);assert.deepEqual(s.points,shown);
  s.points=setStatPoint(s,'Luck',236,data).points;s.points=setStatPoint(s,'Void',131,data).points;assert.equal(sum(s.points),632);
  for(const invalid of [-1,1.5,NaN,Infinity,'',undefined])assert.ok(setStatPoint(s,'Luck',invalid,data).error);
});

test('Saved over-budget allocations are reduced without adding points and remain stable on reload',()=>{
  for(const budget of [0,1,49,50,130,380,600,615,631,632]){
    const s=normalize({...defaults(data),rolls:budget*50000,points:shown,build:buildDefaults()},data);
    assert.ok(sum(s.points)<=budget);for(const key of Object.keys(shown))assert.ok(s.points[key]<=shown[key]);assert.ok(validPoints(s.points,budget,data));
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(s)),data).points,s.points);
    const stats=effective(s,data);assert.equal(stats.Luck,(1+s.points.Luck*.5)*(s.rolls<1e7?1.25:1));
  }
  const lowered=normalize({...defaults(data),rolls:0,points:shown,build:buildDefaults()},data);assert.deepEqual(lowered.points,{Luck:0,Shiny:0,Awakened:0,Void:0});
  assert.deepEqual(normalizeStatPoints({Luck:0,Shiny:1000,Awakened:0,Void:0},1000,data),{Luck:0,Shiny:75,Awakened:0,Void:0});
});

test('Repair obeys budget, never creates points and keeps attainable cap prerequisites over many allocations',()=>{
  let seed=123;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
  for(let i=0;i<1000;i++){
    const p={Luck:random()%1001,Shiny:random()%76,Awakened:random()%501,Void:random()%501},budget=random()%2076,result=normalizeStatPoints(p,budget,data);
    assert.ok(sum(result)<=budget);for(const k of Object.keys(p))assert.ok(result[k]>=0&&result[k]<=p[k]);
    if(sum(p)>budget)assert.ok(validPoints(result,budget,data));assert.deepEqual(normalizeStatPoints(result,budget,data),result);
  }
});

test('Optimizer entry repairs oversized profiles and its simulation uses only earned points',()=>{
  const raw={...defaults(data),rolls:0,points:shown,build:buildDefaults(),optimizer:{objective:'hits',rarity:1e15,seconds:60,components:{points:false,skills:false,artifact:false,equipment:false,shops:false}}};
  const plan=optimizeBuild(raw,data);assert.equal(sum(plan.profile.points),0);assert.equal(plan.result.stats.Luck,1.25);assert.equal(prepareRollSession(plan.profile,data,60).normal.stats.Luck,1.25);
});
