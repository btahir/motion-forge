# Motion with consideration

Animation can communicate and delight, but essential information should not depend on movement, color alone, or precise timing.

## Reduced motion

`MotionForge` defaults to `reducedMotion="respect"`. When the browser requests reduced motion, the player pauses at the current clip's final pose. Input bindings still respond. `always` forces this behavior; `never` opts out and should be a deliberate product decision.

SSR initially renders the start pose because the server does not know the browser preference. The client applies the preference after mount. Avoid designs where that one-frame difference hides critical information. Studio uses explicit playback controls for authoring rather than automatically playing the canvas.

## Accessible content and controls

Give the player a meaningful `title`, or use `aria-hidden="true"` for purely decorative graphics alongside equivalent content. Keep buttons and inputs outside the graphic as native HTML controls. The built-in SVG exposes an image role and namespaced title ID. Do not use an animated success check as the only announcement of a completed action; provide text or an application live region.

Studio exposes labeled form fields and keyboard controls. The canvas supports arrow-key nudging once a layer is selected. Timeline keys are focusable buttons with property/time labels. Native scrolling keeps longer timelines and panels reachable on smaller screens.

## Review checklist

Test with reduced motion enabled, keyboard only, magnification and your target screen reader. Check text contrast, focus visibility, status announcements and disabled controls. Automated checks cover a subset of accessibility: a passing axe result is not a certification or proof of screen-reader usability.

Keep loops gentle. Provide pause controls when animation is long-running or distracting. Avoid flashing effects and rapid high-contrast changes. Application authors remain responsible for how their scenes and controls are presented.
