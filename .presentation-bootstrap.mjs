// One-time frozen-manifest bootstrap retained for provenance.
// Reads source/cache/data/output state and writes config/frozen-presentation.json;
// it is not part of the ordinary Quarto render or current GitHub Actions path.
import fs from 'node:fs';
import { normalize, tokens, signature, metadata, sha256 } from './scripts/website/frozen-source.mjs';
const pages = ['index.qmd', ...fs.readdirSync('analysis').filter(x => x.endsWith('.qmd')).sort().map(x => `analysis/${x}`)];
const manifest = { version: 1, pages: {}, artifacts: {} };
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
for (const page of pages) {
  const source = normalize(fs.readFileSync(page, 'utf8'));
  const found = tokens(source);
  if (!found.length) { manifest.pages[page] = { bindings: [] }; continue; }
  const cache = `_freeze/${page.replace(/\.qmd$/, '')}/execute-results/html.json`;
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
  manifest.pages[page] = { cache, cacheSha256: sha256(bytes), bindings: found.map((token, i) => ({
    signature: signature(token[0]), metadata: metadata(token[0]), range: match.indices[i + 1]
  })) };
  console.log(`${page}: ${found.length} bound results`);
}
function inventory(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${item.name}`;
    if (item.isDirectory()) inventory(file);
    else manifest.artifacts[file] = sha256(fs.readFileSync(file));
  }
}
for (const dir of ['data', 'outputs', '_freeze']) inventory(dir);
for (const file of ['assets/series-data.json', 'assets/series-inventory.json', 'renv.lock', 'config/analysis.yml', 'config/dataflows.yml']) {
  manifest.artifacts[file] = sha256(fs.readFileSync(file));
}
fs.writeFileSync('config/frozen-presentation.json', JSON.stringify(manifest, null, 2) + '\n');
