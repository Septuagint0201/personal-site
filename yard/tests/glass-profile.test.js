import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE, normalizeProfile, curveAt, dimensions, footprintDistance, sampleProfile, spectrum, exportProfile, importProfile } from '../../glass-profile.js';

test('both curve families stay finite and monotone across their editable range', () => {
  const cases=[];
  for(const bias of [.03,.438,4])for(const exponent of [1,3,6])cases.push(normalizeProfile({bias,exponent}));
  for(const values of [[.02,0,.98,1],[.12,.78,.42,1],[.88,1,.12,0]])cases.push(normalizeProfile({kind:'bezier',x1:values[0],y1:values[1],x2:values[2],y2:values[3]}));
  for(const state of cases){
    assert.equal(curveAt(0,state).height,0);assert.equal(curveAt(1,state).height,1);
    let previous=0;
    for(let i=0;i<=1000;i++){const value=curveAt(i/1000,state);assert.ok(Number.isFinite(value.height)&&Number.isFinite(value.slope));assert.ok(value.height+1e-8>=previous);assert.ok(value.slope>=0);previous=value.height;}
  }
});
test('curve slopes agree with the geometry derivative and flat joins have zero slope', () => {
  for(const kind of ['hyperbolic','bezier']){
    const state=normalizeProfile({kind});
    for(const t of [.08,.24,.6,.9]){
      const numerical=(curveAt(t+1e-4,state).height-curveAt(t-1e-4,state).height)/2e-4;
      assert.ok(Math.abs(curveAt(t,state).slope-numerical)<.004);
    }
    assert.equal(curveAt(1,state).slope,0);
  }
});
test('GPU profile samples preserve the exact edge and centre thickness', () => {
  const state=normalizeProfile({kind:'bezier',edge:.43}),result=sampleProfile(state);
  assert.ok(Math.abs(result.pixels[0]-.43)<1e-7);
  assert.equal(result.pixels[511*4],1);
  for(let i=0;i<512;i++){
    const expected=state.edge+(1-state.edge)*curveAt(i/511,state).height;
    assert.ok(Math.abs(expected-result.pixels[i*4])<4e-8);
    assert.ok(result.maxSlope+1e-6>=result.pixels[i*4+1]);
  }
});
test('shape sections and transition widths use the actual footprint inradius', () => {
  for(const shape of ['card','pill','circle','triangle']){
    const state=normalizeProfile({shape,width:180,height:156,radius:10,shoulder:140}),d=dimensions(state);
    const y=shape==='triangle'?-d.height/2+d.inradius:0;
    assert.ok(Math.abs(footprintDistance(0,y,state)+d.inradius)<1e-6);
    assert.ok(d.shoulder<d.inradius);
    assert.ok(footprintDistance(d.width,0,state)>0);
  }
  const pill=dimensions(normalizeProfile({shape:'pill',width:180,height:56,shoulder:100}));
  assert.equal(pill.shoulder,28*.98);
});
test('export round trips extended optics, geometry and curve coefficients', () => {
  const state=normalizeProfile({kind:'bezier',shape:'triangle',ior:4.5,dispersion:1.2,thickness:180,x1:.04,y1:.8,x2:.2,y2:.95});
  const file=JSON.parse(JSON.stringify(exportProfile(state)));
  assert.deepEqual(importProfile(file),state);assert.equal(file.samples.length,129);
  assert.deepEqual(file.effectiveRGB,[3.3,4.5,5.7]);
  assert.ok(spectrum(normalizeProfile({ior:1.05,dispersion:1.2}))[0]>=1.001);
});
test('invalid imports fail before replacing a saved choice', () => {
  assert.throws(()=>importProfile({version:9,parameters:DEFAULT_PROFILE}));
  const file=exportProfile(DEFAULT_PROFILE);file.parameters.ior='2.4';assert.throws(()=>importProfile(file));
  assert.ok(Number.isFinite(normalizeProfile({thickness:Infinity,bias:NaN}).thickness));
});
