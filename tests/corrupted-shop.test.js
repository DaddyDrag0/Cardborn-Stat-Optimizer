import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDefaults,normalizeBuild,setCorruptedLevel,shopAction,buyAllCorrupted,corruptedRemainingCost} from '../build.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
function build(coins=16700){return normalizeBuild({...buildDefaults(),currencies:{corrupted:coins}},data)}
test('Typing multiple Corrupted levels spends each intervening cost and lowering levels refunds only the removed levels',()=>{
  const b=build();assert.deepEqual(setCorruptedLevel(b,'CorruptedFortune',5,data),{level:5,balance:15977});
  b.corrupted.CorruptedFortune=5;b.currencies.corrupted=15977;
  assert.deepEqual(setCorruptedLevel(b,'CorruptedFortune',4,data),{level:4,balance:16266});assert.deepEqual(setCorruptedLevel(b,'CorruptedFortune',5,data),{level:5,balance:15977});assert.deepEqual(setCorruptedLevel(b,'CorruptedFortune',0,data),{level:0,balance:16700});
});
test('Typed levels and repeated Buy buttons have identical costs at every level of all Corrupted upgrades',()=>{
  for(const d of data.corruptedUpgrades){
    const b=build(100000);
    for(let level=1;level<=d.maxLevel;level++){
      const button=shopAction(b,'corrupted',d.id,1,data),typed=setCorruptedLevel(build(100000),d.id,level,data);assert.deepEqual(button,typed);
      b.corrupted[d.id]=button.level;b.currencies.corrupted=button.balance;
    }
    assert.deepEqual(shopAction(b,'corrupted',d.id,-1,data),{level:0,balance:100000});assert.deepEqual(setCorruptedLevel(b,d.id,0,data),{level:0,balance:100000});
  }
});
test('Insufficient funds, invalid levels and caps reject the entire edit without changing the build',()=>{
  const b=build(722),before=structuredClone(b);assert.match(setCorruptedLevel(b,'CorruptedFortune',5,data).error,/Not enough/);
  for(const value of [-1,11,1.5,'no',Infinity])assert.match(setCorruptedLevel(b,'CorruptedFortune',value,data).error,/whole level/);
  assert.match(setCorruptedLevel(b,'unknown',1,data).error,/Unknown/);assert.deepEqual(b,before);
  const exact=setCorruptedLevel(build(723),'CorruptedFortune',5,data);assert.deepEqual(exact,{level:5,balance:0});
});
test('Typed purchases, refunds and Buy all preserve the total coin budget, while imported owned levels do not spend again',()=>{
  const b=build(100000),initial=corruptedRemainingCost(b,data);
  for(const d of data.corruptedUpgrades){const r=setCorruptedLevel(b,d.id,4,data);b.corrupted[d.id]=r.level;b.currencies.corrupted=r.balance}
  const owned=normalizeBuild(JSON.parse(JSON.stringify(b)),data);assert.deepEqual(owned,b);
  const all=buyAllCorrupted(b,data);assert.equal(all.balance,100000-initial);b.corrupted=all.levels;b.currencies.corrupted=all.balance;
  for(const d of data.corruptedUpgrades){const r=setCorruptedLevel(b,d.id,0,data);b.corrupted[d.id]=r.level;b.currencies.corrupted=r.balance}
  assert.equal(b.currencies.corrupted,100000);
});
