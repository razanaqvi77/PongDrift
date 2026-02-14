# Pong Drift

A fast-paced browser Pong variant built with TypeScript + Vite, featuring gravity wells, rotating match modifiers, impact VFX, adaptive audio, and XP-based cosmetic progression.

## Features

- Core Pong gameplay with mouse and keyboard controls.
- Gravity wells that bend ball trajectories (`G` to toggle).
- Rotating match modifiers:
  - `Curve Drift`: periodic vertical force curves the ball.
  - `Big Ball`: larger ball size for more chaotic rallies.
  - `Sticky Paddle`: brief contact hold before release.
  - `Ion Wind`: horizontal wind oscillation changes ball pace.
- Game-feel improvements:
  - Particle bursts on collisions and scoring.
  - Screen shake and score pulse.
  - Dynamic ball trails based on speed/rally.
  - Rally/speed camera zoom (kept subtle to avoid edge clipping).
- Progression loop:
  - Persistent XP + level via `localStorage`.
  - Cosmetic color themes unlocked by level.
  - Post-match summary with XP gain and unlocks.

## Controls

- `Mouse`: move player paddle.
- `W / S` or `Arrow Up / Arrow Down`: move player paddle.
- `G`: toggle gravity wells on/off.
- `Space`: start from splash / pause / resume.
- `Enter`: rematch from post-match screen.

## Getting Started

### Prerequisites

- Node.js 18+ (recommended latest LTS)
- npm 9+

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Project Structure

- `src/main.ts`: gameplay systems, rendering, modifiers, progression, UI hooks.
- `src/style.css`: HUD, controls panel, overlays, responsive styling.
- `index.html`: app entry shell.

## Notes

- XP/progression is saved in browser `localStorage` under `pongdrift_progress_v1`.
- Audio starts after first user interaction due browser autoplay rules.
