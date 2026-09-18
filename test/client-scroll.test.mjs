import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptFollower } from '../public/transcript-scroll.js';

function fixture() {
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
  const follower = new TranscriptFollower({ feed, controls, button, view });
  return {
    follower, feed, tail, view, button, controls, count: () => scrolls,
    frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    wheel(deltaY) { view.dispatchEvent(Object.assign(new Event('wheel'), { deltaY })); },
  };
}

test('stream growth follows once per frame and ignores layout/programmatic scroll events', () => {
  const f = fixture();
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

test('scrolling up cancels queued following; reading older content is not interrupted', () => {
  const f = fixture();
  f.follower.changed();
  f.wheel(-50);
  f.frame();
  assert.equal(f.count(), 0);
  f.tail.bottom += 500;
  f.follower.changed();
  f.frame();
  assert.equal(f.count(), 0);
  assert.equal(f.button.hidden, false);
  f.follower.jump();
  f.frame();
  assert.equal(f.count(), 1);
  assert.equal(f.button.hidden, true);
});

test('touch scrolling up pauses following and scrolling down to the bottom resumes it', () => {
  const f = fixture();
  f.view.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{ clientY: 100 }] }));
  f.view.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ clientY: 160 }] }));
  assert.equal(f.follower.following, false);
  f.view.dispatchEvent(Object.assign(new Event('touchmove'), { touches: [{ clientY: 80 }] }));
  f.tail.bottom = 700;
  f.view.scrollY = 300;
  f.view.dispatchEvent(new Event('scroll'));
  assert.equal(f.follower.following, true);
});

test('viewport and control-size changes use the latest geometry', () => {
  const f = fixture();
  f.follower.changed(true);
  f.controls.offsetHeight = 220;
  f.view.innerHeight = 600;
  f.view.dispatchEvent(new Event('resize'));
  f.frame();
  assert.equal(f.tail.style.scrollMarginBottom, '240px');
  assert.equal(f.tail.bottom, 360);
});

test('ending or resetting does not leave a queued scroll against a previous conversation', () => {
  const f = fixture();
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

test('resizing a restored conversation does not move the reader; Latest still works explicitly', () => {
  const f = fixture();
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

test('scrollbar dragging cancels a pending follow and returning to the bottom resumes it', () => {
  const f = fixture();
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

test('scrolling down while already at the bottom resumes following without needing another scroll event', () => {
  const f = fixture();
  f.tail.bottom = 700;
  f.wheel(-1);
  assert.equal(f.follower.following, false);
  f.wheel(1);
  assert.equal(f.follower.following, true);
  assert.equal(f.button.hidden, true);
});
