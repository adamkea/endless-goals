import * as THREE from 'three';

// A goal that scrolls in from downfield every so often: white frame, a net
// with a canvas-grid texture, penalty-box lines painted on the grass, and a
// goalkeeper guarding the line. The keeper shuffles to mirror the ball while
// the player dribbles, lunges at shots with a capped speed (so pace and
// placement beat him), parries what he reaches, and collapses backwards into
// the net when beaten. Everything lives in one group so the whole scene
// scrolls past — and despawns — together.

export const GOAL_WIDTH = 10;
export const GOAL_HEIGHT = 3.2;
const POST_RADIUS = 0.14;
const NET_DEPTH = 2.4;
const BOX_WIDTH = 15;
const BOX_DEPTH = 16;
const LINE_WIDTH = 0.15;
const LINE_COLOR = 0xffffff;

const KEEPER_Z = 0.9; // how far off his line the keeper stands
const KEEPER_REACH = 1.1; // lateral distance he can get a glove to
const KEEPER_TOP_REACH = 2.55; // shots above this clear him
const KEEPER_IDLE_SPEED = 3.5; // shuffle speed mirroring the dribble
const KEEPER_DIVE_SPEED = 4.5; // reaction speed once the shot is away
const KEEPER_PATROL = GOAL_WIDTH / 2 - 0.8; // how wide he will chase

const KEEPER_SHIRT = 0xf2c522;
const KEEPER_SHORTS = 0x1a1a1a;
const SKIN = 0xd9a066;
const GLOVES = 0xeeeeee;

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.castShadow = true;
  return mesh;
}

// One net texture shared by every goal the run spawns
let netTexture = null;
function getNetTexture() {
  if (netTexture) return netTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  netTexture = new THREE.CanvasTexture(canvas);
  netTexture.wrapS = netTexture.wrapT = THREE.RepeatWrapping;
  return netTexture;
}

function netPanel(width, height, repeatX, repeatY) {
  const texture = getNetTexture().clone();
  texture.needsUpdate = true;
  texture.repeat.set(repeatX, repeatY);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  return mesh;
}

function groundLine(width, depth, x, z) {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 1 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.012, z);
  return line;
}

function post(length) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, length, 12),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 })
  );
  mesh.castShadow = true;
  return mesh;
}

function createKeeper() {
  const group = new THREE.Group();

  const torso = box(0.7, 0.85, 0.4, KEEPER_SHIRT);
  torso.position.y = 1.35;
  group.add(torso);

  const hips = box(0.65, 0.3, 0.38, KEEPER_SHORTS);
  hips.position.y = 0.85;
  group.add(hips);

  const head = box(0.42, 0.42, 0.42, SKIN);
  head.position.y = 2.0;
  group.add(head);

  // Arms hang from the shoulder and spread wide in the ready stance
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const upperArm = box(0.2, 0.42, 0.2, KEEPER_SHIRT);
    upperArm.position.y = -0.21;
    const forearm = box(0.18, 0.4, 0.18, SKIN);
    forearm.position.y = -0.62;
    const glove = box(0.22, 0.2, 0.22, GLOVES);
    glove.position.y = -0.9;
    pivot.add(upperArm, forearm, glove);
    pivot.position.set(side * 0.45, 1.7, 0);
    group.add(pivot);
    arms.push(pivot);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const thigh = box(0.24, 0.45, 0.24, KEEPER_SHORTS);
    thigh.position.y = -0.225;
    const shin = box(0.2, 0.35, 0.2, KEEPER_SHIRT);
    shin.position.y = -0.62;
    const boot = box(0.22, 0.12, 0.34, 0x222222);
    boot.position.set(0, -0.85, 0.05);
    pivot.add(thigh, shin, boot);
    pivot.position.set(side * 0.18, 0.85, 0);
    group.add(pivot);
    legs.push(pivot);
  }

  // Faces +z, toward the approaching player
  return { group, arms, legs };
}

/** Build a goal (frame, net, box lines, keeper) at world z. */
export function createGoal(z) {
  const group = new THREE.Group();
  group.position.z = z;

  for (const side of [-1, 1]) {
    const upright = post(GOAL_HEIGHT);
    upright.position.set(side * (GOAL_WIDTH / 2), GOAL_HEIGHT / 2, 0);
    group.add(upright);
  }
  const crossbar = post(GOAL_WIDTH + POST_RADIUS * 2);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, GOAL_HEIGHT, 0);
  group.add(crossbar);

  // Net: back wall, two sides, and a roof sloping down to the back
  const back = netPanel(GOAL_WIDTH, GOAL_HEIGHT, 10, 4);
  back.position.set(0, GOAL_HEIGHT / 2, -NET_DEPTH);
  group.add(back);
  for (const side of [-1, 1]) {
    const panel = netPanel(NET_DEPTH, GOAL_HEIGHT, 3, 4);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(side * (GOAL_WIDTH / 2), GOAL_HEIGHT / 2, -NET_DEPTH / 2);
    group.add(panel);
  }
  const roof = netPanel(GOAL_WIDTH, NET_DEPTH, 10, 3);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, GOAL_HEIGHT, -NET_DEPTH / 2);
  group.add(roof);

  // Goal line plus the penalty box painted in front
  group.add(groundLine(BOX_WIDTH, LINE_WIDTH, 0, 0));
  group.add(groundLine(BOX_WIDTH, LINE_WIDTH, 0, BOX_DEPTH));
  for (const side of [-1, 1]) {
    group.add(
      groundLine(LINE_WIDTH, BOX_DEPTH, side * (BOX_WIDTH / 2), BOX_DEPTH / 2)
    );
  }

  const keeper = createKeeper();
  keeper.group.position.z = KEEPER_Z;
  group.add(keeper.group);

  return {
    group,
    keeper,
    scored: false,
    bobPhase: Math.random() * Math.PI * 2,
    diveSide: 0,
    diveTimer: 0,
    fall: 0, // 0 -> 1 collapse once beaten
  };
}

/** Ready stance with a nervous bob; lunge lean while a shot is incoming. */
function animateKeeper(goal, dt) {
  const k = goal.keeper;
  const bob = Math.sin(goal.bobPhase) * 0.05;
  k.group.position.y = bob * 0.5;
  for (const [i, side] of [-1, 1].entries()) {
    k.arms[i].rotation.z = side * (1.05 + bob);
    k.legs[i].rotation.x = 0.12;
  }
  goal.diveTimer = Math.max(0, goal.diveTimer - dt);
  const lunge = goal.diveTimer > 0 ? 1 : 0;
  k.group.rotation.z = THREE.MathUtils.damp(
    k.group.rotation.z,
    -goal.diveSide * lunge * 0.9,
    10,
    dt
  );
}

/** Beaten: topple backwards into the net and stay down. */
function animateBeatenKeeper(goal, dt) {
  goal.fall = Math.min(1, goal.fall + dt * 2);
  const k = goal.keeper.group;
  k.rotation.z = THREE.MathUtils.damp(k.rotation.z, 0, 6, dt);
  k.rotation.x = (-Math.PI / 2) * THREE.MathUtils.smoothstep(goal.fall, 0, 1);
  for (const arm of goal.keeper.arms) {
    arm.rotation.z *= 1 - dt * 4; // arms flop back to his sides
  }
}

/**
 * Per-frame goal logic: keeper AI plus shot resolution. `prevBallZ` is the
 * ball's world z before this frame's physics step, so a fast ball can't
 * tunnel through the line between frames. Returns 'goal', 'save', or null.
 */
export function updateGoal(goal, ball, dt, prevBallZ) {
  const lineZ = goal.group.position.z;
  const keeper = goal.keeper;

  if (goal.scored) {
    animateBeatenKeeper(goal, dt);
    // The net soaks up the shot: hold the ball inside the goal mouth. The
    // clamp is against the goal's own (scrolling) frame, so once the run
    // resumes the ball rides back toward the player with the net.
    if (ball.state === 'flight') {
      const backZ = lineZ - NET_DEPTH + 0.4;
      if (ball.mesh.position.z < backZ) {
        ball.mesh.position.z = backZ;
        ball.velocity.z = Math.max(0, ball.velocity.z);
        ball.velocity.x *= 0.5;
      }
    }
    return null;
  }

  // --- Keeper AI ------------------------------------------------------------
  // Mirror the ball, but with limited feet: once the shot is away he can
  // move faster, yet a well-placed corner still gets there first.
  goal.bobPhase += dt * (ball.state === 'flight' ? 11 : 5);
  const targetX = THREE.MathUtils.clamp(
    ball.mesh.position.x,
    -KEEPER_PATROL,
    KEEPER_PATROL
  );
  const speed =
    ball.state === 'flight' ? KEEPER_DIVE_SPEED : KEEPER_IDLE_SPEED;
  const dx = targetX - keeper.group.position.x;
  keeper.group.position.x += THREE.MathUtils.clamp(
    dx,
    -speed * dt,
    speed * dt
  );
  animateKeeper(goal, dt);

  if (ball.state !== 'flight') return null;
  const ballPos = ball.mesh.position;

  // --- Save: the ball crosses the keeper's plane within his reach -----------
  const saveZ = lineZ + KEEPER_Z;
  if (prevBallZ > saveZ && ballPos.z <= saveZ) {
    const reachX = ballPos.x - keeper.group.position.x;
    if (Math.abs(reachX) < KEEPER_REACH && ballPos.y < KEEPER_TOP_REACH) {
      // Parried: punched up and out, back toward the player
      const side = Math.sign(reachX) || (Math.random() < 0.5 ? -1 : 1);
      ball.velocity.z = Math.abs(ball.velocity.z) * 0.35;
      ball.velocity.x = side * 4;
      ball.velocity.y = Math.max(ball.velocity.y, 3.5);
      ballPos.z = saveZ + 0.01;
      goal.diveSide = side;
      goal.diveTimer = 0.5;
      return 'save';
    }
    // Beaten for pace or placement — sell the dive anyway
    goal.diveSide = Math.sign(reachX) || 1;
    goal.diveTimer = 0.5;
  }

  // --- Goal: the ball crosses the line inside the frame ---------------------
  if (prevBallZ > lineZ && ballPos.z <= lineZ) {
    if (
      Math.abs(ballPos.x) < GOAL_WIDTH / 2 - POST_RADIUS &&
      ballPos.y < GOAL_HEIGHT - POST_RADIUS
    ) {
      goal.scored = true;
      ball.velocity.multiplyScalar(0.3); // the net takes the sting out
      return 'goal';
    }
  }
  return null;
}

/** Free GPU resources once the goal has scrolled off behind the camera. */
export function disposeGoal(goal) {
  goal.group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map && obj.material.map !== netTexture) {
        obj.material.map.dispose();
      }
      obj.material.dispose();
    }
  });
}
