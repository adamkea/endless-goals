import * as THREE from 'three';

// Click-and-hold shot controls:
//  - pointerdown picks the aim point (where on screen the shot should go)
//    and starts charging power
//  - the aim keeps tracking the cursor while holding, and dragging sideways
//    from the press point also sets the curve (-1..1)
//  - pointerup fires with whatever power has built up
// The controller also drives the power/curve HUD while charging.

const CHARGE_TIME = 1.1; // seconds of holding to reach full power
const CURVE_RANGE_PX = 220; // horizontal drag distance for maximum curve

export class ShootingControls {
  /**
   * @param {HTMLElement} dom - element to listen for aiming clicks on
   * @param {() => boolean} canShoot - whether a new shot may start charging
   */
  constructor(dom, canShoot) {
    this.charging = false;
    this.power = 0;
    this.curve = 0;
    this.aimNdc = new THREE.Vector2();
    this._pressX = 0;
    this._shot = null;

    this._ui = document.getElementById('shoot-ui');
    this._fill = document.getElementById('power-fill');
    this._dot = document.getElementById('curve-dot');

    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.charging || !canShoot()) return;
      this.charging = true;
      this.power = 0;
      this.curve = 0;
      this._pressX = e.clientX;
      this.aimNdc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this._ui.classList.add('active');
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.charging) return;
      this.curve = THREE.MathUtils.clamp(
        (e.clientX - this._pressX) / CURVE_RANGE_PX,
        -1,
        1
      );
      this.aimNdc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.charging) return;
      this.charging = false;
      this._ui.classList.remove('active');
      this._shot = {
        ndc: this.aimNdc.clone(),
        power: this.power,
        curve: this.curve,
      };
    });

    // Losing focus mid-hold cancels the shot rather than firing it
    window.addEventListener('blur', () => {
      this.charging = false;
      this._ui.classList.remove('active');
    });
  }

  update(dt) {
    if (!this.charging) return;
    this.power = Math.min(1, this.power + dt / CHARGE_TIME);
    this._fill.style.width = `${this.power * 100}%`;
    this._fill.style.background = `hsl(${(1 - this.power) * 110}, 90%, 52%)`;
    this._dot.style.left = `${50 + this.curve * 50}%`;
  }

  /** Returns the released shot once ({ndc, power, curve}), else null. */
  consumeShot() {
    const shot = this._shot;
    this._shot = null;
    return shot;
  }
}
