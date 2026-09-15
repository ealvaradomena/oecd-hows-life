# Exploring the OECD *How’s Life?* database

README file created with generative AI for exceptional documentation depth.  
See: https://github.com/ealvaradomena/my-prompts/tree/main/prompts/readme-builder

An R and Quarto teaching project for working reproducibly with OECD well-being data. The site demonstrates the OECD SDMX API, inventories the six *How’s Life?* dataflows used by the project, examines reference-area–time panel structure, compares demographic dissemination views, explores analytical series, and develops a two-way fixed-effects teaching example relating employment and life satisfaction.

> **Maintenance rule:** the analytical results used by the website are frozen. Routine website work must not refresh OECD data, rerun the analytical pipeline, refit models, or overwrite analytical artifacts.

## Quick start

| Task | Command | What it does |
|---|---|---|
| Rebuild the local website | `quarto render` | Renders the active pages and locally derived presentation assets into ignored `_site/`; tracked `docs/` and `assets/` remain publication-owned |
| Inspect the rendered site | `quarto preview` | Serves the already-rendered `_site/` tree through the project's static preview configuration |
| Run strict frozen-input checks | `node scripts/website/build.mjs --check` | Optional read-only validation of the frozen presentation contract; no R or OECD API calls |
| Verify the complete local snapshot | `node scripts/website/build.mjs --check --verify-all` | Stronger optional validation requiring every recorded local artifact |
| Recompute the analysis later | In an R session: `source("scripts/00-run-all.R")` | **Separate, destructive analytical operation** that may download missing OECD inputs and overwrite generated results |
| Restore R dependencies | `renv::restore()` | Restores the package environment recorded by `renv.lock` |

Run commands from the project root. The lockfile currently records **R 4.5.2**. Ordinary rendering requires Quarto and the R packages restored from `renv.lock`; the project-local Quarto extensions under `_extensions/` are part of the reproducible website source. Node **22** is the project's currently validated runtime for static preview and matches the GitHub Actions publication runtime. Node is also required for the strict frozen-presentation builder, whose coded minimum is Node **20+**. The strict builder and CI currently use Quarto **1.8.25**.

## What the website renders

The active render allow-list lives in `_quarto.yml` and currently contains:

- `index.qmd`
- `analysis/01-api-and-structure.qmd`
- `analysis/02-database-inventory.qmd`
- `analysis/03-panel-structure.qmd`
- `analysis/04-demographic-comparisons.qmd`
- `analysis/05-series-explorer.qmd`
- `analysis/06-twfe-analysis.qmd`
- `analysis/series.qmd`

The allow-list is deliberate: archival QMD files elsewhere in a local working directory are not automatically promoted into the publication.

Reader-facing R code is folded by default and exposed through a **▶ Code** disclosure where the code is useful for teaching, reproducibility, or understanding the computation. Setup chunks and internal plumbing remain hidden.

## Project architecture

The repository deliberately separates **analysis**, **local presentation**, and **strict publication**. These are related workflows, not consecutive stages of one pipeline.

```text
ANALYSIS
OECD API + config/
    → R/ + scripts/01–10
    → data/ + outputs/
    → local analytical artifacts

LOCAL PRESENTATION
QMD + existing analytical artifacts + tracked assets/
    → quarto render
    → presentation-only derivation and polishing
    → ignored _site/
    → local presentation derivatives under _site/assets/

STRICT PUBLICATION
QMD + publication-baseline/ + tracked publication inputs
    → scripts/website/build.mjs
    → verify config/frozen-presentation.json
    → stage reviewed computational results
    → Quarto --no-execute
    → validate and polish
    → canonical docs/
    → GitHub Pages
```

The practical distinction is:

- **Recompute** changes or regenerates analytical results through the numbered R pipeline.
- **Render** constructs the disposable local website from current source and existing analytical state.
- **Publish** constructs the canonical website from reviewed frozen computational state without rerunning the analytical pipeline.

`quarto render` is therefore a website-development command, not an analytical-pipeline command. It may perform presentation-only computations needed to construct the local site, but it does not run `scripts/01-*` through `scripts/10-*` or refresh OECD source data.

The project uses the following ownership vocabulary throughout its maintenance documentation:

| Term | Meaning |
|---|---|
| **Analytical artifacts** | Results and working state produced by the analytical pipeline, primarily under `data/` and `outputs/` |
| **Tracked presentation assets** | Canonical browser-facing inputs under root `assets/` |
| **Local presentation derivatives** | Render-time derivatives under `_site/assets/` |
| **Publication baseline** | Reviewed QMD computational presentation results under `publication-baseline/` |
| **Frozen publication contract** | `config/frozen-presentation.json`, which binds active pages to reviewed computations, required artifacts, and integrity hashes |
| **Local website** | `_site/`, disposable ordinary Quarto output ignored by Git |
| **Canonical publication** | `docs/`, generated and validated by the strict publication process and served by GitHub Pages |

| Location | Role |
|---|---|
| `R/` | Reusable project functions for OECD access, SDMX metadata, panel diagnostics, comparisons, and econometric transformations |
| `scripts/00-*.R`–`scripts/10-*.R` | Ordered analytical pipeline; not part of routine website maintenance |
| `scripts/website/` | Presentation-only derivation, workflow-diagram generation, rendered-site polishing, preview support, and strict frozen-input validation/publication |
| `config/dataflows.yml` | OECD agency/dataflow registry and versions |
| `config/analysis.yml` | Analytical settings such as panel dimensions and total-category codes |
| `config/frozen-presentation.json` | Frozen publication contract used by the strict path |
| `publication-baseline/` | Reviewed, Git-tracked computational presentation results consumed by the strict publication path |
| `.quarto/_freeze/` | Quarto-owned, ignored working cache; never an approved publication baseline |
| `data/raw/`, `data/metadata/`, `data/processed/` | Local analytical data and metadata; ignored by Git |
| `outputs/` | Local analytical tables, diagnostics, model inputs/results, and other analytical artifacts; ignored by Git |
| `assets/` | Tracked presentation assets required by the browser or strict publication, including JavaScript, JSON snapshots, and SVGs |
| `diagrams/project-workflow.tex` | Authoritative TikZ source for the workflow diagram |
| `_extensions/` | Project-local Quarto extensions required for reproducible rendering |
| `index.qmd`, `analysis/*.qmd` | Authoritative website prose and reader-facing R display code |
| `styles.css` | Shared site palette, typography, component, table, figure, and responsive styles |
| `docs/` | Canonical generated GitHub Pages publication; intentionally version-controlled by the publication workflow |
| `_site/` | Disposable ordinary Quarto render/preview output; ignored by Git |
| `PROJECT_NOTES.md` | Maintainer-facing implementation details, ownership rules, edge cases, and presentation conventions |
| `.presentation-build/` | Disposable strict-publication staging; ignored by Git |
| `**/old/`, `archive/` (when present) | Local historical/PatchMyMess backups; ignored by Git and not part of the active workflow |

## Setup and environment

The repository uses `renv.lock` as the dependency record for R. From an R session opened at the project root, restore the recorded package environment with:

```r
renv::restore()
```

The project `.Rprofile` explicitly sources `renv/activate.R` after disabling renv's automatic autoloader path for this working environment. That startup behavior is deliberate and separate from the lockfile itself. If the local `renv/` bootstrap files are unavailable, restore them before expecting project startup to match the documented environment.

For ordinary website work, install Quarto and use `quarto render`. Node is not required for rendering itself. To use the project's static `quarto preview` configuration, use Node **22**, the currently validated preview and CI runtime. The strict builder/tests also require Node; the builder's coded minimum is Node **20+**.

## Frozen website maintenance

A full `quarto render` is a **local presentation rebuild**, not an analytical refresh. The project runs four website hooks around the active QMD pages:

1. `scripts/website/build-workflow-diagram.ts` fingerprints the TikZ source and both Node/Deno generator implementations, recompiling tracked `assets/project-workflow.svg` only for a genuine deterministic source change.
2. After Quarto creates `_site/`, `scripts/website/derive-presentation-assets.R` writes browser-facing status/audit/provenance JSON into `_site/assets/` from already-existing local artifacts.
3. `scripts/website/derive-visual-assets.ts` writes locally derived presentation SVGs into `_site/assets/`.
4. `scripts/website/polish-rendered.ts` applies site-wide Table/Figure numbering and final presentation transformations within `_site/`.

The local hooks require Quarto's explicit output-directory environment and reject canonical `docs/` as a destination. They never copy locally derived analytical state back into tracked root `assets/`.

The active QMD chunks read existing local artifacts. They do not call the OECD API or invoke the numbered analytical pipeline. If a required local frozen input is absent, do not substitute an API refresh merely to make a presentation edit work.

After a full render, use `quarto preview` to inspect the local site. `_quarto.yml` configures preview as a static server rooted at `_site/`, with input watching and incremental navigation disabled. This avoids accidental page execution while navigating the rendered site.

The browser-side interactive components read local JSON/SVG/JavaScript assets. Sorting, filtering, coverage summaries, trajectory displays, observation-status views, and other interactions are presentation behavior; they do not write analytical artifacts or contact OECD.

The workflow diagram is a committed reproducible output. Its expected content fingerprint is stored in `assets/project-workflow.sha256`; timestamps are ignored. Both ordinary Quarto rendering and the strict Node/CI builder skip TeX when the fingerprint matches. If the source or either generator changes, a machine with `pdflatex` and `dvisvgm` must regenerate and commit both the SVG and fingerprint. A stale diagram fails closed when those tools are unavailable, preventing CI from publishing an outdated asset.

## Strict frozen-presentation path

The Node path is intended for strict validation/publication, not routine local rendering. It is optional for local website maintenance but required by `.github/workflows/publish.yml`. The strict builder checks `config/frozen-presentation.json`, reads the reviewed caches and figures in `publication-baseline/`, and consumes the approved, committed presentation SVGs under `assets/`. It does not regenerate those SVGs from ignored analytical outputs or rerun the R analytical pipeline. Every artifact needed by the default CI build must exist, match its recorded SHA-256 hash, and be tracked by Git.

These directories deliberately have different ownership:

- `.quarto/_freeze/` is Quarto-managed, ignored working state. It may be refreshed as part of local rendering and is not trusted by CI.
- `publication-baseline/` is the project-managed, Git-tracked analytical publication baseline. Ordinary Quarto hooks do not synchronize or modify it.
- `config/frozen-presentation.json` binds QMD computations to that reviewed baseline and records integrity hashes.
- `docs/` is generated publication output, not an input baseline.
- `_site/` is ignored local output and is never an input to strict publication.

Root `/_freeze/` is also ignored because Quarto reserves and manages that namespace. A deliberate analytical re-baseline requires review of candidate outputs, copying only the approved bytes into `publication-baseline/`, and then explicitly running `node .presentation-bootstrap.mjs --rebaseline`. The guard makes accidental manifest refreshes fail. Never add this utility to ordinary render hooks or CI publication.

## Validation and tests

The repository includes Node tests for the frozen-source substitution contract and static validation in the strict builder. The documented checks are:

```bash
node --test scripts/website/*.test.mjs
node scripts/website/build.mjs --check
node scripts/website/build.mjs --check --verify-all
node scripts/website/build.mjs --check --require-tracked
```

`--check` verifies the required frozen bindings and artifacts without rendering. `--verify-all` additionally requires every artifact recorded in the integrity manifest. `--require-tracked`, used by CI, also rejects a baseline whose required caches, figures, or browser-data assets are not tracked by Git. Browser inspection remains necessary for responsive layout, interactive behavior, and keyboard/focus behavior.

## Recomputing the analysis later

Recomputation is intentionally separate from website maintenance and can overwrite generated results. Do not run it for prose, CSS, caption, JavaScript, or layout edits.

The canonical analytical order is encoded in `scripts/00-run-all.R`:

| Stage | Purpose | Typical effects |
|---|---|---|
| 01 | Download SDMX structures | Writes local metadata/XML; OECD calls for missing inputs |
| 02 | Download data | Writes local OECD CSV responses |
| 03 | Clean data | Writes processed datasets and labels |
| 04 | Diagnose panels | Writes panel inventories/diagnostics |
| 05 | Compare dataflows | Writes demographic comparison outputs |
| 06 | Build summary assets | Writes analytical website-support assets |
| 07 | Assess TWFE feasibility | Writes candidate diagnostics |
| 08 | Build estimation sample | Writes matched sample/coverage summaries |
| 09 | Fit TWFE models | Estimates models and writes summaries |
| 10 | Build TWFE transformation | Writes residualized/FWL verification outputs |

Downloads default to the behavior implemented in the project scripts; downstream analytical stages can still overwrite outputs even when raw downloads are reused. Preserve the complete local analytical snapshot before any authorized recomputation.

The TWFE material is a teaching demonstration and is interpreted associationally, not causally. Project-specific series IDs and selection rules are part of the browser/data contract and should not be changed casually.

## Data provenance and public-repository policy

The public repository intentionally separates **source/presentation code** from **locally retained OECD data and analytical outputs**.

Do **not** commit:

- `data/raw/` OECD API responses;
- `data/metadata/` downloaded SDMX structure files;
- `data/processed/` generated analytical datasets;
- `data/retrieval-manifest.csv` when generated locally from downloads;
- `outputs/` or `output/` analytical artifacts;
- credentials, `.env`/`.Renviron` files, local caches, PatchMyMess `old/` backups, or presentation staging files.

The website does intentionally version the browser-facing assets required for the frozen publication (for example `assets/*.json` and generated presentation SVGs), project-local Quarto extensions, and the generated `docs/` publication used by the GitHub Pages workflow.

`.gitignore` prevents *new untracked* local data from being added, but it does not remove files already present in Git's index. If data/output paths were committed previously, untrack them with `git rm --cached` while keeping the local copies; see the repository-hygiene commands supplied with the relevant cleanup patch.

## Publication

The canonical publication output is `docs/`. The strict builder strips ordinary hooks and explicitly changes its isolated staged configuration from local `_site/` output to `docs/`; it never consumes `_site/`. The current GitHub Actions workflow runs that builder on `main`, force-adds `docs/`, and commits/pushes the rendered publication back to the repository. Do not add `docs/` to `.gitignore` while this publication model remains active.

For routine website changes:

```bash
quarto render
quarto preview
```

Inspect the rendered pages in `_site/`, then commit only authoritative source changes and any deliberately regenerated deterministic source assets. Canonical `docs/` is produced by the strict publication workflow.

## Documentation and reuse

- `PROJECT_NOTES.md` records maintenance boundaries and presentation conventions that are too implementation-specific for the main README.
- The website source itself (`index.qmd` and `analysis/*.qmd`) contains the project’s methodological explanations and OECD citations.
- No `LICENSE` file is present in the supplied repository inventory. Public visibility alone does not establish reuse terms; do not infer a software or data license that the repository does not declare.

## Additional notes

- The OECD public SDMX endpoint does not require an API key for the project's documented downloads.
- The project does not use an analytical Python pipeline or paid AI runtime dependency.
- Existing AI-assistance provenance belongs in the project documentation/script headers where already recorded; prompt links are provenance, not runtime dependencies.
- See `PROJECT_NOTES.md` for additional presentation conventions and maintenance details.
