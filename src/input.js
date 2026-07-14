// Keyboard input. Left/right only for now; more actions (jump, slide)
// can hang off the same class later.
export class Input {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get left() {
    return this.keys.has('ArrowLeft') || this.keys.has('KeyA');
  }

  get right() {
    return this.keys.has('ArrowRight') || this.keys.has('KeyD');
  }

  /** -1 (left), +1 (right) or 0. */
  axis() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }
}
