# Motion Forge showcase

45-second, 1920 × 1080, 30 fps silent product demonstration made with HyperFrames. Explanatory text is part of the video.

The video shows original Motion Forge artwork rendered by the actual package, followed by real Studio editing and export. It then demonstrates a confirmation event and a numeric input driving vector properties.

## Files

- `index.html` and `compositions/frames/`: editable HyperFrames timeline and scenes.
- `BRIEF.md`, `STORYBOARD.md`, `frame.md`: creative intent, timing and visual system.
- `assets/`: original engine renders and Studio recording; event logs and the exported edited document preserve the demonstrated inputs.
- `scripts/capture.mjs`: recaptures the actual product at a fixed frame rate.
- `renders/motion-forge-launch.mp4`: finished showcase.
- `renders/motion-forge-preview.gif`: full-length animated README preview linked to the MP4.

## Rebuild

Requires Node 22+, FFmpeg and Chromium. From the repository root, install dependencies and build the package with `pnpm install --frozen-lockfile` and `pnpm build:package`.

The committed assets are sufficient to rerender without running the app. From this directory:

```sh
npm run check
npm run render -- --quality delivery --fps 30 --output renders/motion-forge-launch.mp4
```

To refresh source recordings, start `pnpm dev` from the repository root, then run `node videos/motion-forge/scripts/capture.mjs` there. `STUDIO_URL` optionally overrides `http://127.0.0.1:4176/studio/`. Close the server when finished.

Scene 1 is 0–14 seconds, Scene 2 is 14–29 seconds, and Scene 3 is 29–45 seconds. The footage is deliberately unstretched. Text and event labels follow the captured action times.

## Provenance

Product art and recordings are original to this MIT-licensed repository. Simple text entrance and closing motion are adapted from HyperFrames `grid-card-assemble` and `cta-close` registry components (Apache-2.0, HeyGen; license included in THIRD_PARTY_HYPERFRAMES_LICENSE.txt). No external photographs, music, voices, customer data or credentials are included. HyperFrames is used to author and render the showcase; it is not a Motion Forge runtime dependency.

To regenerate the GIF, poster and contact sheet after rendering, run `node scripts/preview-assets.mjs`. Run `node scripts/verify.mjs` to inspect metadata, detect black intervals, compare motion in decoded product regions and verify the recorded Studio export. Results are saved to `VERIFICATION.json`.

The checked CLI pin is 0.8.73. A suggested 0.8.78 update was rejected by the local npm release-age policy and reverted before verification.
