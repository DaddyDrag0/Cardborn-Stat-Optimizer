import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,evaluate,cardDistribution,rollOutcomes,targetProbability,optimizePoints,optimizeArtifact,validPoints,scaledMax,artifactSlots} from '../core.js';
import {buildDefaults} from '../build.js';
import {periodicGroups,sessionChance,chanceByCycles} from '../roll-timing.js';
import {prepareSimulation,simulateSession,simulationOutcomes,binomial,randomSource} from '../simulation.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},weather:{Clear:{boostMultiplier:1}}};
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function setup(d=toy){const s=defaults(d);s.stats.Luck=1;s.goal={kind:'rarity',rarity:100,borders:[]};s.odds=Object.fromEntries(Object.keys(s.odds).map(k=>[k,1e100]));return s}

test('Global Luck affects card rolls once, without changing base stats or border rates, and survives imports',()=>{
  const s=setup();s.globalLuck=2.25;s.stats.Luck=4;
  close(effective(s,toy).Luck,4);close(cardDistribution(s,toy,4)[0].p,1/12);
  close(evaluate(s,toy).probability,1/12);
  close(simulationOutcomes(s,toy,effective(s,toy)).filter(x=>x.hit).reduce((n,x)=>n+x.p,0),1/12);
  const restored=normalize({...s,rollCounter:12345},toy);assert.equal(restored.globalLuck,2.25);assert.equal(restored.rollCounter,12345);
  assert.equal(normalize(defaults(toy),toy).globalLuck,1);assert.equal(normalize(defaults(toy),toy).rollCounter,0);
  assert.equal(normalize({...s,globalLuck:Infinity},toy).globalLuck,.0001);
});

test('Lucky Hand matches independent ordered candidate-pair enumeration including weather boosts and ties',()=>{
  const d={...toy,cards:[{name:'Rare',rarityValue:100},{name:'Weather',rarityValue:90,weatherLock:'Storm'},{name:'Tie',rarityValue:100},{name:'Common',rarityValue:1}],weather:{Storm:{boostMultiplier:3}}};
  const s=setup(d);s.weather='Storm';s.globalLuck=2.25;s.stats.Luck=3;s.stats.ShinyLuck=.4;s.odds.Shiny=1;s.stats.LuckyHandChance=.5;
  const candidates=[];let left=1;
  for(const card of [...d.cards].sort((a,b)=>b.rarityValue-a.rarityValue)){
    const p=1/Math.ceil(Math.max(1,card.rarityValue/(3*2.25))),mass=left*p;left*=1-p;
    for(const shiny of [false,true]){const rarity=card.rarityValue*(shiny?100:1),hp=Math.floor((10+rarity**.35*5)*(card.weatherLock==='Storm'?3:1));candidates.push({name:card.name,mask:shiny?1:0,p:mass*(shiny?.4:.6),rarity,score:hp+2*Math.floor(hp/2)})}
  }
  const expected=new Map();
  for(const a of candidates)for(const b of candidates){const best=b.score>a.score||b.score===a.score&&b.rarity>a.rarity?b:a,key=best.name+'|'+best.mask;expected.set(key,(expected.get(key)||0)+a.p*b.p)}
  const actual=rollOutcomes(s,d,effective(s,d));
  for(const o of actual)if(o.mask<=1)close(o.handP,expected.get(o.name+'|'+o.mask)||0);
  close(actual.reduce((n,o)=>n+o.p,0),1);close(actual.reduce((n,o)=>n+o.handP,0),1);
  close(targetProbability(s,d,effective(s,d)).p,simulationOutcomes(s,d,effective(s,d)).filter(o=>o.hit).reduce((n,o)=>n+o.p,0));
});

test('Periodic boost counts and session probability use the same counter phase, including short and zero-cycle sessions',()=>{
  const boosts=[{every:5,mult:2},{every:7,mult:4},{every:10,mult:40}];
  for(const start of [0,4,17,20001])for(const cycles of [0,1,3,19,71]){
    const expected=new Map();let miss=1;
    for(let i=start+1;i<=start+cycles;i++){const mult=boosts.reduce((n,p)=>n*(i%p.every===0?p.mult:1),1);expected.set(mult,(expected.get(mult)||0)+1);miss*=1-Math.min(.8,.002*mult)}
    const actual=new Map();for(const g of periodicGroups(cycles,boosts,start))actual.set(g.mult,(actual.get(g.mult)||0)+g.cycles);
    assert.deepEqual(actual,expected);close(sessionChance(cycles,boosts,m=>Math.min(.8,.002*m),start),1-miss);
  }
  assert.equal(sessionChance(0,[],()=>1),0);
  const quantile=chanceByCycles(.5,boosts,m=>Math.min(.8,.002*m),4);
  assert.ok(sessionChance(quantile,boosts,m=>Math.min(.8,.002*m),4)>=.5);
  assert.ok(sessionChance(quantile-1,boosts,m=>Math.min(.8,.002*m),4)<.5);
  assert.ok(Number.isFinite(chanceByCycles(.5,boosts,()=>1e-50)));
});

test('Finite hit forecasts agree with explicit cycles and simulator expectations, including all extra rolls and Lucky Hand',()=>{
  const s=normalize({...defaults(toy),rolls:0,build:{...buildDefaults(),passes:{TwoRelic:true},relics:[{id:'RelicOfBonus',border:1},{id:'WeightedDice',border:1}],tower:{DoubleRollChance:15,RollTwiceChance:15},corrupted:{FracturedRoll:6}},goal:{kind:'rarity',rarity:100,borders:[]},minutes:31/60,rollCounter:24},toy);
  s.odds=Object.fromEntries(Object.keys(s.odds).map(k=>[k,1e100]));
  const forecast=evaluate(s,toy),stats=effective(s,toy),mean=1+.3+2*.15+2*.03;let misses=1,expectedHits=0;
  for(let i=25;i<=55;i++){
    const mult=(i%25===0?2:1)*(i%50===0?4:1),p=1/Math.ceil(100/(stats.Luck*mult));
    let miss=0;
    for(const dbl of [0,1])for(const twice of [0,1])for(const triple of [0,1])miss+=(dbl?.3:.7)*(twice?.15:.85)*(triple?.03:.97)*(1-p)**(1+dbl+2*twice+2*triple);
    misses*=miss;expectedHits+=mean*p;
  }
  close(forecast.chance,1-misses);close(forecast.expectedHits,expectedHits);close(forecast.expectedCards,31*mean);
  const prepared=prepareSimulation(s,toy,31);assert.equal(prepared.groups.reduce((n,g)=>n+g.cycles,0),31);
  close(prepared.groups.reduce((n,g)=>n+g.cycles*mean*g.outcomes.filter(o=>o.hit).reduce((a,o)=>a+o.p,0),0),forecast.expectedHits);
  s.minutes=.001;assert.equal(evaluate(s,toy).chance,0);
});

test('Quick simulation retains shared Lucky Hand for a six-card cycle rather than independent per-card hand chances',()=>{
  const s=setup();Object.assign(s.stats,{Luck:50,LuckyHandChance:.5,DoubleRollChance:1,RollTwiceChance:1,TripleRollChance:1});
  const prepared=prepareSimulation(s,toy,1);let misses=0,hits=0;
  const runs=20000;
  for(let i=0;i<runs;i++){const run=simulateSession(prepared,(17+Math.imul(i,2654435761))>>>0);assert.equal(run.cards,6);assert.equal(run.inventory.reduce((n,o)=>n+o.count,0),6);if(!run.hits)misses++;hits+=run.hits}
  close(misses/runs,.5*.5**6+.5*.25**6,.002);
  close(hits/runs,6*(.5*.5+.5*.75),.035);
});

test('Point optimizer agrees with exhaustive scoring for a small Lucky Hand budget and applies with identical results',()=>{
  const s=setup();s.rolls=8*50000;s.stats.LuckyHandChance=.5;s.globalLuck=2.25;s.odds.Shiny=100;s.goal.borders=['Shiny'];let best=0;
  for(let l=0;l<=8;l++)for(let sh=0;sh<=8-l;sh++)for(let aw=0;aw<=8-l-sh;aw++)for(let v=0;v<=8-l-sh-aw;v++){const points={Luck:l,Shiny:sh,Awakened:aw,Void:v};best=Math.max(best,evaluate(s,toy,points).hitsPerHour)}
  const plan=optimizePoints(s,toy);close(plan.result.hitsPerHour,best);assert.ok(validPoints(plan.points,8,toy));
  const applied={...s,points:plan.points,stats:plan.result.stats};close(evaluate(applied,toy).hitsPerHour,plan.result.hitsPerHour);
});

test('Artifact search preserves a kept middle slot and agrees with exhaustive physical-slot search on a small artifact',()=>{
  const d={...toy,cards:[{name:'Rare',rarityValue:100000},{name:'Common',rarityValue:1}],personalArtifact:{...toy.personalArtifact,slotUnlockLevels:[1,1,1],stats:toy.personalArtifact.stats.filter(d=>['Luck','LuckMult','RollSpeed','ShinyLuck'].includes(d.id))}};
  const s=setup(d);s.stats.Luck=25;s.goal.rarity=100000;s.rolls=1e8;s.artifact.rarity='Common';s.artifact.quality=.9;s.artifact.slots=[{id:'',value:0,locked:false},{id:'Luck',value:5,locked:true},{id:'',value:0,locked:false}];
  const candidates=d.personalArtifact.stats.map(def=>{const f=10**def.decimals;return{id:def.id,value:Math.round((def.min+(scaledMax(def,100)-def.min)*.9)*f)/f,locked:false}});let best=0;
  for(const first of candidates)for(const last of candidates){const slots=[first,s.artifact.slots[1],last];if(slots.filter(x=>x.id==='Luck').length>2)continue;best=Math.max(best,evaluate(s,d,s.points,slots).hitsPerHour)}
  const plan=optimizeArtifact(s,d);assert.equal(plan.slots.length,artifactSlots(s,d));assert.equal(plan.slots[1].id,'Luck');assert.equal(plan.slots[1].value,5);assert.equal(plan.slots[1].locked,true);close(plan.result.hitsPerHour,best);
  const applied={...s,artifact:{...s.artifact,slots:plan.slots},stats:plan.result.stats};close(evaluate(applied,d).hitsPerHour,plan.result.hitsPerHour);
});

test('Unavailable targets produce a clear optimizer error instead of meaningless recommendations',()=>{
  const s=setup();s.goal={kind:'card',card:'Rare',borders:['Fabled']};s.fabledMax=0;s.unlocks.Fabled=false;
  assert.throws(()=>optimizePoints(s,toy),/Target cannot roll/);s.rolls=1e8;assert.throws(()=>optimizeArtifact(s,toy),/Target cannot roll/);
});

test('All card pools conserve probability across every weather, world gates, extreme Luck and Fabled thresholds',()=>{
  for(const weather of ['Clear',...Object.keys(data.weather)])for(const luck of [1,2605.949,1e9,1e30])for(const unlocked of [false,true]){
    const s=setup(data);s.weather=weather;s.stats.Luck=luck;s.globalLuck=2.25;s.fabledMax=1e9;s.unlocks={Awakened:true,Fabled:true,Corrupted:true};s.odds={...data.borderOdds};s.stats.LuckyHandChance=.5;s.goal.rarity=1;
    if(unlocked)s.badges=[...new Set(data.cards.map(c=>c.badgeRequired).filter(Boolean))];
    const distribution=cardDistribution(s,data,luck),stats=effective(s,data),rows=rollOutcomes(s,data,stats);
    close(distribution.reduce((n,o)=>n+o.p,0),1);close(rows.reduce((n,o)=>n+o.p,0),1);close(rows.reduce((n,o)=>n+o.handP,0),1);
    for(const o of rows){assert.ok(Number.isFinite(o.p)&&o.p>=0);assert.ok(Number.isFinite(o.handP)&&o.handP>=0);assert.ok(!o.borders.includes('Fabled')||o.baseRarity<=1e9)}
    for(const o of distribution)if(!o.card.isSecret){assert.ok(!o.card.weatherLock||o.card.weatherLock===weather);assert.ok(!o.card.badgeRequired||unlocked)}
  }
});

test('Count sampling is statistically calibrated for exact small counts, rare hits and large approximate counts',()=>{
  const runs=5000;
  for(const [n,p] of [[10,.2],[1000000,1e-6],[100000,.5],[100000,.02]]){
    let sum=0,square=0;
    for(let i=0;i<runs;i++){const value=binomial(n,p,randomSource((19+Math.imul(i,2654435761))>>>0));sum+=value;square+=value*value;assert.ok(value>=0&&value<=n)}
    const mean=sum/runs,expected=n*p,variance=n*p*(1-p);
    assert.ok(Math.abs(mean-expected)<6*Math.sqrt(variance/runs),`mean ${mean}, expected ${expected}`);
    assert.ok(Math.abs(square/runs-mean*mean-variance)<variance*.12,`variance for ${n}, ${p}`);
  }
});

test('Legacy artifact strength cannot silently boost PA in a build profile',()=>{
  const raw={...defaults(data),rolls:1e8,build:buildDefaults(),artifact:{...defaults(data).artifact,strength:10,slots:[{id:'Luck',value:100}]}};
  const s=normalize(raw,data);assert.equal(s.artifact.strength,0);close(effective(s,data).Luck,103);
});
