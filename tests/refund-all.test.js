import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalize,defaults,effective} from '../core.js';
import {buildDefaults,refundAllShop,shopAction,buyAllCorrupted} from '../build.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
function setup(){return normalize({...defaults(data),rolls:1e8,build:buildDefaults()},data)}

test('Tower refund returns all gold, including the extra relic slot, without touching the other shop',()=>{
  const s=setup();s.build.tower={Luck:3,AwakenedLuck:2,VoidLuck:1,ThirdRelicSlot:1};s.build.passes.TwoRelic=true;s.build.relics=[{id:'WeightedDice',border:1},{id:'RelicOfBonus',border:1},{id:'SunforgedHammer',border:6}];s.build.corrupted.CorruptedCalling=4;s.build.currencies={tower:7,corrupted:100,void:50};
  const snapshot=structuredClone(s.build),r=refundAllShop(s.build,'tower',data);assert.equal(r.refund,55);assert.equal(r.balance,62);assert.deepEqual(s.build,snapshot);assert.ok(data.towerShop.every(d=>r.levels[d.id]===0));assert.equal(r.relics.length,2);assert.deepEqual(r.unequippedRelics,[{id:'SunforgedHammer',border:6}]);
  s.build.tower=r.levels;s.build.currencies.tower=r.balance;s.build.relics=r.relics;assert.equal(refundAllShop(s.build,'tower',data).refund,0);assert.equal(refundAllShop(s.build,'tower',data).balance,62);assert.deepEqual(s.build.corrupted,snapshot.corrupted);assert.equal(s.build.currencies.corrupted,100);assert.equal(effective(s,data).Luck,1);
});

test('Corrupted refund uses all intervening costs, not just the last purchase, and cannot refund twice',()=>{
  const s=setup();s.build.corrupted={CorruptedFortune:3,AwakenedRitual:2,CorruptedCalling:2,EchoRoll:1,FracturedRoll:1};s.build.tower.Luck=2;s.build.currencies={corrupted:17,tower:9,void:11};
  const r=refundAllShop(s.build,'corrupted',data);assert.equal(r.refund,248+102+225+60+125);assert.equal(r.balance,777);assert.ok(data.corruptedUpgrades.every(d=>r.levels[d.id]===0));s.build.corrupted=r.levels;s.build.currencies.corrupted=r.balance;
  assert.equal(refundAllShop(s.build,'corrupted',data).refund,0);assert.equal(s.build.tower.Luck,2);assert.equal(s.build.currencies.tower,9);assert.equal(effective(s,data).CorruptedLuck,1);assert.equal(effective(s,data).DoubleRollChance,0);
});

test('Buy/refund-all cycles conserve the full shop budget; Void refunds remain unavailable',()=>{
  const s=setup();s.build.currencies.tower=25;const bought=shopAction(s.build,'tower','Luck','max',data);s.build.tower.Luck=bought.level;s.build.currencies.tower=bought.balance;const tower=refundAllShop(s.build,'tower',data);assert.equal(tower.balance,25);
  s.build.currencies.corrupted=50000;const all=buyAllCorrupted(s.build,data);s.build.corrupted=all.levels;s.build.currencies.corrupted=all.balance;const refund=refundAllShop(s.build,'corrupted',data);assert.equal(refund.refund,45607);assert.equal(refund.balance,50000);assert.ok(refundAllShop(s.build,'void',data).error);
});
