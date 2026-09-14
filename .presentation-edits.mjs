// Historical one-time presentation migration helper retained for provenance.
// The replacements below describe an earlier source state and are not part of
// the current Quarto or strict publication workflow. Do not rerun this file
// against the current repository without reviewing every replacement first.
import fs from 'node:fs';
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')));
edit('index.qmd', s => s
  .replace('The analytical pages on this website read processed local artifacts created by `scripts/00-run-all.R`; they do not make API calls during rendering.', 'This website presents frozen local results. The presentation-only build reuses cached tables, figures, and inline values without executing R or contacting the OECD API. Interactive displays read local JSON snapshots; their existing browser-side summaries do not refresh the source data.')
  .replace('The GitHub repository does not include the source data files because the project retrieves them programmatically from the OECD API.\n\nRaw downloads are excluded from version control to keep the repository lightweight and ensure that the data lineage remains transparent and reproducible.', 'Raw OECD downloads are excluded from version control to keep the repository lightweight. Exact reproduction requires preserving the original snapshots: a later API request can return revised observations even when the dataflow version is unchanged.')
  .replace('```text\nOECD SDMX API', '::: {#fig-project-workflow}\n```text\nOECD SDMX API')
  .replace('Dataflow comparisons\n    ↓\nQuarto website\n```', 'Dataflow comparisons + website JSON\n    ↓\nTWFE feasibility → matched sample → models → FWL transformation\n    ↓\nFrozen presentation build → Quarto website\n```\n\nProject workflow from OECD retrieval to frozen analytical results and website publication.\n:::')
  .replace(/Run the setup script once,[\s\S]*$/, '### View or render frozen results\n\nThe published website is already rendered. To rebuild its presentation locally, retain `_freeze/`, both `assets/series-*.json` files, and `config/frozen-presentation.json`, then run from the project root:\n\n```sh\nnode scripts/website/build.mjs\n```\n\nThis command refuses missing or changed frozen assets. It does not execute the analytical pipeline.\n\n### Recompute the analysis later\n\nRecomputation is a separate, deliberate operation. The ordered R pipeline can download OECD data and overwrite analytical artifacts. See the [project README](https://github.com/ealvaradomena/oecd-hows-life#reproducing-the-analysis-later) for its execution order, environment requirements, and preservation rules.\n'));
edit('analysis/01-api-and-structure.qmd', s => s
  .replace('(a.k.a., *Current well-being*)', '(of which *Current well-being* is one of six datasets)')
  .replace('The project pins version `1.1` for all six dataflows so that an unnoticed future structural revision cannot silently change an analysis.', 'The project pins dataflow version `1.1` for all six registered dataflows. This fixes the requested structural version, not the observation snapshot: OECD may revise values within that version. Exact reproduction requires the saved raw responses and structural metadata.'));
edit('analysis/10-twfe-analysis.qmd', s => s
  .replace('The core sample contains `r preferred$observations` observations across `r preferred$n_units` countries and `r preferred$n_periods` periods.', 'The core input sample contains 220 observations across `r preferred$n_units` countries and `r preferred$n_periods` periods. The preferred TWFE model uses `r preferred$observations` observations; fitted-model observation counts differ across specifications.')
  .replace('Y_{it} = \\beta X_{it} + \\varepsilon_{it}.', 'Y_{it} = \\alpha + \\beta X_{it} + \\varepsilon_{it}.')
  .replace('#| tbl-cap: "Employment-rate coefficient across specifications."', '#| tbl-cap: "Employment-rate coefficient across specifications. N is the fitted-model observation count; Countries and Periods describe the input sample, not independently verified model-retained coverage."')
  .replace('#| fig-cap: "Estimated employment coefficient and 95% confidence interval across specifications."', '#| fig-cap: "Estimated employment coefficients with approximate 95% normal intervals (estimate ± 1.96 country-clustered standard errors) across specifications."')
  .replace('subtraction of unit means, time means, and the grand mean', 'subtraction of unit and time means followed by addition of the grand mean'));
edit('analysis/series.qmd', s => s
  .replace('<div id="series-definition">', '<div id="series-definition-content">')
  .replace('<div id="series-metrics"></div>', '::: {#fig-series-characteristics}\n<div id="series-metrics"></div>\n\nPanel characteristics of the selected statistical series.\n:::')
  .replace('Use the missingness matrix below', 'Use the missingness matrix in @fig-series-missingness'));
edit('assets/series-detail.js', s => s.replace('getElementById("series-definition")', 'getElementById("series-definition-content")'));
// Alt text is display metadata only; numerical arrays and plotting code are untouched.
const alt = {
  'fig-completion-rate': 'Histogram of completion rates across Current well-being series. The horizontal axis is the observed share of the reference-area–period grid; the vertical axis counts series.',
  'fig-panelview-example': 'Reference-area by period matrix showing observed and missing cells for the series identified in the selected-series table.',
  'fig-period-coverage': 'Bars show the share of matched-sample countries represented in each period. A dashed horizontal line marks the 70 percent core-period rule.',
  'fig-model-progression': 'Coefficient estimates and normal-approximation intervals for pooled OLS, country fixed effects, and two-way fixed effects, shown for core and full samples.',
  'fig-fwl': 'Scatterplot of life-satisfaction residuals against employment-rate residuals after country and period adjustment. The reference line has the frozen TWFE slope.'
};
for (const f of ['analysis/03-panel-structure.qmd', 'analysis/10-twfe-analysis.qmd']) edit(f, s => s.replace(/^#\| label: (fig-[\w-]+)$/gm, (line, id) => `${line}\n#| fig-alt: "${alt[id]}"`));
edit('_quarto.yml', s => s
  .replace('    - "!analysis/04-balancedness.qmd"\n    - "!analysis/11-country-coverage.qmd"\n', '')
  .replace('    - "assets/**"', '    - "assets/*.js"\n    - "assets/*.json"')
  .replace('    code-tools: true', '    code-tools: true\n    fig-cap-location: top\n    tbl-cap-location: top')
  .replace('  freeze: auto', '  # Use scripts/website/build.mjs for presentation changes; direct R renders are not the safe path.\n  freeze: true'));
edit('DESCRIPTION', s => s.replace('    janitor,', '    janitor,\n    jsonlite,').replace('    tidyr,', '    tidyr,\n    xml2,'));
edit('.gitignore', s => s.replace('\n/.quarto/\n', '\n').replace('assets/*.json', '# Required frozen website snapshots are versioned; do not ignore assets/*.json.') + '\n# Disposable presentation build staging and preserved local backups\n.presentation-build/\narchive/\n');
