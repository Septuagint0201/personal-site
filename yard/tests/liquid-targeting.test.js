import test from 'node:test';
import assert from 'node:assert/strict';
import { findLiquidTarget } from '../src/liquid-targeting.js';
import { createLiquidSimulation } from '../src/liquid-simulation.js';

const origin=[0,1.65,4.5], forward=[0,0,-1];
function fixture(positions) {
  const simulation=createLiquidSimulation({initialDrops:positions.map((position,i)=>({position,radius:.035,velocity:[0,0,0]}))});
  return {origin,forward,drops:simulation.getDrops(),pick:simulation.pick,obstruction:()=>Infinity};
}
test('slightly off-centre drops can be acquired with a real hit ray', () => {
  const f=fixture([[.07,1.65,2.5]]);
  assert.equal(f.pick(origin,forward),null);
  const target=findLiquidTarget(f); assert.ok(target?.assisted);
  assert.equal(f.pick(origin,target.ray).id,target.id);
});
test('exact hits override sticky neighbours', () => {
  const f=fixture([[.07,1.65,2.5],[0,1.65,2.4]]);
  const target=findLiquidTarget({...f,previousId:f.drops[0].id});
  assert.equal(target.id,f.drops[1].id); assert.equal(target.assisted,false);
});
test('sticky acquisition has a bounded exit cone and releases outside it', () => {
  const f=fixture([[.11,1.65,2.5]]);
  assert.equal(findLiquidTarget(f),null);
  assert.ok(findLiquidTarget({...f,previousId:f.drops[0].id}));
  f.drops[0].position[0]=.15;
  assert.equal(findLiquidTarget({...f,previousId:f.drops[0].id}),null);
});
test('metal occlusion is tested on the assisted ray, not just the reticle ray', () => {
  const f=fixture([[.07,1.65,2.5]]);
  assert.equal(findLiquidTarget({...f,obstruction:ray=>ray[0]>.01?1:Infinity}),null);
});
test('far, behind-camera and occluded drops never acquire', () => {
  for (const positions of [[[0,1.65,-2]],[[0,1.65,6]]]) assert.equal(findLiquidTarget(fixture(positions)),null);
  const f=fixture([[0,1.65,2.5]]);
  assert.equal(findLiquidTarget({...f,obstruction:()=>1}),null);
});
test('merging away the old identity does not retain a stale target', () => {
  const f=fixture([[.07,1.65,2.5]]);
  assert.ok(findLiquidTarget({...f,previousId:9999}));
  assert.equal(findLiquidTarget({...f,drops:[],pick:()=>null,previousId:f.drops[0].id}),null);
});
