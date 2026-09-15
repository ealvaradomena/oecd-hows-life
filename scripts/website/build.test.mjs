import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { frozenFigurePaths, pageOrder, publicationQuartoConfig, requiredPublicationArtifacts, root } from './build.mjs';
import { derivePresentationAssets } from './derive-presentation-assets.mjs';
import { sha256Artifact } from './frozen-source.mjs';
import { legacyRedirects, writeLegacyRedirects } from './polish-html.mjs';

test('strict publication strips local hooks and forces canonical docs output', () => {
  const source = fs.readFileSync(path.join(root, '_quarto.yml'), 'utf8').replaceAll('\r\n', '\n');
  const staged = publicationQuartoConfig(source);
  assert.match(staged, /^  output-dir: docs$/m);
  assert.doesNotMatch(staged, /^  output-dir: _site$/m);
  assert.doesNotMatch(staged, /^\s*(?:pre-render|post-render):/m);
  assert.match(staged, /^  enabled: false$/m);
  assert.match(staged, /^  freeze: false$/m);
});

test('default publication requirements include caches, figures, and browser data', () => {
  const frozen = {
    pages: {
      'index.qmd': { cache: 'publication-baseline/index/execute-results/html.json' },
      'analysis/static.qmd': { bindings: [] },
    },
    artifacts: {
      'publication-baseline/index/execute-results/html.json': 'cache-hash',
      'publication-baseline/index/figure-html/fig-example-1.png': 'figure-hash',
      'outputs/local-only.csv': 'local-hash',
    },
  };
  assert.deepEqual(requiredPublicationArtifacts(frozen), [
    'assets/completion-rate.svg',
    'assets/logo-bg-1200x900.png',
    'assets/selected-series.json',
    'assets/series-data.json',
    'assets/series-inventory.json',
    'assets/twfe-audit.json',
    'assets/twfe-fwl.svg',
    'assets/twfe-model-progression.svg',
    'assets/twfe-period-coverage.svg',
    'publication-baseline/index/execute-results/html.json',
    'publication-baseline/index/figure-html/fig-example-1.png',
  ]);
});

test('missing local analytical inputs preserve the canonical TWFE audit', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'twfe-publication-'));
  try {
    fs.mkdirSync(path.join(fixture, 'assets'));
    const audit = {
      available: true,
      status_summary: [{ variable: 'Employment rate', status: 'A', observations: 1 }],
      areas: [{ code: 'AUS', label: 'Australia' }],
    };
    const output = path.join(fixture, 'assets', 'twfe-audit.json');
    fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);

    derivePresentationAssets({ root: fixture });

    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), audit);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('frozen manifest protects the canonical TWFE audit', () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(root, 'config/frozen-presentation.json')));
  assert.equal(
    frozen.artifacts['assets/twfe-audit.json'],
    '363e20f4a0def618035b4fe5b2d27a94c839a5de7e65f47d73c6cb8ab73d2fe5',
  );
});

test('active teaching pages use canonical 04, 05, and 06 identities', () => {
  const canonical = [
    'analysis/04-demographic-comparisons.qmd',
    'analysis/05-series-explorer.qmd',
    'analysis/06-twfe-analysis.qmd',
  ];
  const obsolete = [
    'analysis/05-demographic-comparisons.qmd',
    'analysis/09-series-explorer.qmd',
    'analysis/10-twfe-analysis.qmd',
  ];
  assert.ok(canonical.every(file => pageOrder.includes(file) && fs.existsSync(path.join(root, file))));
  assert.ok(obsolete.every(file => !pageOrder.includes(file) && !fs.existsSync(path.join(root, file))));
  const quarto = fs.readFileSync(path.join(root, '_quarto.yml'), 'utf8');
  assert.ok(canonical.every(file => quarto.includes(file)));
  assert.ok(obsolete.every(file => !quarto.includes(file)));
});

test('legacy teaching routes receive static redirects to canonical pages', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'teaching-redirects-'));
  try {
    writeLegacyRedirects(fixture);
    for (const [legacy, target] of legacyRedirects) {
      const html = fs.readFileSync(path.join(fixture, legacy), 'utf8');
      assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0; url=${target}">`));
      assert.match(html, new RegExp(`<link rel="canonical" href="${target}">`));
      assert.match(html, new RegExp(`<a href="${target}">`));
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('renamed frozen pages preserve reviewed hashes and TWFE supporting namespace', () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(root, 'config/frozen-presentation.json')));
  const demographic = frozen.pages['analysis/04-demographic-comparisons.qmd'];
  const twfe = frozen.pages['analysis/06-twfe-analysis.qmd'];
  assert.equal(demographic.cache, 'publication-baseline/analysis/04-demographic-comparisons/execute-results/html.json');
  assert.equal(twfe.cache, 'publication-baseline/analysis/06-twfe-analysis/execute-results/html.json');
  assert.equal(twfe.supportingFiles, '10-twfe-analysis_files');

  for (const entry of [demographic, twfe]) {
    const bytes = fs.readFileSync(path.join(root, entry.cache));
    assert.equal(sha256Artifact(entry.cache, bytes), entry.cacheSha256);
  }
  const twfeCache = fs.readFileSync(path.join(root, twfe.cache), 'utf8');
  assert.match(twfeCache, /10-twfe-analysis_files\/figure-html\/fig-period-coverage-1\.png/);

  const paths = frozenFigurePaths(root, 'stage', {
    file: 'analysis/06-twfe-analysis.qmd',
    cache: twfe.cache,
    supportingFiles: twfe.supportingFiles,
  });
  assert.equal(path.relative(root, paths.source).replaceAll('\\', '/'), 'publication-baseline/analysis/06-twfe-analysis/figure-html');
  assert.equal(paths.destination.replaceAll('\\', '/'), 'stage/analysis/10-twfe-analysis_files/figure-html');
  for (const [file, expected] of Object.entries(frozen.artifacts).filter(([file]) => file.startsWith('publication-baseline/analysis/06-twfe-analysis/'))) {
    assert.equal(sha256Artifact(file, fs.readFileSync(path.join(root, file))), expected);
  }
});

test('repository manifest keeps strict inputs outside Quarto freeze namespaces', () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(root, 'config/frozen-presentation.json')));
  const baselinePaths = [
    ...Object.values(frozen.pages).flatMap(entry => entry.cache ? [entry.cache] : []),
    ...Object.keys(frozen.artifacts).filter(file => /(?:execute-results|figure-html)/.test(file)),
  ];
  assert.ok(baselinePaths.length > 0);
  assert.ok(baselinePaths.every(file => file.startsWith('publication-baseline/')));
  assert.ok(baselinePaths.every(file => !file.startsWith('_freeze/') && !file.startsWith('.quarto/')));
});

test('manifest rewrite requires explicit re-baseline approval flag', () => {
  const result = spawnSync(process.execPath, ['.presentation-bootstrap.mjs'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /without explicit --rebaseline approval/);
});
