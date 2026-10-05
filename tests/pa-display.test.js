import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,scaledMax,artifactBonuses} from '../core.js';
import {paGameValue,paRawValue,paDisplayValue} from '../pa-display.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),s=defaults(data);s.artifact.rarity='Celestial';
test('PA screenshot values display 18.2 Fabled Luck, max 19.1, and 55% quality at level 58',()=>{const def=data.personalArtifact.stats.find(d=>d.id==='FabledLuck'),raw=paRawValue(s,def,18.2,data);assert.ok(Math.abs(raw-14)<1e-10);assert.equal(paDisplayValue(s,def,raw,data),18.2);assert.equal(paDisplayValue(s,def,scaledMax(def,58),data),19.1);assert.equal(Math.round((raw-def.min)/(def.max-def.min)*100),55)});
test('Game values round-trip for flats, multipliers, chances and potion percentages at all rarities',()=>{for(const rarity of data.personalArtifact.rarities){const p={...s,artifact:{...s.artifact,rarity:rarity.id}};for(const def of data.personalArtifact.stats){const raw=def.min+(def.max-def.min)*.55,shown=paGameValue(p,def,raw,data);assert.ok(Math.abs(paRawValue(p,def,shown,data)-raw)<1e-8)}}});
test('Entering game values applies rarity once while Void strength stays separate',()=>{const def=data.personalArtifact.stats.find(d=>d.id==='FabledLuck'),raw=paRawValue(s,def,18.2,data),p={...s,build:{void:{VoidArtifactPower:2}}};const bonus=artifactBonuses(p,[{id:def.id,value:raw}],data);assert.ok(Math.abs(bonus.flat.FabledLuck-18.2*1.1)<1e-10);assert.equal(paDisplayValue(p,def,raw,data),18.2)});
