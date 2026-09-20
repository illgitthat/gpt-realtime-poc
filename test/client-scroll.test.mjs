import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptFollower } from '../public/transcript-scroll.js';

function fixture(t) {
  let next = 0, scrolls = 0;
  const frames = new Map();
  const controls = { offsetHeight: 100 };
  const button = { hidden: true };
  const view = Object.assign(new EventTarget(), {
    innerHeight: 800, scrollY: 0,
    requestAnimationFrame(callback) { frames.set(++next, callback); return next; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const tail = {
    bottom: 950, style: {},
    getBoundingClientRect() { return { bottom: this.bottom }; },
    scrollIntoView() {
      scrolls++;
      view.scrollY += this.bottom - (view.innerHeight - controls.offsetHeight - 20);
      this.bottom = view.innerHeight - controls.offsetHeight - 20;
      view.dispatchEvent(new Event('scroll'));
    },
  };
  const feed = { lastElementChild: tail };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: view });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  const follower = new TranscriptFollower({ feed, controls, button });
  return {
    follower, feed, tail, view, button, controls, count: () => scrolls,
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    wheel(deltaY) { view.dispatchEvent(Object.assign(new Event('wheel'), { deltaY })); },
  };
}

test('stream growth follows once per frame and ignores layout/programmatic scroll events', t => {
  const f = fixture(t);
  f.follower.changed(true);
  f.tail.bottom += 300;
  f.follower.changed(true);
  f.view.dispatchEvent(new Event('scroll'));
  f.frame();
  f.frame();
  assert.equal(f.count(), 1);
  f.tail.bottom += 200;
  f.follower.changed(true);
  f.frame();
  assert.equal(f.count(), 2);
  assert.equal(f.button.hidden, true);
});

test('scrolling up cancels queued following; reading older content is not interrupted', t => {
  const f = fixture(t);
  f.follower.changed(true);
  f.wheel(-50);
  f.frame();
  assert.equal(f.count(), 0);
  f.tail.bottom += 500;
  f.follower.changed(true);
  f.frame();
  assert.equal(f.count(), 0);
  assert.equal(f.button.hidden, false);
  f.follower.jump();
  f.frame();
  assert.equal(f.count(), 1);
  assert.equal(f.button.hidden, true);
});

test('touch scrolling up pauses following and scrolling down to the bottom resumes it', t => {
  const f = fixture(t);
  f.follower.changed(true);
  f.view.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{ clientY: 100 }] }));
  f.view.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ clientY: 160 }] }));
  f.frame();
  assert.equal(f.count(), 0);
  f.view.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ clientY: 80 }] }));
  f.tail.bottom = 700;
  f.view.scrollY = 300;
  f.view.dispatchEvent(new Event('scroll'));
  f.tail.bottom = 950;
  f.follower.changed(true);
  f.frame();
  assert.equal(f.count(), 1);
});

test('ending or resetting does not leave a queued scroll against a previous conversation', t => {
  const f = fixture(t);
  f.follower.changed(true);
  f.follower.changed(false);
  f.frame();
  assert.equal(f.count(), 0);
  f.follower.changed(true);
  f.follower.reset();
  f.frame();
  assert.equal(f.count(), 0);
  f.follower.changed(false);
  f.frame();
  assert.equal(f.count(), 0);
});

test('resizing a restored conversation does not move the reader; Latest still works explicitly', t => {
  const f = fixture(t);
  f.follower.changed(false);
  f.view.dispatchEvent(new Event('resize'));
  f.frame();
  assert.equal(f.count(), 0);
  f.follower.jump();
  f.frame();
  f.frame();
  assert.equal(f.count(), 1);
  f.view.dispatchEvent(new Event('resize'));
  f.frame();
  assert.equal(f.count(), 1);
});

test('scrollbar dragging cancels a pending follow and returning to the bottom resumes it', t => {
  const f = fixture(t);
  f.view.scrollY = 500;
  f.view.dispatchEvent(new Event('scroll'));
  f.follower.changed(true);
  f.view.scrollY = 200;
  f.view.dispatchEvent(new Event('scroll'));
  f.frame();
  assert.equal(f.count(), 0);
  assert.equal(f.button.hidden, false);
  f.wheel(-1);
  f.view.scrollY = 600;
  f.tail.bottom = 700;
  f.view.dispatchEvent(new Event('scroll'));
  f.tail.bottom = 900;
  f.follower.changed(true);
  f.frame();
  assert.equal(f.count(), 1);
  assert.equal(f.button.hidden, true);
});

test('scrolling down while already at the bottom resumes following without needing another scroll event', t => {
  const f = fixture(t);
  f.tail.bottom = 700;
  f.wheel(-1);
  f.wheel(1);
  f.tail.bottom = 950;
  f.follower.changed(true);
  f.frame();
  assert.equal(f.count(), 1);
});
