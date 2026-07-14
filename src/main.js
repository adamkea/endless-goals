import * as THREE from 'three';
import { createRunner, animateRunner } from './runner.js';
import { createPitch, updatePitch } from './pitch.js';
import {
  createBall,
  updateBall,
  kickBall,
  predictShotPath,
  BALL_RADIUS,
} from './ball.js';
import { ShootingControls } from './shooting.js';
import { Input } from './input.js';

// --- Tunables -------------------------------------------------------------
const RUN_SPEED = 12; // forward speed (world units / s) the pitch scrolls at
const LATERAL_SPEED = 8; // how fast the player moves sideways
const LATERAL_LIMIT = 6; // how far left/right the player can go
const LEAN_ANGLE = 0.35; // max sideways lean while strafing (radians)
const AIM_PLANE_Z = -45; // clicks aim at a vertical plane this far downfield
const KICK_DURATION = 0.35; // seconds of kick-leg animation after a shot
const RUN_RESUME_DELAY = 2; // seconds standing still after a shot is released

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
const MAX_PATH_POINTS = 96;
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

/** Project a screen-space (NDC) click onto the downfield aim plane. */
function aimTarget(ndc, out) {
  raycaster.setFromCamera(ndc, camera);
  const { origin, direction } = raycaster.ray;
  let t = (AIM_PLANE_Z - origin.z) / direction.z;
  if (!Number.isFinite(t) || t <= 0) t = -AIM_PLANE_Z;
  out.copy(origin).addScaledVector(direction, t);
  out.x = THREE.MathUtils.clamp(out.x, -24, 24);
  out.y = THREE.MathUtils.clamp(out.y, BALL_RADIUS, 14);
  return out;
}

const aimPoint = new THREE.Vector3();
let kickTimer = 0;

// The player plants to shoot: speed winds down while charging, stays zero
// for a beat after the shot, then ramps back up to full sprint.
let runSpeed = RUN_SPEED;
let runResumeTimer = 0;
let stridePhase = 0;

// --- Camera rig: third person, behind and above the runner -----------------
const CAMERA_OFFSET = new THREE.Vector3(0, 4.2, 7.5);
const LOOK_OFFSET = new THREE.Vector3(0, 1.5, -6);
camera.position.copy(runner.group.position).add(CAMERA_OFFSET);

// --- Main loop --------------------------------------------------------------
const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Plant to shoot: stop quickly while charging or just after a shot,
  // accelerate back up to speed otherwise
  runResumeTimer = Math.max(0, runResumeTimer - dt);
  const wantsToRun = !shooting.charging && runResumeTimer <= 0;
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

  updateBall(ball, dt, scrollDistance, runner.group.position.x);

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
