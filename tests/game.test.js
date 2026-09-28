import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,adopt,tick,clean,feedFish,restore} from '../src/game.js';
test('adoption spends currency and respects capacity',()=>{const s=freshState();assert.equal(adopt(s,0),true);assert.equal(s.coins,240);assert.equal(s.fish.length,6);s.coins=0;assert.equal(adopt(s,3),false);s.coins=10000;while(s.fish.length<16)adopt(s,0);assert.equal(adopt(s,0),false);});
test('healthy fish earn coins and grow; hungry fish do not',()=>{const s=freshState();tick(s,30);assert.equal(s.coins,335);assert.ok(s.fish[0].growth>0);s.fish.forEach(f=>f.hunger=0);const coins=s.coins,growth=s.fish[0].growth;tick(s,30);assert.equal(s.coins,coins);assert.equal(s.fish[0].growth,growth);});
test('feeding and cleaning clamp stats and charge once',()=>{const s=freshState();feedFish(s,s.fish[0]);assert.equal(s.fed,1);assert.equal(s.fish[0].hunger,90);s.quality=90;assert.equal(clean(s),true);assert.equal(s.quality,100);assert.equal(s.coins,300);assert.equal(clean(s),false);});
test('save round trip and invalid data recovery',()=>{const s=freshState();s.coins=789;s.fish[0].growth=62;const r=restore(JSON.stringify(s));assert.equal(r.coins,789);assert.equal(r.fish[0].growth,62);assert.equal(restore('broken').fish.length,5);assert.equal(restore('{"version":1,"fish":[{"type":99}]}').fish.length,5);});
