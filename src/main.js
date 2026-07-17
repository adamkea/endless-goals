import * as THREE from 'three';
import { createRunner, animateRunner } from './runner.js';
import { createPitch, updatePitch } from './pitch.js';
import {
  createBall,
  updateBall,
  kickBall,
  predictShotPath,
  BALL_RADIUS,
  DRIBBLE_OFFSET,
} from './ball.js';
import { ShootingControls } from './shooting.js';
import { Input } from './input.js';
import { createGoal, updateGoal, disposeGoal } from './goal.js';

// --- Tunables -------------------------------------------------------------
const RUN_SPEED = 12; // forward speed (world units / s) the pitch scrolls at
const LATERAL_SPEED = 8; // how fast the player moves sideways
const LATERAL_LIMIT = 6; // how far left/right the player can go
const LEAN_ANGLE = 0.35; // max sideways lean while strafing (radians)
const AIM_PLANE_Z = -45; // clicks aim at a vertical plane this far downfield
const KICK_DURATION = 0.35; // seconds of kick-leg animation after a shot
const RUN_RESUME_DELAY = 2; // seconds standing still after a shot is released

// --- Goal loop tunables ---------------------------------------------------
const GOAL_INTERVAL = 50; // distance run after a goal before the next spawns
const GOAL_SPAWN_Z = -110; // goals fade in from the fog this far downfield
const GOAL_ENGAGE_Z = -18; // goal distance at which the player is held to shoot
const GOAL_DESPAWN_Z = 18; // a passed goal is removed once this far behind
const RETRY_DELAY = 1.1; // seconds a dead shot lies around before a new ball
const BANNER_TIME = 2; // seconds the GOAL! banner stays up

// --- Renderer / scene -----------------------------------------------------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e5);
scene.fog = new THREE.Fog(0x87b5e5, 60, 140);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);

// --- Lights ---------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(15, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 80;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3a6b2a, 0.9));

// --- World ----------------------------------------------------------------
const pitch = createPitch();
scene.add(pitch.group);

const runner = createRunner();
runner.group.position.set(0, 0, 0);
scene.add(runner.group);

const ball = createBall();
scene.add(ball.mesh);

const input = new Input();
const shooting = new ShootingControls(
  renderer.domElement,
  () => ball.state === 'dribble'
);

// Aim reticle: a ring shown on the downfield aim plane while charging
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.8, 32),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthTest: false,
  })
);
reticle.visible = false;
scene.add(reticle);

// Aim line: dashed preview of the shot's flight from the ball to the cursor,
// bending with the curve and lengthening with power
const MAX_PATH_POINTS = 140;
const pathPositions = new Float32Array(MAX_PATH_POINTS * 3);
const pathGeometry = new THREE.BufferGeometry();
pathGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(pathPositions, 3)
);
const aimLine = new THREE.Line(
  pathGeometry,
  new THREE.LineDashedMaterial({
    color: 0xffffff,
    dashSize: 0.6,
    gapSize: 0.35,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  })
);
aimLine.frustumCulled = false;
aimLine.visible = false;
scene.add(aimLine);

const raycaster = new THREE.Raycaster();

// Clicks normally aim at a fixed downfield plane; during a shootout the
// plane snaps to the goal line so the reticle sits on the goal itself.
let aimPlaneZ = AIM_PLANE_Z;

/** Project a screen-space (NDC) click onto the current aim plane. */
function aimTarget(ndc, out) {
  raycaster.setFromCamera(ndc, camera);
  const { origin, direction } = raycaster.ray;
  let t = (aimPlaneZ - origin.z) / direction.z;
  if (!Number.isFinite(t) || t <= 0) t = -aimPlaneZ;
  out.copy(origin).addScaledVector(direction, t);
  out.x = THREE.MathUtils.clamp(out.x, -24, 24);
  out.y = THREE.MathUtils.clamp(out.y, BALL_RADIUS, 22);
  return out;
}

const aimPoint = new THREE.Vector3();
let kickTimer = 0;

// The player plants to shoot: speed winds down while charging, stays zero
// for a beat after the shot, then ramps back up to full sprint.
let runSpeed = RUN_SPEED;
let runResumeTimer = 0;
let stridePhase = 0;

// --- The goal loop ----------------------------------------------------------
// Run -> a goal (with keeper) scrolls in from the fog -> the player is held
// at the edge of the box until they beat the keeper -> the keeper drops, the
// run resumes through the goal mouth, and the next goal is queued by distance.
let gameState = 'run'; // 'run' | 'shootout'
let activeGoal = null;
let distanceSinceGoal = GOAL_INTERVAL * 0.6; // first goal arrives a bit sooner
let retryTimer = 0; // shootout only: time a spent shot has been dead
let goalsScored = 0;
let bannerTimer = 0;

const scoreEl = document.getElementById('score');
const bannerEl = document.getElementById('banner');

function showBanner(text, seconds) {
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  bannerTimer = seconds;
}

// --- Camera rig: third person, behind and above the runner -----------------
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7.5);
const LOOK_OFFSET = new THREE.Vector3(0, 1.5, -6);
camera.position.copy(runner.group.position).add(CAMERA_OFFSET);

// --- Main loop --------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Plant to shoot: stop quickly while charging or just after a shot,
  // accelerate back up to speed otherwise. A shootout holds the player at
  // the box until the keeper is beaten.
  runResumeTimer = Math.max(0, runResumeTimer - dt);
  const wantsToRun =
    gameState === 'run' && !shooting.charging && runResumeTimer <= 0;
  runSpeed = THREE.MathUtils.damp(
    runSpeed,
    wantsToRun ? RUN_SPEED : 0,
    wantsToRun ? 3 : 10,
    dt
  );
  const moveFactor = runSpeed / RUN_SPEED;

  // Lateral movement, planted while shooting
  const move = input.axis(); // -1 left, +1 right, 0 idle
  runner.group.position.x += move * LATERAL_SPEED * moveFactor * dt;
  runner.group.position.x = THREE.MathUtils.clamp(
    runner.group.position.x,
    -LATERAL_LIMIT,
    LATERAL_LIMIT
  );

  // Lean into the strafe for a bit of life
  runner.group.rotation.z = THREE.MathUtils.damp(
    runner.group.rotation.z,
    -move * LEAN_ANGLE * moveFactor,
    8,
    dt
  );

  // The runner stays near the origin; the world scrolls past to fake
  // endless forward motion.
  const scrollDistance = runSpeed * dt;
  updatePitch(pitch, scrollDistance);
  stridePhase += runSpeed * 0.9 * dt;
  animateRunner(runner, stridePhase, moveFactor);

  // --- Goal loop ------------------------------------------------------------
  if (activeGoal) {
    // The goal rides the scrolling world toward the player
    activeGoal.group.position.z += scrollDistance;

    // Reaching the edge of the box stops the run until a goal is scored
    if (
      gameState === 'run' &&
      !activeGoal.scored &&
      activeGoal.group.position.z >= GOAL_ENGAGE_Z
    ) {
      gameState = 'shootout';
      retryTimer = 0;
    }

    // A beaten goal scrolls off behind the camera and is recycled
    if (activeGoal.group.position.z > GOAL_DESPAWN_Z) {
      scene.remove(activeGoal.group);
      disposeGoal(activeGoal);
      activeGoal = null;
    }
  } else {
    // Queue the next goal by distance run
    distanceSinceGoal += scrollDistance;
    if (distanceSinceGoal >= GOAL_INTERVAL) {
      distanceSinceGoal = 0;
      activeGoal = createGoal(GOAL_SPAWN_Z);
      scene.add(activeGoal.group);
    }
  }

  // While held at the box, clicks aim straight at the goal plane
  const shootingAtGoal = gameState === 'shootout' && activeGoal;
  aimPlaneZ = shootingAtGoal ? activeGoal.group.position.z : AIM_PLANE_Z;

  // --- Shooting -------------------------------------------------------------
  shooting.update(dt);

  if (shooting.charging) {
    aimTarget(shooting.aimNdc, aimPoint);
    reticle.position.copy(aimPoint);
    reticle.visible = true;
    // Tighten the ring as power builds
    reticle.scale.setScalar(1.4 - shooting.power * 0.6);

    // Preview the flight the shot would take if released this instant
    const pointCount = predictShotPath(
      ball,
      aimPoint,
      shooting.power,
      shooting.curve,
      runSpeed,
      pathPositions,
      MAX_PATH_POINTS
    );
    pathGeometry.setDrawRange(0, pointCount);
    pathGeometry.attributes.position.needsUpdate = true;
    aimLine.computeLineDistances();
    aimLine.visible = true;
  } else {
    reticle.visible = false;
    aimLine.visible = false;
  }

  const shot = shooting.consumeShot();
  if (shot && ball.state === 'dribble') {
    kickBall(ball, aimTarget(shot.ndc, aimPoint), shot.power, shot.curve);
    kickTimer = KICK_DURATION;
    runResumeTimer = RUN_RESUME_DELAY;
  }

  const prevBallZ = ball.mesh.position.z;
  updateBall(ball, dt, scrollDistance, runner.group.position.x);

  // --- Resolve the shot against the goal ------------------------------------
  if (activeGoal) {
    const event = updateGoal(activeGoal, ball, dt, prevBallZ);
    if (event === 'goal') {
      goalsScored++;
      scoreEl.textContent = `⚽ ${goalsScored}`;
      showBanner('GOAL!', BANNER_TIME);
      // The keeper is beaten: release the run. He collapses and scrolls
      // away with the goal frame as the player carries on through it.
      gameState = 'run';
    } else if (event === 'save') {
      showBanner('SAVED!', 0.9);
    }
  }
  bannerTimer = Math.max(0, bannerTimer - dt);
  if (bannerTimer <= 0) bannerEl.classList.remove('show');

  // During a shootout the world is not scrolling, so a spent shot cannot
  // drift back to the player on its own — hand them a fresh ball instead.
  if (gameState === 'shootout' && ball.state === 'flight') {
    const grounded = ball.mesh.position.y <= BALL_RADIUS + 0.02;
    const stalled = grounded && ball.velocity.lengthSq() < 2;
    const gone =
      activeGoal &&
      ball.mesh.position.z < activeGoal.group.position.z - 1;
    if (stalled || gone || ball.flightTime > 6) {
      retryTimer += dt;
      if (retryTimer >= RETRY_DELAY) {
        ball.state = 'dribble';
        ball.velocity.set(0, 0, 0);
        ball.mesh.position
          .copy(DRIBBLE_OFFSET)
          .setX(runner.group.position.x + DRIBBLE_OFFSET.x);
      }
    } else {
      retryTimer = 0;
    }
  } else {
    retryTimer = 0;
  }

  // Kick animation overrides the run cycle on the striking leg
  if (kickTimer > 0) {
    kickTimer = Math.max(0, kickTimer - dt);
    const p = 1 - kickTimer / KICK_DURATION; // 0 -> 1 over the kick
    const swing = Math.sin(p * Math.PI); // forward and back through the ball
    runner.legs[1].rotation.x = -swing * 1.6;
    runner.knees[1].rotation.x = (1 - swing) * 0.9 + 0.15;
  }

  // Camera follows the runner's x with a little smoothing
  const targetX = runner.group.position.x * 0.6;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 4, dt);
  camera.position.y = CAMERA_OFFSET.y;
  camera.position.z = CAMERA_OFFSET.z;
  camera.lookAt(
    runner.group.position.x * 0.8 + LOOK_OFFSET.x,
    LOOK_OFFSET.y,
    LOOK_OFFSET.z
  );

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

tick();
