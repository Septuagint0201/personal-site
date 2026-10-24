import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const scope = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../ui-surface-buttons.js', import.meta.url), 'utf8'), scope);
const policy = scope.window.SiteSurfaceButtons;

test('small nested controls frost, while long pills are classified by their height', () => {
  for (const [width, height] of [[44, 44], [48, 48], [240, 48], [366, 66]]) {
    assert.equal(policy.isFrosted({ interactive: true, nested: true, width, height }), true);
  }
  assert.equal(policy.isFrosted({ interactive: true, nested: true, width: 120, height: 120 }), false);
  assert.equal(policy.isFrosted({ interactive: true, nested: true, width: 96, height: 96 }), false);
});

test('standalone controls, panels and explicit glass exceptions retain optics', () => {
  assert.equal(policy.isFrosted({ interactive: true, nested: false, width: 44, height: 44 }), false);
  assert.equal(policy.isFrosted({ interactive: false, nested: true, width: 44, height: 44 }), false);
  assert.equal(policy.isFrosted({ interactive: true, nested: true, width: 44, height: 44, forceGlass: true }), false);
  assert.equal(policy.isFrosted({ interactive: true, nested: true, width: 0, height: 0 }), false);
});

test('classification uses layout dimensions and reverses cleanly after a resize', () => {
  const classes = new Set();
  const node = { offsetWidth: 120, offsetHeight: 120, dataset: {}, matches: () => true,
    parentElement: { closest: () => ({}) },
    getBoundingClientRect() { throw new Error('Hover transforms must not decide material'); },
    classList: { contains: name => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) } };
  assert.equal(policy.classify([node]).length, 1);
  node.offsetHeight = 48;
  assert.equal(policy.classify([node]).length, 0);
  assert.equal(classes.has('surface-button-frost'), true);
  node.offsetHeight = 120;
  assert.equal(policy.classify([node]).length, 1);
  assert.equal(classes.has('surface-button-frost'), false);
});

test('the saved surface values stay constant while the theme changes only tint brightness', () => {
  const values = {};
  const root = { style: { setProperty: (key, value) => { values[key] = value; } } };
  policy.applyTheme(root, true);
  assert.equal(values['--surface-button-tone'], '86.7');
  policy.applyTheme(root, false);
  assert.equal(values['--surface-button-tone'], '170.85');
  assert.equal(values['--surface-button-blur'], '10px');
  assert.equal(values['--surface-button-opacity'], '0.15');
  assert.equal(values['--surface-button-saturation'], '0.8');
});
