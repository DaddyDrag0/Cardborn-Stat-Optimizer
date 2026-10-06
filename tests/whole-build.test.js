import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,normalize,effective,validPoints,rollOutcomes,batchDistribution,artifactLevel,scaledMax} from '../core.js';
import {buildDefaults,skillCost,skillBudget,corruptedRefund} from '../build.js';
import {optimizerSettings,createBuildEvaluator,optimizeBuild} from '../optimizer.js';
import {prepareExactRolls,simulateExactSession,rollRandom} from '../exact-rolls.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const toy={...data,cards:[{name:'Rare',rarityValue:100},{name:'Common',rarityValue:1}],secretSkins:{},weather:{Clear:{boostMultiplier:1}}};
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function setup(d=data){return normalize({...defaults(d),optimizer:{objective:'highest'},rolls:4e6,build:{...buildDefaults(),index:400,currencies:{tower:40,void:0,corrupted:125}},artifact:{...defaults(d).artifact,slots:[{id:'Luck',value:20,locked:true}]}},d)}

test('Whole-build forecasts match an independent explicit-cycle CDF with Lucky Hand, all extra rolls and phase',()=>{
  const s=setup(toy);s.optimizer.seconds=61;s.rollCounter=24;s.build.relics=[{id:'RelicOfBonus',border:1}];s.build.tower.DoubleRollChance=15;s.build.tower.RollTwiceChance=15;s.build.corrupted.FracturedRoll=6;s.build.tower.LuckyHandChance=15;s.odds.Shiny=4;s.odds.Awakened=20;s.odds.Fabled=20;s.odds.Corrupted=20;s.odds.Void=10;
  const settings=optimizerSettings(s,toy),result=createBuildEvaluator(s,toy,settings).evaluate(s),stats=effective(s,toy),cycles=Math.floor(61/stats.RollInterval),dist=batchDistribution(stats);
  let expected=0;
  for(let bin=1;bin<=100;bin++){
    const threshold=10**(bin*.125);let miss=1;
    for(let i=1;i<=cycles;i++){
      const mult=(i+s.rollCounter)%25===0?2:1,outcomes=rollOutcomes(s,toy,stats,mult),plain=outcomes.filter(o=>o.rarity>=threshold*(1-1e-12)).reduce((n,o)=>n+o.p,0),hand=outcomes.filter(o=>o.rarity>=threshold*(1-1e-12)).reduce((n,o)=>n+o.handP,0);
      miss*=dist.reduce((n,b)=>n+b.p*((1-stats.LuckyHandChance)*(1-plain)**b.n+stats.LuckyHandChance*(1-hand)**b.n),0);
    }
    expected+=.125*(1-miss);
  }
  // Extend far enough to include the largest possible stacked-border rarity.
  for(let bin=101;bin<=220;bin++){
    const threshold=10**(bin*.125);let logMiss=0;
    for(let i=1;i<=cycles;i++){const outcomes=rollOutcomes(s,toy,stats,(i+s.rollCounter)%25===0?2:1),p=outcomes.filter(o=>o.rarity>=threshold*(1-1e-12)).reduce((n,o)=>n+o.p,0),h=outcomes.filter(o=>o.rarity>=threshold*(1-1e-12)).reduce((n,o)=>n+o.handP,0);const m=dist.reduce((n,b)=>n+b.p*((1-stats.LuckyHandChance)*(1-p)**b.n+stats.LuckyHandChance*(1-h)**b.n),0);logMiss+=Math.log(m)}expected+=.125*-Math.expm1(logMiss);
  }
  close(result.bestLog,expected,1e-7);
  close(result.expectedCards,cycles*(1+.3+2*.15+2*.03));
});

test('Whole-build recommendations obey SP, point caps, ownership, budgets, locked slots and paid unlocks',()=>{
  const s=setup();s.build.crafted='FrozenCrown';s.build.relics=[{id:'WeightedDice',border:1}];s.optimizer.potions=['LuckPotion'];
  const before=structuredClone(s),plan=optimizeBuild(s,data),p=plan.profile;
  assert.deepEqual(s,before);assert.ok(plan.result.score>=plan.current.score);
  assert.ok(validPoints(p.points,Math.floor(p.rolls/data.rollsPerPoint),data));assert.ok(skillCost(p.build.skills,data)<=skillBudget(p.build,data));
  const owned=new Set(p.build.skills);for(const n of data.skillNodes)if(owned.has(n.id))assert.ok(n.requires.every(id=>owned.has(id)));
  assert.equal(p.build.crafted,'FrozenCrown');assert.ok(p.build.relics.every(x=>x.id==='WeightedDice'&&x.border===1));
  assert.deepEqual(p.artifact.slots[0],s.artifact.slots[0]);assert.deepEqual(p.build.passes,s.build.passes);assert.equal(p.artifact.rarity,s.artifact.rarity);
  for(const shop of ['tower','corrupted','void'])assert.ok(p.build.currencies[shop]>=0);
  const gold=data.towerShop.reduce((n,d)=>n+(p.build.tower[d.id]-s.build.tower[d.id])*d.cost,0);assert.equal(p.build.currencies.tower,s.build.currencies.tower-gold);
  const coins=data.corruptedUpgrades.reduce((n,d)=>n+corruptedRefund(d,p.build.corrupted[d.id])-corruptedRefund(d,s.build.corrupted[d.id]),0);assert.equal(p.build.currencies.corrupted,s.build.currencies.corrupted-coins);
  const counts={};for(const slot of p.artifact.slots)if(slot.id){counts[slot.id]=(counts[slot.id]||0)+1;assert.ok(counts[slot.id]<=2);const d=data.personalArtifact.stats.find(x=>x.id===slot.id);assert.ok(slot.value<=scaledMax(d,artifactLevel(p,data)))}
  assert.deepEqual(effective(normalize(p,data),data),plan.result.stats);
  assert.deepEqual(p.build.sets,s.build.sets);assert.deepEqual(p.build.achievements,s.build.achievements);assert.deepEqual(p.badges,s.badges);
});

test('Turning off all search components preserves the current setup exactly and goals ignore Setup target',()=>{
  const s=setup();s.optimizer.components=Object.fromEntries(['points','skills','artifact','equipment','potions','shops'].map(k=>[k,false]));
  const plan=optimizeBuild(s,data);assert.deepEqual(plan.profile.build,s.build);assert.deepEqual(plan.profile.points,s.points);assert.deepEqual(plan.profile.artifact,s.artifact);
  const other=structuredClone(s);other.goal={kind:'card',card:'Nihilus, the Final Horizon',borders:['Fabled','Void']};
  close(createBuildEvaluator(s,data).evaluate(s).score,createBuildEvaluator(other,data).evaluate(other).score);
});

test('Most-cards search spends on productive speed and extra rolls instead of unused luck or missing currency',()=>{
  const s=setup();s.optimizer.objective='cards';s.optimizer.components={skills:false,points:false,artifact:false,equipment:false,potions:false};s.build.currencies={tower:5,void:0,corrupted:0};
  const p=optimizeBuild(s,data);assert.equal(p.profile.build.currencies.tower,0);assert.equal(p.profile.build.tower.DoubleRollChance,1);assert.equal(p.profile.build.tower.Luck,0);assert.ok(p.result.cardsPerHour>p.current.cardsPerHour);
});

test('Owned relic combinations and an affordable third slot work together, without fabricating items',()=>{
  const s=setup();s.optimizer.objective='cards';s.build.passes.TwoRelic=true;s.build.currencies={tower:25,void:0,corrupted:0};s.build.tower.DoubleRollChance=15;s.build.tower.RollTwiceChance=15;s.build.tower.LuckyHandChance=15;
  const available=Object.entries(data.relics).filter(([,d])=>d.Boosts?.DoubleRollChance||d.Boosts?.RollTwiceChance||d.Boosts?.TripleRollChance||d.Boosts?.RollSpeed).map(([id])=>({id,border:1}));s.optimizer.relics=available;s.optimizer.components={points:false,skills:false,artifact:false,potions:false};
  const p=optimizeBuild(s,data);assert.ok(p.profile.build.relics.length<=1+1+p.profile.build.tower.ThirdRelicSlot);assert.ok(p.profile.build.relics.every(x=>available.some(y=>y.id===x.id)));assert.ok(p.result.score>=p.current.score);assert.equal(p.profile.build.currencies.tower,25-p.profile.build.tower.ThirdRelicSlot*25);
});

test('Individual draws use the rarest-first distribution, secret skins and then all five borders',()=>{
  const d={...toy,cards:[...toy.cards,{name:'Secret',rarityValue:200,isSecret:true}],secretSkins:{Rare:[{to:'Secret',chanceDenom:2}]}};
  const s=setup(d);s.globalLuck=1;s.fabledMax=100;s.build.base={Luck:1,ShinyLuck:1,AwakenedLuck:1,FabledLuck:1,CorruptedLuck:1,VoidLuck:1};s.artifact.slots=[];
  const prepared=prepareExactRolls(s,d,1),values=[0,0,0,0,0,0],rng={unit53:()=>values.shift()??0};
  const row=prepared.draw(1,rng);assert.equal(row.name,'Secret');assert.equal(row.mask,27);assert.ok(!row.borders.includes('Fabled'));assert.equal(row.baseRarity,200);
  let called=0;const common=prepared.draw(1,{unit53:()=>{called++;return .999999}});assert.equal(common.name,'Common');assert.equal(called,6);
});

test('Individual rolling matches known independent frequencies and fresh seeds differ; no count approximation',()=>{
  const s=setup(toy);s.rolls=0;s.build=buildDefaults();s.build.under10M=false;s.artifact.slots=[];s.globalLuck=1;s.odds=Object.fromEntries(Object.keys(s.odds).map(k=>[k,1e100]));s.build.base.Luck=20;s.goal={kind:'card',card:'Rare',borders:[]};
  const prepared=prepareExactRolls(s,toy,100000),a=simulateExactSession(prepared,123),b=simulateExactSession(prepared,456);
  assert.equal(a.cards,100000);assert.ok(Math.abs(a.hits/100000-.2)<.005);assert.notDeepEqual(a,b);assert.deepEqual(a,simulateExactSession(prepared,123));
  assert.equal(a.inventory.reduce((n,r)=>n+r.count,0),a.cards);
  const rng=rollRandom(1);let fine=false;for(let i=0;i<100;i++){const r=rng.unit53();assert.ok(r>=0&&r<1);if(!Number.isInteger(r*4294967296))fine=true}assert.ok(fine,'53-bit fractions must retain values between 32-bit RNG steps');
});

test('Ownership and optimizer configuration round trip through profile normalization',()=>{
  const s=setup();s.optimizer={objective:'borders',seconds:3600,components:{skills:false},crafted:[{id:'FrozenCrown',tier:'Normal'},{id:'<bad>',tier:'Normal'}],relics:[{id:'WeightedDice',border:6}],potions:['<bad>']};
  const n=normalize(JSON.parse(JSON.stringify(s)),data);assert.equal(n.optimizer.objective,'borders');assert.equal(n.optimizer.components.skills,false);assert.equal(n.optimizer.crafted,undefined);assert.equal(n.optimizer.relics[0].border,6);assert.equal(n.optimizer.potions,undefined);
});

test('Crafted artifact tier and active buffs stay fixed even when old profiles offer stronger alternatives',()=>{
  const s=setup();s.build.crafted='FrozenCrown';s.build.craftedTier='Normal';
  s.build.potions=[Object.keys(data.potions).find(id=>data.potions[id].StatCategory==='Luck')];
  s.optimizer.crafted=Object.keys(data.craftedArtifacts).map(id=>({id,tier:data.craftedTiers.at(-1).id}));
  s.optimizer.potions=Object.keys(data.potions);s.optimizer.components.potions=true;
  for(const objective of ['highest','cards','borders']){
    s.optimizer.objective=objective;const result=optimizeBuild(s,data);
    assert.equal(result.profile.build.crafted,s.build.crafted);assert.equal(result.profile.build.craftedTier,s.build.craftedTier);
    assert.deepEqual(result.profile.build.potions,s.build.potions);assert.ok(result.result.score>=result.current.score);
    assert.equal(result.settings.components.potions,undefined);assert.equal(result.settings.crafted,undefined);assert.equal(result.settings.potions,undefined);
    assert.ok(result.opportunities.every(x=>x.requirement!=='Craft higher artifact tier'));
  }
});
