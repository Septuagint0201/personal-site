import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiquidPointerLock } from '../src/liquid-pointer-lock.js';

function fixture(request = () => undefined) {
  const doc = new EventTarget();
  const canvas = { ownerDocument: doc, focus() {}, requestPointerLock: request };
  let allowed = true, exits = 0, errors = 0;
  const looks = [], actions = [], states = [];
  const fire = (type, properties = {}) => { const event = new Event(type, {cancelable:true}); Object.assign(event, properties); doc.dispatchEvent(event); return event; };
  const acquire = () => { doc.pointerLockElement = canvas; fire('pointerlockchange'); };
  doc.exitPointerLock = () => { doc.pointerLockElement = null; fire('pointerlockchange'); };
  const control = createLiquidPointerLock({canvas, document:doc, canEnter:()=>allowed,
    onLook:(...delta)=>looks.push(delta), onAction:action=>actions.push(action), onChange:s=>states.push(s),
    onExit:()=>exits++, onError:()=>errors++});
  return {control,canvas,doc,fire,acquire,looks,actions,states,setAllowed:v=>allowed=v,get exits(){return exits;},get errors(){return errors;}};
}
test('entry click only captures; subsequent left and right clicks dispatch distinct actions', () => {
  const f = fixture();
  f.control.request(true); f.acquire();
  f.fire('mousedown',{button:0});
  assert.deepEqual(f.actions,[]);
  f.fire('mouseup',{button:0});
  f.fire('mousedown',{button:0}); f.fire('mousedown',{button:2}); f.fire('mousedown',{button:1});
  assert.deepEqual(f.actions,['push','split']);
  f.control.dispose();
});
test('relative movement works without holding a button and stops on Escape', () => {
  const f = fixture(); f.control.request(); f.acquire();
  f.fire('mousemove',{movementX:12,movementY:-7});
  assert.deepEqual(f.looks,[[12,-7]]);
  f.fire('keydown',{key:'Escape'});
  f.fire('mousemove',{movementX:4,movementY:2});
  f.fire('mousedown',{button:0});
  assert.equal(f.control.locked,false); assert.equal(f.exits,1);
  assert.equal(f.looks.length,1); assert.equal(f.actions.length,0);
  f.control.dispose();
});
test('modal/hidden state gates all look and action callbacks', () => {
  const f = fixture(); f.setAllowed(false); assert.equal(f.control.request(),false);
  f.setAllowed(true); f.control.request(); f.acquire(); f.setAllowed(false);
  f.fire('mousemove',{movementX:10,movementY:0}); f.fire('mousedown',{button:2});
  assert.deepEqual(f.looks,[]); assert.deepEqual(f.actions,[]);
  f.control.release(); assert.equal(f.exits,1); f.control.dispose();
});
test('rejected promises and missing API recover without a stuck pending state', async () => {
  const f = fixture(()=>Promise.reject(new Error('denied')));
  f.control.request(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.errors,1); assert.equal(f.control.pending,false);
  f.canvas.requestPointerLock = undefined;
  assert.equal(f.control.request(),false); assert.equal(f.errors,2); f.control.dispose();
});
test('cancellation and disposal release late legacy acquisitions', () => {
  for (const finish of ['release','dispose']) {
    const f = fixture(); f.control.request(); f.control[finish](); f.acquire();
    assert.equal(f.control.locked,false);
    f.fire('mousedown',{button:0}); assert.deepEqual(f.actions,[]);
    f.control.dispose();
  }
});
test('duplicate requests cannot start concurrent acquisition', () => {
  let requests = 0; const f=fixture(()=>{requests++;});
  assert.equal(f.control.request(),true); assert.equal(f.control.request(),false); assert.equal(requests,1);
  f.fire('pointerlockerror'); assert.equal(f.control.pending,false); assert.equal(f.errors,1);
  f.control.dispose();
});
