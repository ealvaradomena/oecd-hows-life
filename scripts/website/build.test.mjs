import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicationQuartoConfig, requiredPublicationArtifacts, root } from './build.mjs';

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
    'assets/twfe-fwl.svg',
    'assets/twfe-model-progression.svg',
    'assets/twfe-period-coverage.svg',
    'publication-baseline/index/execute-results/html.json',
    'publication-baseline/index/figure-html/fig-example-1.png',
  ]);
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
