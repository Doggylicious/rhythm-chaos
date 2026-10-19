# Rhythm Chaos v0.1

A minimal browser rhythm prototype. It generates an original synthesized 100 BPM groove and evaluates taps against the planned beat clock.

## Requirements
- Node.js 20 or newer (Node 18.18+ should also work with recent Vite releases)

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173).

## Build
```bash
npm run build
npm run preview
```

## Current prototype notes
- This first version uses an original synthesized groove, not a commercial song.
- The timing reference uses the Web Audio API clock.
- A tap is scored against the nearest beat within a 220 ms window; repeated taps on the same beat are ignored.
- Browser, audio-device, and output latency still affect perceived synchronization. Calibration and external-track support are future steps.
