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
 * Launch the ball from its current position toward `target`.
 * `power` (0..1) sets the speed; `curve` (-1..1) bends the flight sideways.
 * The initial direction is pre-rotated against the curve so the ball swings
 * out and bends back in toward the aim point, like a real curled shot.
 */
export function kickBall(ball, target, power, curve) {
  const dir = target.clone().sub(ball.mesh.position).normalize();
  dir.applyAxisAngle(UP, -curve * 0.35);
  const speed = MIN_SHOT_SPEED + power * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
  ball.velocity.copy(dir).multiplyScalar(speed);
  ball.curve = curve;
  ball.bounced = false;
  ball.state = 'flight';
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

  // Ground bounce
  if (m.position.y < BALL_RADIUS) {
    m.position.y = BALL_RADIUS;
    if (ball.velocity.y < 0) {
      ball.velocity.y *= -BOUNCE_DAMPING;
      ball.velocity.x *= 0.8;
      ball.velocity.z *= 0.8;
      ball.bounced = true;
      if (Math.abs(ball.velocity.y) < 1.5) ball.velocity.y = 0;
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
