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
  dribble. Aiming above the horizon lofts the ball; with enough power it
  flies top-corner high and beyond
- While holding, a dashed line traces the shot's predicted flight to the
  cursor — its length shows the range (growing with power) and its bend
  shows the curve
- The player plants to shoot: running winds down while charging and only
  resumes 2 seconds after the ball is struck
- The goal loop: every stretch of pitch, a goal (frame, net, penalty box,
  goalkeeper) scrolls in from the fog. Reaching the edge of the box holds
  the player there for a shootout — the keeper mirrors the ball and lunges
  at shots, parrying what he reaches (a spent shot is replaced after a
  moment). Beat him and he collapses into the net: the score ticks up, the
  run resumes through the goal mouth, and the next goal is queued by
  distance. Long-range goals scored on the run skip the stop entirely
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
- `src/goal.js` — goal frame/net/box, the goalkeeper (AI + animation), and save/goal resolution
- `src/ball.js` — the ball: dribble state and kicked-flight physics (gravity, curve, bounces)
- `src/shooting.js` — click/hold/drag/release shot controls and the power/curve HUD
- `src/input.js` — keyboard input (left/right only for now)
