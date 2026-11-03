import test from 'node:test';
import assert from 'node:assert/strict';
import { InputPump } from '../../../build/client/app/input-pump.js';

test('input pump samples independently, clamps no world clock and neutralizes blur/visibility with disposable listeners', () => {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const win = new EventTarget(),
    doc = new EventTarget();
  doc.hidden = false;
  globalThis.window = win;
  globalThis.document = doc;
  const sent = [],
    calls = [];
  const app = {
    online: true,
    disposed: false,
    frozen: false,
    transport: { sendInput: (intent) => sent.push(intent) },
    network: {
      requestResync: () => calls.push('resync'),
      sendInput: (intent) => sent.push(intent),
    },
    session: {
      phase: 'playing',
      localPlayer: () => ({}),
      startGame: () => calls.push('join'),
      continueToMenu: () => calls.push('menu'),
    },
    input: {
      keyboard: { consumePressed: () => false },
      intent: () => ({ buttons: 1, angle: 2, strength: 200 }),
    },
    server: {
      think: () => {
        throw new Error('pump accessed simulation');
      },
    },
  };
  try {
    let at = 0;
    const pump = new InputPump(app, () => (at += 50));
    pump.sample();
    pump.sample();
    assert.equal(sent.length, 2);
    win.dispatchEvent(new Event('blur'));
    assert.deepEqual(sent.at(-1), { buttons: 0, angle: 0, strength: 0 });
    pump.sample();
    assert.equal(sent.length, 3);
    win.dispatchEvent(new Event('focus'));
    assert.deepEqual(calls, ['resync']);
    pump.sample();
    assert.equal(sent.length, 4);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    pump.sample();
    assert.equal(sent.length, 5);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    pump.sample();
    assert.equal(sent.length, 6);
    pump.start();
    pump.start();
    pump.dispose();
    const count = sent.length;
    win.dispatchEvent(new Event('blur'));
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(sent.length, count);
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});
