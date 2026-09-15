// Explicit frozen-publication re-baseline utility retained for provenance.
// Reads reviewed source/cache/data/output state and writes the manifest; it is
// never part of ordinary Quarto rendering or the GitHub Actions publication path.
import fs from 'node:fs';
import { normalize, tokens, signature, metadata, sha256Artifact } from './scripts/website/frozen-source.mjs';
if (!process.argv.includes('--rebaseline')) {
  throw new Error('Refusing to rewrite the frozen manifest without explicit --rebaseline approval.');
}
const pages = ['index.qmd', ...fs.readdirSync('analysis').filter(x => x.endsWith('.qmd')).sort().map(x => `analysis/${x}`)];
const manifest = { version: 1, pages: {}, artifacts: {} };
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
for (const page of pages) {
  const source = normalize(fs.readFileSync(page, 'utf8'));
  const found = tokens(source);
  if (!found.length) { manifest.pages[page] = { bindings: [] }; continue; }
  const cache = `publication-baseline/${page.replace(/\.qmd$/, '')}/execute-results/html.json`;
  const bytes = fs.readFileSync(cache);
  const markdown = normalize(JSON.parse(bytes).result.markdown);
  let pos = 0, pattern = '^';
  for (const token of found) {
    pattern += escape(source.slice(pos, token.index)) + '([\\s\\S]*?)';
    pos = token.index + token[0].length;
  }
  pattern += escape(source.slice(pos)) + '$';
  const match = new RegExp(pattern, 'd').exec(markdown);
  if (!match) throw new Error(`Source/cache prose mismatch: ${page}`);
  manifest.pages[page] = { cache, cacheSha256: sha256Artifact(cache, bytes), bindings: found.map((token, i) => ({
    signature: signature(token[0]), metadata: metadata(token[0]), range: match.indices[i + 1]
  })) };
  console.log(`${page}: ${found.length} bound results`);
}
function inventory(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${item.name}`;
    if (item.isDirectory()) inventory(file);
    else manifest.artifacts[file] = sha256Artifact(file, fs.readFileSync(file));
  }
}
for (const dir of ['data', 'outputs', 'publication-baseline']) inventory(dir);
for (const file of ['assets/completion-rate.svg', 'assets/logo-bg-1200x900.png', 'assets/series-data.json', 'assets/series-inventory.json', 'assets/selected-series.json', 'assets/twfe-fwl.svg', 'assets/twfe-model-progression.svg', 'assets/twfe-period-coverage.svg', 'renv.lock', 'config/analysis.yml', 'config/dataflows.yml']) {
  manifest.artifacts[file] = sha256Artifact(file, fs.readFileSync(file));
}
fs.writeFileSync('config/frozen-presentation.json', JSON.stringify(manifest, null, 2) + '\n');
