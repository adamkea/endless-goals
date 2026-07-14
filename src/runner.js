import * as THREE from 'three';

// A simple low-poly footballer built from primitives, with limb pivots we
// can swing for a procedural run cycle. Good enough as a stand-in until a
// real rigged model replaces it.

const SKIN = 0xd9a066;
const SHIRT = 0xd7263d;
const SHORTS = 0xffffff;
const SOCKS = 0xd7263d;
const BOOTS = 0x222222;
const HAIR = 0x3b2b1b;

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  mesh.castShadow = true;
  return mesh;
}

/**
 * Builds a limb whose pivot sits at the top (shoulder/hip) so rotating the
 * returned group swings the whole limb naturally.
 */
function limb(upper, lower, jointY) {
  const pivot = new THREE.Group();
  pivot.add(upper);
  const knee = new THREE.Group();
  knee.position.y = jointY;
  knee.add(lower);
  pivot.add(knee);
  return { pivot, joint: knee };
}

export function createRunner() {
  const group = new THREE.Group();

  // Torso
  const torso = box(0.7, 0.85, 0.4, SHIRT);
  torso.position.y = 1.35;
  group.add(torso);

  // Hips / shorts
  const hips = box(0.65, 0.3, 0.38, SHORTS);
  hips.position.y = 0.85;
  group.add(hips);

  // Head
  const head = box(0.42, 0.42, 0.42, SKIN);
  head.position.y = 2.0;
  group.add(head);
  const hair = box(0.46, 0.16, 0.46, HAIR);
  hair.position.y = 2.22;
  group.add(hair);

  // Arms — pivot at the shoulder
  const arms = [];
  for (const side of [-1, 1]) {
    const upperArm = box(0.2, 0.42, 0.2, SHIRT);
    upperArm.position.y = -0.21;
    const forearm = box(0.18, 0.4, 0.18, SKIN);
    forearm.position.y = -0.2;
    const { pivot, joint } = limb(upperArm, forearm, -0.42);
    pivot.position.set(side * 0.45, 1.7, 0);
    // Arms run slightly bent
    joint.rotation.x = -0.9;
    group.add(pivot);
    arms.push(pivot);
  }

  // Legs — pivot at the hip, knee joint halfway down
  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const thigh = box(0.24, 0.45, 0.24, SKIN);
    thigh.position.y = -0.225;
    const shin = new THREE.Group();
    const sock = box(0.2, 0.35, 0.2, SOCKS);
    sock.position.y = -0.175;
    const boot = box(0.22, 0.12, 0.34, BOOTS);
    boot.position.set(0, -0.4, -0.05);
    shin.add(sock, boot);
    const { pivot, joint } = limb(thigh, shin, -0.45);
    pivot.position.set(side * 0.18, 0.85, 0);
    group.add(pivot);
    legs.push(pivot);
    knees.push(joint);
  }

  // Face the runner away from the camera (down -z, the direction of travel)
  group.rotation.y = Math.PI;

  return { group, torso, head, arms, legs, knees };
}

/**
 * Procedural run cycle: opposite arm/leg swing plus a little bounce.
 * `speed` scales the stride frequency so it stays in step with the ground.
 */
export function animateRunner(runner, time, speed) {
  const stride = time * speed * 0.9;
  const swing = Math.sin(stride);

  runner.legs[0].rotation.x = swing * 0.9;
  runner.legs[1].rotation.x = -swing * 0.9;
  // Knees bend more on the back-swing
  runner.knees[0].rotation.x = Math.max(0, -swing) * 1.4 + 0.15;
  runner.knees[1].rotation.x = Math.max(0, swing) * 1.4 + 0.15;

  runner.arms[0].rotation.x = -swing * 0.8;
  runner.arms[1].rotation.x = swing * 0.8;

  // Bounce twice per stride and lean slightly forward into the run
  runner.group.position.y = Math.abs(Math.sin(stride)) * 0.12;
  runner.group.rotation.x = 0.12;
}
