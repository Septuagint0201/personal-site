import test from 'node:test';
import assert from 'node:assert/strict';
import { writeEllipsoidTransform, packCapsuleGroups, METAL_GROUP_SIZE, METAL_SEGMENT_CAPACITY } from '../src/liquid-optics.js';
import { createLiquidSimulation } from '../src/liquid-simulation.js';
import { METAL_SEGMENTS } from '../src/liquid-room.js';

const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const close = (a,b,tolerance=2e-5) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
function pack(drop,scale=1) {
  const rows = [new Float32Array(4),new Float32Array(4),new Float32Array(4)];
  writeEllipsoidTransform(...rows,0,drop,scale);
  return rows;
}
test('packed ellipsoids retain orthogonal axes, anisotropy and exact visible radii',()=>{
  for(let n=0;n<200;n++) {
    const angle=n*.173, y=-.999+n/200*1.998, r=Math.sqrt(1-y*y);
    const drop={orientation:[r*Math.cos(angle),y,r*Math.sin(angle)],radius:.03+n*.002,deform:[.8,1.1,1/(.8*1.1)]};
    const rows=pack(drop,1.025);
    rows.forEach((row,i)=>close(row[3],drop.radius*drop.deform[i]*1.025));
    const basis=rows.map(row=>Array.from(row.slice(0,3)).map(v=>v*row[3]));
    basis.forEach(axis=>close(dot(axis,axis),1));
    close(dot(basis[0],basis[1]),0);close(dot(basis[1],basis[2]),0);close(dot(basis[2],basis[0]),0);
  }
});
test('precomputed GPU transforms intersect the same surface as interaction picking near both poles',()=>{
  for(const y of [-1,-.99,-.920001,-.919999,-.4,0,.4,.919999,.920001,.99,1]) {
    const sim=createLiquidSimulation({initialDrops:[{position:[0,2,0],radius:.28,velocity:[0,0,0]}]});
    const drop=sim.getDrops()[0];drop.orientation=[Math.sqrt(1-y*y),y,0];drop.deform=[.78,1.17,1/(.78*1.17)];
    const rows=pack(drop);
    for(let n=0;n<24;n++) {
      const dir=[Math.cos(n),Math.sin(n),.3],length=Math.hypot(...dir);
      const rd=dir.map(v=>v/length),origin=drop.position.map((v,i)=>v-rd[i]*2);
      const localO=rows.map(row=>dot(Array.from(row.slice(0,3)),origin.map((v,i)=>v-drop.position[i])));
      const localD=rows.map(row=>dot(Array.from(row.slice(0,3)),rd));
      const a=dot(localD,localD),b=dot(localO,localD),c=dot(localO,localO)-1;
      close((-b-Math.sqrt(b*b-a*c))/a,sim.pick(origin,rd).distance);
    }
  }
});
test('tiny attached parcels and pressed scaling keep the original optical minimum radius',()=>{
  const rows=pack({orientation:[0,1,0],radius:.001,deform:[.5,1,2]},.96);
  rows.forEach(row=>{close(row[3],.006);assert.ok(Array.from(row).every(Number.isFinite));});
});

test('Float32 metal bounds conservatively enclose every capsule including rounded ends',()=>{
  const {low,high}=packCapsuleGroups(METAL_SEGMENTS);
  METAL_SEGMENTS.forEach((segment,index)=>{
    const offset=Math.floor(index/METAL_GROUP_SIZE)*4;
    for(let axis=0;axis<3;axis++) {
      // These extrema enclose the full Minkowski sum of segment and sphere,
      // including axis-parallel and grazing rays at either spherical end.
      const minimum=Math.min(segment.a[axis],segment.b[axis])-segment.radius;
      const maximum=Math.max(segment.a[axis],segment.b[axis])+segment.radius;
      assert.ok(low[offset+axis]<minimum);
      assert.ok(high[offset+axis]>maximum);
    }
  });
});

test('bounds retain an incomplete last group and reject capacity overflow',()=>{
  const list=METAL_SEGMENTS.slice(0,METAL_GROUP_SIZE+1);
  const {low,high}=packCapsuleGroups(list);
  const last=list.at(-1);
  for(let axis=0;axis<3;axis++) {
    assert.ok(low[4+axis]<Math.min(last.a[axis],last.b[axis])-last.radius);
    assert.ok(high[4+axis]>Math.max(last.a[axis],last.b[axis])+last.radius);
  }
  assert.throws(()=>packCapsuleGroups(Array(METAL_SEGMENT_CAPACITY+1).fill(last)),RangeError);
});
