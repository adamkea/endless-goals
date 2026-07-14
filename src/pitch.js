import * as THREE from 'three';

// The runner stays near the origin; these ground segments scroll toward the
// camera and hop back to the far end when they pass behind it, so the pitch
// looks endless.

const SEGMENT_LENGTH = 20;
const SEGMENT_COUNT = 10;
const PITCH_WIDTH = 18;
const GRASS_A = 0x3f9b3f;
const GRASS_B = 0x358a35;
const LINE_COLOR = 0xffffff;

function createSegment(index) {
  const segment = new THREE.Group();

  // Alternate two grass tones for the classic mown-stripes look
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_WIDTH, SEGMENT_LENGTH),
    new THREE.MeshStandardMaterial({
      color: index % 2 === 0 ? GRASS_A : GRASS_B,
      roughness: 1,
    })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  segment.add(grass);

  // A white line across the pitch at each segment boundary sells the speed
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_WIDTH, 0.15),
    new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 1 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.01, -SEGMENT_LENGTH / 2);
  segment.add(line);

  // Sidelines
  for (const side of [-1, 1]) {
    const sideline = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, SEGMENT_LENGTH),
      new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 1 })
    );
    sideline.rotation.x = -Math.PI / 2;
    sideline.position.set(side * (PITCH_WIDTH / 2 - 0.5), 0.01, 0);
    segment.add(sideline);
  }

  return segment;
}

export function createPitch() {
  const group = new THREE.Group();
  const segments = [];

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const segment = createSegment(i);
    segment.position.z = -i * SEGMENT_LENGTH + SEGMENT_LENGTH;
    group.add(segment);
    segments.push(segment);
  }

  // Flat ground plane outside the pitch so the horizon isn't a void
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  surround.receiveShadow = true;
  group.add(surround);

  return { group, segments };
}

export function updatePitch(pitch, distance) {
  const total = SEGMENT_LENGTH * SEGMENT_COUNT;
  for (const segment of pitch.segments) {
    segment.position.z += distance;
    // Once a segment is fully behind the camera, recycle it to the far end
    if (segment.position.z > SEGMENT_LENGTH * 1.5) {
      segment.position.z -= total;
    }
  }
}
