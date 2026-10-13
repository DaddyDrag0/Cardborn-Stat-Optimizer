import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,artifactBonuses,effective} from '../core.js';
import {buildDefaults} from '../build.js';
import {prepareRollSession} from '../tower-simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const s={...defaults(data),artifact:{...defaults(data).artifact,rarity:'Celestial'}};

test('Unequal flat duplicates use the strongest two rolls regardless of physical order and Keep',()=>{
  const slots=[{id:'AwakenedLuck',value:43.5,position:0,locked:true},{id:'AwakenedLuck',value:47.3,position:6},{id:'AwakenedLuck',value:10,position:1},{id:'Luck',value:20}];
  const before=structuredClone(slots),bonus=artifactBonuses(s,slots,data);
  close(bonus.flat.AwakenedLuck,89.765);close(bonus.flat.Luck,26);
  assert.deepEqual(artifactBonuses(s,[...slots].reverse(),data),bonus);
  assert.deepEqual(slots,before);
});

test('Awakened reroll crossing the other copy changes which roll receives full weight',()=>{
  const other={id:'AwakenedLuck',value:47.3};
  const bonus=shown=>artifactBonuses(s,[{id:'AwakenedLuck',value:shown/1.3},other],data).flat.AwakenedLuck;
  close(bonus(56.55),89.765);close(bonus(46.9),84.94);close(bonus(65.4),96.145);
  // Non-PA flat total and multipliers from the supplied profile. Exercise
  // the actual build calculator and Tower simulation preparation together.
  const profile=defaults(data);profile.build=buildDefaults();profile.build.base.AwakenedLuck=84.996;
  profile.build.skills=['V2_RADIANCE_AWAKENING_3'];profile.artifact.rarity='Celestial';
  profile.simulation={tower:true};profile.build.floor=15;profile.build.dungeonSeconds=60;
  for(const [shown,expected]of [[56.55,285.949540552],[46.9,278.054721152],[65.4,296.388700712]]){
    profile.artifact.slots=[{id:'AwakenedLuck',value:shown/1.3},other,{id:'AwakenedLuckMult',value:1.441}];
    close(effective(profile,data).AwakenedLuck,expected);
    const prepared=prepareRollSession(profile,data,60);
    close(prepared.normal.stats.AwakenedLuck,expected);close(prepared.rewardPool(15).prepared.stats.AwakenedLuck,expected+1);
  }
});

test('Multiplier copies halve only the second strongest bonus above one and ignore further copies',()=>{
  const slots=[{id:'LuckMult',value:1.1,locked:true,position:0},{id:'LuckMult',value:1.6,position:8},{id:'LuckMult',value:1.4,position:1}];
  const before=structuredClone(slots),bonus=artifactBonuses(s,slots,data);
  close(bonus.mult.Luck,(1+.6*1.3)*(1+.4*.5*1.3));
  assert.deepEqual(artifactBonuses(s,[...slots].reverse(),data),bonus);
  assert.deepEqual(slots,before);
});
