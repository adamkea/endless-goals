import * as THREE from 'three';

// The match ball. Two states:
//  - 'dribble': glued just ahead of the runner's feet, rolling with the
//    scrolling pitch so it looks like the player is dribbling at speed.
//  - 'flight': kicked. Ballistic motion with gravity, a lateral Magnus-style
//    curve force while airborne, and bounces. Because the world scrolls
//    toward the camera, a spent shot drifts back to the player, who
//    "collects" it back into the dribble.

export const BALL_RADIUS = 0.32;

const GRAVITY = 24;
const CURVE_ACCEL = 30; // lateral acceleration at full curve (units/s^2)
const MIN_SHOT_SPEED = 18;
const MAX_SHOT_SPEED = 46;
const BOUNCE_DAMPING = 0.55;
const BOUNCE_SPEED_LOSS = 0.8; // horizontal speed kept per bounce
const MIN_BOUNCE_SPEED = 1.5; // below this vertical speed the ball rolls
const ROLL_FRICTION = 0.8; // exponential decay rate while rolling (1/s)
// Ahead of the feet and off to the striking-foot side so the camera can see
// it past the runner's body
const DRIBBLE_OFFSET = new THREE.Vector3(0.5, BALL_RADIUS, -1.45);
const UP = new THREE.Vector3(0, 1, 0);

function createBallTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, size, size);
  // A loose hex grid of black patches reads as a classic ball once wrapped
  ctx.fillStyle = '#1a1a1a';
  const step = size / 4;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const x = col * step + (row % 2 === 0 ? 0 : step / 2);
      const y = row * step;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBall() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshStandardMaterial({
      map: createBallTexture(),
      roughness: 0.45,
    })
  );
  mesh.castShadow = true;
  mesh.position.copy(DRIBBLE_OFFSET);

  return {
    mesh,
    state: 'dribble',
    velocity: new THREE.Vector3(),
    curve: 0,
    bounced: false,
  };
}

/**
 * Initial velocity of a shot from `from` toward `target`.
 * `power` (0..1) sets the speed; `curve` (-1..1) pre-rotates the direction
 * against the curve so the ball swings out and bends back in toward the aim
 * point, like a real curled shot.
 */
export function computeShotVelocity(from, target, power, curve, out) {
  out.copy(target).sub(from).normalize();
  out.applyAxisAngle(UP, -curve * 0.35);
  return out.multiplyScalar(
    MIN_SHOT_SPEED + power * (MAX_SHOT_SPEED - MIN_SHOT_SPEED)
  );
}

/** Launch the ball from its current position toward `target`. */
export function kickBall(ball, target, power, curve) {
  computeShotVelocity(ball.mesh.position, target, power, curve, ball.velocity);
  ball.curve = curve;
  ball.bounced = false;
  ball.state = 'flight';
}

const _predictPos = new THREE.Vector3();
const _predictVel = new THREE.Vector3();

/**
 * Simulate the flight the ball would take if the shot were released right
 * now, writing sampled positions into the flat xyz array `out`. The sim
 * mirrors the real flight (gravity, curve, world scroll, bounces) and stops
 * once the ball has no forward momentum left, so the line's end shows the
 * shot's true range. Returns the number of points written (≤ `maxPoints`).
 */
export function predictShotPath(ball, target, power, curve, scrollSpeed, out, maxPoints) {
  const pos = _predictPos.copy(ball.mesh.position);
  const vel = computeShotVelocity(pos, target, power, curve, _predictVel);
  const dt = 1 / 30;
  let bounced = false;
  let count = 0;
  while (count < maxPoints) {
    out[count * 3] = pos.x;
    out[count * 3 + 1] = pos.y;
    out[count * 3 + 2] = pos.z;
    count++;

    vel.y -= GRAVITY * dt;
    if (!bounced) vel.x += curve * CURVE_ACCEL * dt;
    pos.addScaledVector(vel, dt);
    pos.z += scrollSpeed * dt;

    if (pos.y < BALL_RADIUS) {
      pos.y = BALL_RADIUS;
      if (vel.y < -MIN_BOUNCE_SPEED) {
        vel.y *= -BOUNCE_DAMPING;
        vel.x *= BOUNCE_SPEED_LOSS;
        vel.z *= BOUNCE_SPEED_LOSS;
        bounced = true;
      } else {
        vel.y = 0;
        bounced = true;
        const friction = Math.exp(-ROLL_FRICTION * dt);
        vel.x *= friction;
        vel.z *= friction;
      }
      // Grounded and no longer outrunning the world scroll: range reached
      if (vel.y === 0 && vel.z + scrollSpeed >= 0) break;
    }
  }
  return count;
}

/**
 * Per-frame ball update. `scrollDistance` is how far the pitch scrolled this
 * frame (the ball rides the world once kicked, and rolls against it while
 * dribbled). `playerX` is the runner's lateral position.
 */
export function updateBall(ball, dt, scrollDistance, playerX) {
  const m = ball.mesh;

  if (ball.state === 'dribble') {
    m.position.y = DRIBBLE_OFFSET.y;
    m.position.z = DRIBBLE_OFFSET.z;
    // Lag slightly behind the player's lateral moves so it feels pushed along
    m.position.x = THREE.MathUtils.damp(
      m.position.x,
      playerX + DRIBBLE_OFFSET.x,
      10,
      dt
    );
    m.rotation.x -= scrollDistance / BALL_RADIUS;
    return;
  }

  // --- Flight ---------------------------------------------------------------
  ball.velocity.y -= GRAVITY * dt;
  if (!ball.bounced) {
    ball.velocity.x += ball.curve * CURVE_ACCEL * dt;
  }
  m.position.addScaledVector(ball.velocity, dt);
  // The world scrolls toward the camera; a kicked ball scrolls with it
  m.position.z += scrollDistance;

  // Ground contact: a real bounce loses energy once; rolling just rubs
  // speed off gradually
  if (m.position.y < BALL_RADIUS) {
    m.position.y = BALL_RADIUS;
    if (ball.velocity.y < -MIN_BOUNCE_SPEED) {
      ball.velocity.y *= -BOUNCE_DAMPING;
      ball.velocity.x *= BOUNCE_SPEED_LOSS;
      ball.velocity.z *= BOUNCE_SPEED_LOSS;
      ball.bounced = true;
    } else {
      ball.velocity.y = 0;
      ball.bounced = true;
      const friction = Math.exp(-ROLL_FRICTION * dt);
      ball.velocity.x *= friction;
      ball.velocity.z *= friction;
    }
  }

  // Tumble roughly in proportion to how fast it's moving
  m.rotation.x -=
    (Math.hypot(ball.velocity.x, ball.velocity.z - scrollDistance / dt) /
      BALL_RADIUS) *
    dt *
    0.5;

  // Collect: the scroll brings the dead ball back — if it reaches the player
  // low and close, resume dribbling; if it slips past, hand them a fresh one
  if (
    m.position.z > DRIBBLE_OFFSET.z &&
    m.position.y < 1.2 &&
    Math.abs(m.position.x - playerX) < 1.4
  ) {
    ball.state = 'dribble';
    ball.velocity.set(0, 0, 0);
  } else if (m.position.z > 12) {
    ball.state = 'dribble';
    ball.velocity.set(0, 0, 0);
    m.position.set(playerX + DRIBBLE_OFFSET.x, DRIBBLE_OFFSET.y, DRIBBLE_OFFSET.z);
  }
}
