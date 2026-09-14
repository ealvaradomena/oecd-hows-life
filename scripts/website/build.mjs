#!/usr/bin/env node
/**
 * Render the website from frozen outputs; no R, OECD, LLM, or model execution.
 * Inputs: QMD prose, frozen-presentation.json, _freeze, local JS/JSON/CSS.
 * Outputs: disposable .presentation-build staging; docs/ only after validation.
 * Requires Node >= 20 and Quarto 1.8.25. Run from anywhere in this project.
 * --check verifies bindings/artifacts without rendering. --verify-all also
 * requires every local analytical artifact recorded in the integrity manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalize, tokens, signature, metadata, sha256, substituteOutput } from './frozen-source.mjs';
import { validateSite } from './validate.mjs';
import { polishSite } from './polish-html.mjs';
import { derivePresentationAssets } from './derive-presentation-assets.mjs';
import { deriveVisualAssets } from './derive-visual-assets.mjs';
import { buildWorkflowDiagram } from './build-workflow-diagram.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file));
const manifest = () => JSON.parse(read('config/frozen-presentation.json'));


export function compilePage(source, entry, markdown = '') {
  source = normalize(source);
  const result = source.replace(/^```\{r[^\n]*\}\n[\s\S]*?^```[ \t]*$|`r [^`\n]+`/gm, token => {
    const key = signature(token);
    const matches = entry.bindings.filter(binding => binding.signature === key);
    if (!matches.length) throw new Error('Unmatched computation: frozen results cannot be recomputed by this build.');
    const binding = matches[0];
    if (matches.some(other => markdown.slice(...other.range) !== markdown.slice(...binding.range))) {
      throw new Error('Ambiguous cached computation binding.');
    }
    return substituteOutput(markdown.slice(...binding.range), binding.metadata, metadata(token));
  });
  if (tokens(result).length || /^```\{(?![.#])[^}]+\}/m.test(result) || /\{\{<\s*(?:include|embed)/.test(result)) {
    throw new Error('Executable or embedded content remains in staged presentation.');
  }
  return result;
}

export function prepare({ verifyAll = false } = {}) {
  const frozen = manifest();
  if (frozen.version !== 1) throw new Error('Unsupported frozen manifest version.');
  const required = new Set(['assets/series-data.json', 'assets/series-inventory.json', 'assets/selected-series.json']);
  for (const entry of Object.values(frozen.pages)) if (entry.cache) required.add(entry.cache);
  for (const file of Object.keys(frozen.artifacts)) {
    if (file.startsWith('_freeze/') && /\/figure-html\//.test(file)) required.add(file);
    const exists = fs.existsSync(path.join(root, file));
    if (!exists && (verifyAll || required.has(file))) throw new Error(`Missing frozen artifact: ${file}`);
    if (exists && sha256(read(file)) !== frozen.artifacts[file]) throw new Error(`Changed frozen artifact: ${file}`);
  }
  for (const [file, expected] of Object.entries(frozen.executionSources ?? {})) {
    const code = normalize(read(file).toString()).split('\n').filter(line => !/^\s*#/.test(line)).join('\n').trim();
    if (sha256(code) !== expected) throw new Error(`Analytical source changed: ${file}. Review frozen provenance before publication.`);
  }
  const pages = [];
  let figure = 1, table = 1;
  const identifiers = new Set();
  const pageOrder = ["index.qmd", "analysis/01-api-and-structure.qmd", "analysis/02-database-inventory.qmd", "analysis/03-panel-structure.qmd", "analysis/05-demographic-comparisons.qmd", "analysis/09-series-explorer.qmd", "analysis/10-twfe-analysis.qmd", "analysis/series.qmd"];
  for (const file of pageOrder) {
    const entry = frozen.pages[file];
    if (!entry) continue;
    let markdown = '';
    if (entry.cache) {
      const bytes = read(entry.cache);
      if (sha256(bytes) !== entry.cacheSha256) throw new Error(`Changed cache: ${entry.cache}`);
      markdown = normalize(JSON.parse(bytes).result.markdown);
    }
    let compiled = compilePage(read(file).toString(), entry, markdown);
    const sourceForObjects = read(file).toString();
    const objectMatches = [...sourceForObjects.matchAll(/(?:\{#|#\|\s*label:\s*)((?:fig|tbl)-[\w-]+)/g)].sort((a,b)=>a.index-b.index);
    const objects = [...new Set(objectMatches.map(match => match[1]))].filter(id => id !== 'tbl-panel-series-summary');
    const labels = { fig: [], tbl: [] };
    for (const id of objects) {
      if (identifiers.has(id)) throw new Error(`Duplicate object identifier: ${id}`);
      identifiers.add(id);
      labels[id.slice(0, 3)].push(String(id.startsWith('fig-') ? figure++ : table++));
    }
    // Quarto's native custom labels supply one sequence across all website pages.
    const crossref = Object.entries(labels).filter(([, values]) => values.length)
      .map(([type, values]) => `  ${type}-labels: ${JSON.stringify(values)}`).join('\n');
    compiled = compiled.replace(/^---\n/, `---\nengine: markdown\n${crossref ? `crossref:\n${crossref}\n` : ''}`);
    pages.push({ file, compiled, objects });
  }
  return { frozen, pages, counts: { figures: figure - 1, tables: table - 1 } };
}

function quartoExecutable() {
  if (process.env.QUARTO_PATH) return process.env.QUARTO_PATH;
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)) {
      for (const relative of ['Quarto/bin/quarto.exe', 'RStudio/resources/app/bin/quarto/bin/quarto.exe', 'Positron/resources/app/quarto/bin/quarto.exe']) {
        const candidate = path.join(base, relative);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return 'quarto';
}

function requireIconify() {
  const extension = path.join(root, '_extensions', 'mcanouil', 'iconify', '_extension.yml');
  if (fs.existsSync(extension)) return;
  throw new Error(
    'Missing project-local Quarto Iconify extension. Install it once from the project root with: ' +
      'quarto add mcanouil/quarto-iconify@4.1.2 --no-prompt, then commit _extensions/mcanouil/iconify.'
  );
}

export function build() {
  const prepared = prepare({ verifyAll: process.argv.includes('--verify-all') });
  console.log(`Verified frozen bindings: ${prepared.pages.length} pages, ${prepared.counts.figures} figures, ${prepared.counts.tables} tables.`);
  if (process.argv.includes('--check')) return;
  requireIconify();
  derivePresentationAssets({ root });
  buildWorkflowDiagram({ root });
  deriveVisualAssets();
  const stagingRoot = path.join(root, '.presentation-build');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const stage = fs.mkdtempSync(path.join(stagingRoot, 'site-'));
  const config = normalize(read('_quarto.yml').toString());
  const hookBlock = /  pre-render:\n(?:    - .*\n)+  post-render:\n(?:    - .*\n)+/;
  if (!hookBlock.test(config)) throw new Error('Expected presentation render hooks are missing or changed.');
  const stageConfig = config.replace(hookBlock, '');
  if (!/^  freeze: false$/m.test(stageConfig)) {
    throw new Error('Expected execute.freeze: false in website configuration.');
  }
  if (/^\s*(?:pre-render|post-render|filters|include-in-header|include-before-body|include-after-body):/m.test(stageConfig)) {
    throw new Error('Unreviewed render hooks or filters in website configuration.');
  }
  fs.writeFileSync(
    path.join(stage, '_quarto.yml'),
    stageConfig.replace(/  freeze: false/, '  enabled: false\n  freeze: false')
  );
  for (const file of ['styles.css', 'references.bib']) fs.copyFileSync(path.join(root, file), path.join(stage, file));
  fs.cpSync(path.join(root, '_extensions'), path.join(stage, '_extensions'), { recursive: true });
  fs.mkdirSync(path.join(stage, 'assets'));
  for (const file of fs.readdirSync(path.join(root, 'assets')).filter(file => /\.(js|json|svg)$/.test(file))) {
    fs.copyFileSync(path.join(root, 'assets', file), path.join(stage, 'assets', file));
  }
  for (const { file, compiled } of prepared.pages) {
    const destination = path.join(stage, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, compiled);
    const frozenFigures = path.join(root, '_freeze', file.replace(/\.qmd$/, ''), 'figure-html');
    if (fs.existsSync(frozenFigures)) {
      const images = path.join(stage, file.replace(/\.qmd$/, '_files'), 'figure-html');
      fs.cpSync(frozenFigures, images, { recursive: true });
    }
  }
  const result = spawnSync(quartoExecutable(), ['render', '--no-execute'], { cwd: stage, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Presentation render failed (${result.status}); docs/ was not touched.`);
  const output = path.join(stage, 'docs');
  polishSite(output, prepared.pages);
  validateSite(output, prepared.pages);
  prepare({ verifyAll: process.argv.includes('--verify-all') });
  // Both paths are resolved inside this workspace; preserve the old publication.
  const docs = path.resolve(root, 'docs');
  const backup = path.resolve(stage, 'previous-docs');
  if (docs !== path.join(root, 'docs') || !backup.startsWith(stagingRoot + path.sep)) throw new Error('Unsafe publication path.');
  if (fs.existsSync(docs)) fs.renameSync(docs, backup);
  try { fs.renameSync(output, docs); }
  catch (error) { if (fs.existsSync(backup)) fs.renameSync(backup, docs); throw error; }
  console.log(`Published verified presentation to ${docs}. Previous HTML preserved in ${backup}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
