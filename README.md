# Endless Goals

An endless 3D runner football game mockup built with [three.js](https://threejs.org/).

## Current state

- Low-poly footballer built from primitives with a procedural run cycle
- Third-person camera following from behind
- Endless scrolling pitch (recycled ground segments)
- Ball dribbled at the player's feet while running
- Click-and-hold shooting: the aim follows the cursor (shown as a ring),
  holding charges the power meter, dragging sideways bends the shot, and
  releasing fires it — the spent ball rolls back and is collected into the
  dribble
- While holding, a dashed line traces the shot's predicted flight to the
  cursor — its length shows the range (growing with power) and its bend
  shows the curve
- Controls: **← / →** or **A / D** to move left/right; **mouse** to shoot

## Running

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Structure

- `src/main.js` — scene setup, camera rig, game loop, lateral movement, shot firing
- `src/runner.js` — the character model and run-cycle animation
- `src/pitch.js` — scrolling/recycling pitch segments
- `src/ball.js` — the ball: dribble state and kicked-flight physics (gravity, curve, bounces)
- `src/shooting.js` — click/hold/drag/release shot controls and the power/curve HUD
- `src/input.js` — keyboard input (left/right only for now)
