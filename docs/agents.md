# A toolkit agents can operate

Motion Forge works through files, deterministic sampling and structured diagnostics. An agent can create a scene, validate it, render independent snapshots and hand the same source to a human in Studio. No model provider is required by the package.

## CLI

```sh
motion-forge preset scout --output scout.forge.json
motion-forge validate scout.forge.json
motion-forge inspect scout.forge.json
motion-forge sample scout.forge.json --time 800
motion-forge render scout.forge.json --time 800 --output scout.svg
motion-forge preset signal --output signal.forge.json
motion-forge render signal.forge.json --inputs '{"intensity":90}' --output signal.svg
motion-forge schema --output document.schema.json
```

Use `-` as the document filename for stdin. Without `--output`, commands write to stdout. The CLI does not make network requests. `sample` and `render` accept `--time`, `--state`, and `--inputs`; input IDs and types are validated. Sampling does not run an event sequence.

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Document syntax, structure or semantic validation failed |
| 2 | Usage, option, file IO or command execution error |

Errors are JSON on stderr with `ok: false`, an `error` code and a message; document errors also contain path-based `issues`. Validate output contains `ok`, `version` and `name`. Inspect reports dimensions, nodes, clips, states, inputs, transitions and bindings. Sample returns `ok` and `frame`. Render returns SVG. Schema and preset commands return their corresponding JSON objects.

## A reliable edit loop

1. Read the document and inspect its IDs/state machine.
2. Make a small, intentional change; preserve unrelated fields.
3. Validate with the real parser, including semantic cross-references.
4. Sample start, middle, end and transition-sensitive points with independent expectations.
5. Render and visually inspect representative frames.
6. Open the same document in Studio and test the interaction.
7. Commit the editable source, not only an image.

The package includes `skills/motion-forge/SKILL.md` with this workflow. A schema alone cannot establish visual quality, usable timing, meaningful transitions, or accessibility. Use programmatic checks for behavior and actual browser review for the presentation.

## Deterministic event simulation

For eventful sequences, instantiate `ForgePlayer`, call `advance` with a fixed step, and use `send`/`setInput` at explicit times. Keep the sequence and step size in fixtures. Completion transitions occur on the host tick and do not carry overflow time; pure random-access sampling only samples one state.

## Security boundary

Treat user-supplied documents as data. Validate unknown JSON, do not execute strings, and never splice document fields into raw HTML. The built-in renderer creates only supported SVG nodes. Do not extend it with script, external-asset or arbitrary HTML support without designing a new security boundary.
