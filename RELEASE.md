# Release checklist

Local readiness and public release are separate. Nothing in this checklist authorizes publishing automatically.

## Local gates

- [x] Audit every required surface in PRODUCT.md against actual behavior and current tests.
- [x] `pnpm check` succeeds from a clean install; all TypeScript declarations build.
- [x] Browser journeys pass on desktop/phone, including actual JSON/SVG/PNG output inspection, keyboard, inputs/states, rejected imports and recovery.
- [x] Visually inspect home, examples, docs and Studio; review reduced motion and accessibility output.
- [x] `pnpm verify:package` installs the packed artifact into an isolated consumer and verifies ESM/CJS/TypeScript/React/Studio/CSS/CLI examples.
- [x] `pnpm verify:site` checks rendered routes, docs text, relative links, metadata, agent files and site assets.
- [x] Run the reproducible performance check; record conditions and measurements without universal claims.
- [x] Audit production dependencies, packed files, licenses, secrets/private paths and runtime/editor separation.
- [x] Stop verification servers and delete disposable outputs. Preserve editable source and permanent assets.

## Before public GitHub/npm release

- Choose and verify final repository owner/name and npm package ownership; previous availability checks do not reserve a name or establish trademark rights.
- Set real repository, bugs and homepage metadata in package.json. Do not publish placeholder URLs.
- Enable private vulnerability reporting; update SECURITY.md with the working channel. Enable discussions if desired.
- Decide sponsorship/donation destination only when there is a real, verified account; no payment integration is required.
- Review README, changelog and docs for final release status. Synchronize versions in package metadata and CLI.
- Commit reviewed source, tag the version, inspect the final tarball and publish using maintainer credentials. Use npm trusted publishing/provenance where configured and supported.
- Verify the actual registry artifact, install it in a fresh project, and check license/types/bin/exports. Record publication separately from local tests.

## Before deployment

Follow DEPLOYMENT.md. Set the real production SITE_URL, run static checks, then deploy only when authorized. Verify the deployed routes/assets/metadata and indexing configuration. Indexing, distribution, adoption, donations and revenue remain unvalidated until observed.
