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
  f.fire('mousemove',{movementX:0,movementY:0});
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
test('duplicate requests cannot start concurrent acquisition', async () => {
  let requests = 0; const f=fixture(()=>{requests++;});
  assert.equal(f.control.request(),true); assert.equal(f.control.request(),false); assert.equal(requests,1);
  f.fire('pointerlockerror'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.control.pending,false); assert.equal(f.errors,1);
  f.control.dispose();
});

test('capture and coordinate rebasing cannot rotate the view; ordinary and fast turns keep their full displacement', () => {
  const f = fixture(); f.control.request(); f.acquire();
  const move = (x, y, clientX = 480, screenX = 680) => f.fire('mousemove', {
    movementX:x, movementY:y, clientX, clientY:360, screenX, screenY:460,
  });
  move(640,-300); // Stale pre-lock / recentering displacement, not a turn.
  move(12,-7);
  move(900,100,0,200); // Browser/OS moved the cursor's absolute anchor.
  move(4,2,0,200);
  move(900,-400,0,200); // A real fast/coalesced turn must not be capped.
  move(NaN,3,0,200); move(3,Infinity,0,200);
  assert.deepEqual(f.looks,[[12,-7],[4,2],[900,-400]]);
  f.control.release(); f.control.request(); f.acquire();
  move(-700,200); move(-5,8);
  assert.deepEqual(f.looks.at(-1),[-5,8]); assert.equal(f.looks.length,4);
  f.control.dispose();
});

test('raw input is requested, and unsupported raw input retries regular capture exactly once', async () => {
  const requests = [];
  const f = fixture(options => {
    requests.push(options);
    if (options) {
      f.fire('pointerlockerror');
      return Promise.reject(new DOMException('Raw input unavailable','NotSupportedError'));
    }
    return Promise.resolve();
  });
  f.control.request(true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requests,[{unadjustedMovement:true},undefined]);
  assert.equal(f.errors,0); assert.equal(f.control.pending,true);
  f.acquire();
  f.fire('mousedown',{button:0}); assert.deepEqual(f.actions,[]);
  f.fire('mouseup'); f.fire('mousedown',{button:0}); assert.deepEqual(f.actions,['push']);
  f.control.release(); f.control.request();
  assert.deepEqual(requests,[{unadjustedMovement:true},undefined,undefined]);
  f.control.dispose();
});

test('unsupported raw input also supports synchronous exceptions and legacy fallback', () => {
  const requests = [];
  const f = fixture(options => {
    requests.push(options);
    if (options) throw new DOMException('No raw input','NotSupportedError');
  });
  f.control.request(); f.acquire();
  assert.deepEqual(requests,[{unadjustedMovement:true},undefined]);
  assert.equal(f.errors,0); assert.equal(f.control.locked,true);
  f.control.dispose();
});

test('a denied promise plus its error event reports one failure and does not retry permission', async () => {
  let requests = 0;
  const f = fixture(() => {
    requests++; f.fire('pointerlockerror');
    return Promise.reject(new DOMException('Denied','NotAllowedError'));
  });
  f.control.request(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1); assert.equal(f.errors,1); assert.equal(f.control.pending,false);
  f.control.dispose();
});

test('cancelled raw requests cannot retry capture after the user has left', async () => {
  let reject, requests = 0;
  const f = fixture(() => { requests++; return new Promise((resolve, fail) => { reject = fail; }); });
  f.control.request(); f.control.release();
  reject(new DOMException('Unsupported','NotSupportedError'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1); assert.equal(f.errors,0); assert.equal(f.control.pending,false);
  f.control.dispose();
});
