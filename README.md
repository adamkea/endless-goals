# Endless Goals

An endless 3D runner football game mockup built with [three.js](https://threejs.org/).

## Current state

- Low-poly footballer built from primitives with a procedural run cycle
- Third-person camera following from behind
- Endless scrolling pitch (recycled ground segments)
- Controls: **← / →** or **A / D** to move left/right

## Running

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Structure

- `src/main.js` — scene setup, camera rig, game loop, lateral movement
- `src/runner.js` — the character model and run-cycle animation
- `src/pitch.js` — scrolling/recycling pitch segments
- `src/input.js` — keyboard input (left/right only for now)
