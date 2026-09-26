# Motion Forge

Build the full product described in `PRODUCT.md`. Keep answers concise. Read `STATUS.md` before resuming work and update it with verified progress and concrete remaining work.

- One versioned document is shared by core, React, Studio, CLI, and examples. No editor-only animation semantics.
- Pure core must run without browser globals. Untrusted documents must be validated before use. Render only allowlisted vector nodes and properties.
- Preserve user work. Check Git state before committing. Do not publish or deploy as part of local verification.
- UI controls must do real work. No placeholder buttons, fabricated usage claims, fake testimonials, or unsupported compatibility claims.
- Use independent expectations, failure fixtures, and browser journeys. Test outputs are evidence only for the behavior they actually exercise.
- Review desktop and mobile visually. Check keyboard and reduced motion. Keep the runtime separate from the editor bundle.
- Run targeted checks after each change, then the documented release gates. Remove disposable captures/build reports and stop servers started for verification; retain source assets and permanent tests.
- Never mark the goal complete while any release requirement in `PRODUCT.md` is missing or unverified.
