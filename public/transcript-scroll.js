export class TranscriptFollower {
  constructor({ feed, controls, button }) {
    Object.assign(this, { feed, controls, button });
    this.following = true;
    this.active = false;
    this.frame = null;
    this.releaseFrame = null;
    this.programmatic = false;
    window.addEventListener('scroll', () => this.scrolled(), { passive: true });
    window.addEventListener('wheel', event => this.intent(event.deltaY), { passive: true });
    window.addEventListener('touchstart', event => { this.touchY = event.touches[0]?.clientY; }, { passive: true });
    window.addEventListener('touchmove', event => {
      const y = event.touches[0]?.clientY;
      if (Number.isFinite(y) && Number.isFinite(this.touchY)) this.intent(this.touchY - y);
      this.touchY = y;
    }, { passive: true });
    window.addEventListener('keydown', event => {
      if (event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) this.intent(-1);
      if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) this.intent(1);
    });
    window.addEventListener('resize', () => this.changed());
    window.visualViewport?.addEventListener('resize', () => this.changed());
    this.lastY = window.scrollY || 0;
  }

  intent(delta) {
    if (!delta) return;
    if (delta < 0) {
      this.cancel();
      this.following = false;
      this.button.hidden = !this.feed.lastElementChild;
    } else if (this.nearBottom()) {
      this.following = true;
      this.button.hidden = true;
    }
  }

  nearBottom() {
    const last = this.feed.lastElementChild;
    return Boolean(last && last.getBoundingClientRect().bottom <= window.innerHeight - this.controls.offsetHeight + 32);
  }

  scrolled() {
    const y = window.scrollY || 0;
    const movedUp = y < this.lastY;
    const movedDown = y > this.lastY;
    this.lastY = y;
    const last = this.feed.lastElementChild;
    if (!last) return;
    const nearBottom = this.nearBottom();
    if (!this.programmatic && movedUp && !nearBottom) {
      this.cancel();
      this.following = false;
    } else if (this.programmatic || this.frame !== null) return;
    else if (movedDown && nearBottom) this.following = true;
    this.button.hidden = this.following;
  }

  changed(active = this.active) {
    const wasActive = this.active;
    this.active = active;
    if (!active) {
      if (wasActive) this.cancel();
      return;
    }
    if (!this.feed.lastElementChild) return;
    if (!this.following) { this.button.hidden = false; return; }
    this.queueScroll();
  }

  queueScroll() {
    if (this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      if (!this.following) return;
      const last = this.feed.lastElementChild;
      if (!last) return;
      this.programmatic = true;
      last.style.scrollMarginBottom = `${this.controls.offsetHeight + 20}px`;
      last.scrollIntoView({ block: 'end', behavior: 'instant' });
      this.button.hidden = true;
      if (this.releaseFrame !== null) window.cancelAnimationFrame(this.releaseFrame);
      this.releaseFrame = window.requestAnimationFrame(() => {
        this.releaseFrame = null;
        this.programmatic = false;
        this.lastY = window.scrollY || 0;
      });
    });
  }

  jump() {
    this.following = true;
    this.button.hidden = true;
    this.queueScroll();
  }

  cancel() {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    if (this.releaseFrame !== null) window.cancelAnimationFrame(this.releaseFrame);
    this.frame = this.releaseFrame = null;
    this.programmatic = false;
  }

  reset() {
    this.cancel();
    this.following = true;
    this.active = false;
    this.button.hidden = true;
  }
}
