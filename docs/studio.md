# Your local studio

Studio edits the same document that the runtime and CLI consume. It runs in your browser and requires no account. Start with Scout, Made it, Signal, an empty document, or a supported SVG.

## Create and arrange

Use the six shape buttons to add a rectangle, ellipse, text, path star, line, or group. Select a layer in the layer list or on the canvas. Drag on the artboard to move it. For exact values, use the Design inspector; number/text changes commit on Enter or blur.

The layer list shows frontmost siblings first. Bring forward/send backward changes drawing order. Duplicate copies a subtree, its animation channels and its bindings. Delete removes descendants and their tracks/bindings. Parent selection creates hierarchy; invalid cycles are rejected. Visibility and locks apply to groups and their descendants.

Fit returns the artboard to the available canvas size. Plus/minus adjusts zoom. On phones, the canvas, layers and inspector stack vertically; the timeline scrolls horizontally.

## Animate a property

1. Select a layer and set its starting pose.
2. Choose a property next to **Add key** and add a key at time zero.
3. Move the playhead using the seek control or timeline lane.
4. Change the animated property in the inspector or drag the layer.
5. Play the result; select a diamond to edit its time, value and outgoing easing.

Once a property has a track in the current clip, edits insert or update its key at the playhead. Auto-key also creates tracks for previously static properties. A single key holds its value for the entire clip; add a second key to create motion. Input bindings override their properties during preview.

Custom cubic easing exposes all four control points. Custom spring easing exposes stiffness, damping and mass. The curve preview reflects the actual evaluator. Keyframe times must stay unique and within the clip. Deleting the last key removes its track.

## Add behavior

In **Interact → States**, create a state with its own clip, rename it, choose its animation, set duration and looping, or make it initial. Clips with later keys cannot be shortened past their final key without first moving/removing those keys.

Add transitions driven by an event, input condition, or clip completion. Set a blend duration and preview event transitions directly. Document order determines priority. States are selected directly for authoring; events preview the state machine.

In **Inputs**, create numeric or boolean values. Preview controls change runtime values without changing saved defaults. Edit defaults/ranges in the expandable input form. Bind a numeric input to a property on the selected layer, then edit the output range. Deleting an input also removes its conditions and bindings.

## Save and recover

Studio autosaves a recovery document to localStorage under its configured key. A successful save appears in the top bar. Recovery is local to this browser/profile/origin; clearing browser data removes it. Export JSON as your durable copy before clearing data, changing browsers, or replacing a document.

**New**, opening a file, or choosing an example replaces the active document and resets undo history. Export work you want to keep first. A rejected file or failed edit leaves the current document intact. Storage failures are visible; do not assume a recovery copy exists when the status reports an error.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Space | Play/pause when focus is on the canvas or editor, outside a form control |
| Arrow keys | Nudge selected unlocked layer 1 pixel |
| Shift + arrows | Nudge 10 pixels |
| ⌘/Ctrl Z | Undo |
| ⌘/Ctrl Shift Z | Redo |
| ⌘/Ctrl D | Duplicate selection |
| Delete / Backspace | Delete selection outside form controls |
| Escape | Clear selection |
| ⌘/Ctrl S | Export editable JSON |

Buttons remain keyboard-operable with native Enter/Space behavior. Import/export details are in the [interchange guide](./interchange.md).
