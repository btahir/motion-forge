# Troubleshooting

## The animation does not move

A track needs at least two different key values to show motion. Check the active state/clip, autoplay, reduced-motion preference, and whether the player is visible. The pure `ForgePlayer` requires calls to `advance`. A numeric input binding overrides its property even when a timeline channel exists.

## My React player restarts

Keep `document` identity stable. Build it outside the component or with `useMemo`. A new document identity intentionally creates a new player. Changing callbacks does not require replacing the document.

## An event does nothing

Check the event name, current state, transition source/target and document ordering. Transitions to the current state are skipped. Conditions are evaluated when their matching input is set. Completion transitions only fire from non-looping states.

## Validation fails

Read `DocumentError.issues` or CLI stderr. Check the exact path. Common causes: duplicate IDs, missing parent/state/clip references, out-of-order or duplicate keyframe times, values beyond property ranges, conflicting tracks, a boolean condition with a numeric operator, or a numeric input default outside its range.

## My import was rejected

SVG is a large format. Read the path-based diagnostics and simplify unsupported features to basic vector paths/shapes before importing. Scripts, masks, arbitrary transforms, external resources and stylesheets are outside the supported subset. Rejection preserves the current document. See [interchange](./interchange.md).

## The color text field rejected a value

Use supported hex colors, `none`, or a document-local gradient reference. Arbitrary CSS colors and external URLs are not accepted. The color picker emits six-digit hex. Eight-digit hex uses RGBA ordering.

## Local recovery is unavailable

Browser storage can be disabled, full or cleared. The editor reports save failures. Export JSON as a portable backup. Recovery is scoped to origin, profile and storage key; development, preview and deployed sites do not share it. A malformed stored document must not be silently overwritten.

## The editor styles are missing

Import `motion-forge/studio.css` once in the authoring route. The React player intentionally does not import it. For SSR frameworks, place interactive player/editor usage behind the framework's client-component boundary.

## The package or local site does not resolve

For this unpublished checkout, run `pnpm build:package` before starting or typechecking the site. Verify the packed artifact before publishing. Site production builds require the root workspace, not only `apps/site`, because package and documentation sources live at the root.
