# Maintenance contract

## Frozen presentation

For ordinary local website maintenance, run:

```sh
quarto render
```

The project-level pre-render hook calls `scripts/website/derive-presentation-assets.R`. That script reads existing local artifacts and writes only browser-facing JSON under `assets/` for OECD observation-status displays, the TWFE audit/sample list, and retrieval provenance. It makes no network requests, does not run the numbered analytical pipeline, and does not fit models. When Quarto invokes the hook for an incremental/preview render, the script exits immediately unless `QUARTO_PROJECT_RENDER_ALL=1`; direct manual `Rscript` invocation still runs normally.

Ordinary presentation execution is not frozen: `_quarto.yml` uses `execute.freeze: false` so a full render always reflects current `.qmd` source. The executed page chunks read existing analytical artifacts but do not recreate them, download data, or fit models. If a required local input is absent, rendering fails clearly or the presentation-asset step emits an explicit unavailable state instead of recreating analytical data.

The Node builder remains the stricter publication/CI path. `node scripts/website/build.mjs` verifies frozen source bindings and artifact hashes, derives the same presentation assets, stages Markdown-only pages, validates the rendered site, and publishes to `docs/`. Node is therefore optional for ordinary local rendering but still required by the current GitHub Actions workflow.

After an explicit `quarto render`, use `quarto preview` to inspect the site. `_quarto.yml` configures preview with an external static server (`scripts/website/static-preview.ts`) rooted at `docs/`, disables source watching, and therefore keeps browser navigation out of Quarto's incremental-render path. The server runs through `quarto run` and Quarto's bundled Deno runtime; Node and Python are not required. Source edits are picked up by running `quarto render` again.

### Quarto rendering behavior

The historical `_freeze/` tree remains a reviewed input to the strict Node publication builder and a reproducibility record. Because ordinary full renders use `execute.freeze: false`, this tree does not control their visible output.

Do not edit `_freeze/`, data, model summaries, or JSON merely to pass checks. Investigate integrity failures. A future authorized analysis requires a reviewed new baseline; the frozen manifest must not refresh automatically.

### Legacy maintenance helpers

Two top-level JavaScript utilities are retained as one-time migration/provenance helpers rather than active render steps:

- `.presentation-bootstrap.mjs` bootstraps `config/frozen-presentation.json` from source, `_freeze/`, data, and outputs; it writes the manifest and therefore is not a read-only check.
- `.presentation-edits.mjs` records an earlier batch of presentation edits. It is not invoked by `_quarto.yml` or the current GitHub Actions workflow and should not be rerun against the current source tree without a deliberate review of every replacement.

Likewise, `scripts/website/ensure-iconify.ts` is not part of the current Quarto pre-render list. The project-local Iconify extension is already versioned under `_extensions/mcanouil/iconify/`; the strict Node builder checks for that local extension rather than installing it during rendering.

## Presentation conventions

- One site-wide figure sequence and one table sequence; unique identifiers.
- Captions precede each object in semantic HTML and visual layout.
- A metric panel is one figure with eight labeled components.
- Series-page numbers stay fixed across query-string selections.
- Preserve empty-result messages and their caption containers.
- Detail tables identify truncation to the first up to 20 records.
- Use native cross-references where prose identifies a display.
- Reuse frozen plot bytes; describe axes and encodings in alt text.

## Boundaries

Reusable R code and numbered scripts remain in place. JSON remains in `assets/` to preserve producer/consumer paths. Historical `old/` directories may remain adjacent to their active source directories, and an `archive/` directory may also be used for local backups. These paths are maintenance history, are ignored by Git under the current repository policy, and are not active website inputs. Historical freeze caches remain intact and are not active website pages.

Dataflow version `1.1`, tolerance `1e-10`, employment measure `2_1`, and threshold `0.70` are unchanged. Changing their locations, sample selection, or missingness logic is analytical work.

## Footer provenance

The live AlvaradoCSS stylesheet was inspected on 2026-09-10: `.site-legal-footer` uses background `rgb(40, 40, 34)` (`#282822`), white text, and accent `#f0b39f`. Source: https://alvaradocss.com/styles.css. It corresponds to this project's copyright/site footer. The separate contact section uses burgundy `#871548` and is not the matching element.

## Checks

Local baseline: `quarto render`, then `quarto preview`, then inspect the rendered pages and interactive controls. The preview server is static; rerun `quarto render` after source edits.

Optional strict checks (when Node is available): `node --test scripts/website/*.test.mjs`, `node scripts/website/build.mjs --check`, and `node scripts/website/build.mjs --check --verify-all`.

Static checks cover object IDs, unique numbers, caption order, image descriptions, and local file/fragment references. Browser checks remain necessary for responsive layout, dynamic widgets, and keyboard behavior; static validation is not a screen-reader audit.
