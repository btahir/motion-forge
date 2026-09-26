# A little more alive.

Motion Forge is an open-source toolkit for interactive vector animation: a visual Studio, a clock-driven engine, React components, and a local CLI. All four use the same editable JSON document. There is no required account, server, model API, or upload.

## Install

```sh
npm install motion-forge
```

This repository is being prepared for its first release. The command above applies after publication. To try the current source locally, use Node 22 or 24, enable pnpm, then run:

```sh
pnpm install
pnpm build:package
pnpm dev
```

The site runs at `http://127.0.0.1:4176`. Open `/studio/` for the editor. Building the package first creates the exports used by the site.

## Play an animation in React

```tsx
import { MotionForge } from 'motion-forge/react';
import { createPreset } from 'motion-forge/presets';

const animation = createPreset('scout');

export default function Welcome() {
  return <MotionForge
    document={animation}
    title="A friendly explorer waving hello"
    style={{ width: '100%', maxWidth: 480 }}
  />;
}
```

Keep the document identity stable; creating it inside each render restarts the player. The React entrypoint includes no Studio UI or stylesheet. React and React DOM are peer dependencies for React/Studio consumers; the core and CLI work without them.

## Make it interactive

```tsx
import { useRef } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
import { createPreset } from 'motion-forge/presets';

const scout = createPreset('scout');

export function SayHello() {
  const player = useRef<MotionForgeHandle>(null);
  return <>
    <MotionForge ref={player} document={scout} />
    <button onClick={() => player.current?.send('wave')}>Say hello</button>
  </>;
}
```

`scout` has an idle state, a waving state, and a `wave` event. `made-it` responds to `confirm` and `reset`. `signal` exposes a numeric `intensity` input from 0 to 100.

## Embed the editor

```tsx
import { ForgeStudio } from 'motion-forge/studio';
import 'motion-forge/studio.css';

export default function Editor() {
  return <ForgeStudio storageKey="my-product:animation:v1" />;
}
```

Use a unique storage key per workspace, or `storageKey={false}` to disable recovery. For application persistence, supply `onChange`. The editor is a separate entrypoint; load it only on authoring screens.

## Work without React

```js
import { ForgePlayer, renderSVG } from 'motion-forge';
import { createPreset } from 'motion-forge/presets';

const document = createPreset('scout');
const player = new ForgePlayer(document, { autoplay: true });
player.advance(800);
const svg = renderSVG(document, { frame: player.getSnapshot().frame });
player.dispose();
```

The core does not create a timer. Your host supplies elapsed milliseconds. Read the [API reference](./api.md), [document format](./format.md), or [Studio guide](./studio.md) next.
