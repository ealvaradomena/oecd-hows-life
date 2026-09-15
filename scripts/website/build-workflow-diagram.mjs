#!/usr/bin/env node
/** Regenerate the committed workflow SVG only when its content fingerprint changes. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const generatorInputs = [
  'diagrams/project-workflow.tex',
  'scripts/website/build-workflow-diagram.mjs',
  'scripts/website/build-workflow-diagram.ts',
];

export function workflowDiagramFingerprint(root) {
  const hash = crypto.createHash('sha256');
  for (const relative of generatorInputs) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) throw new Error(`Missing workflow-diagram input: ${relative}`);
    hash.update(`${relative}\0`); hash.update(fs.readFileSync(file)); hash.update('\0');
  }
  return hash.digest('hex');
}

export function buildWorkflowDiagram({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  commandAvailable = command => spawnSync(command, ['--version'], { stdio: 'ignore', shell: false }).status === 0,
  runCommand = (command, args) => spawnSync(command, args, { stdio: 'inherit', shell: false }),
} = {}) {
  const output = path.join(root, 'assets', 'project-workflow.svg');
  const fingerprintFile = path.join(root, 'assets', 'project-workflow.sha256');
  const fingerprint = workflowDiagramFingerprint(root);
  const recorded = fs.existsSync(fingerprintFile) ? fs.readFileSync(fingerprintFile, 'utf8').trim() : '';
  if (fs.existsSync(output) && recorded === fingerprint) {
    console.log('Workflow diagram is current; skipped regeneration.');
    return false;
  }
  if (!commandAvailable('pdflatex') || !commandAvailable('dvisvgm')) {
    throw new Error('Workflow diagram is stale or missing, and pdflatex/dvisvgm are unavailable. Install the TeX tools, regenerate assets/project-workflow.svg, and commit it with assets/project-workflow.sha256.');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-tikz-'));
  try {
    const source = path.join(root, 'diagrams', 'project-workflow.tex');
    let result = runCommand('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', tempDir, source]);
    if (result.status !== 0) throw new Error('pdflatex failed for project workflow.');
    const generated = path.join(tempDir, 'project-workflow.svg');
    result = runCommand('dvisvgm', ['--pdf', '--no-fonts', '--exact', '-o', generated, path.join(tempDir, 'project-workflow.pdf')]);
    if (result.status !== 0) throw new Error('dvisvgm failed for project workflow.');
    if (!fs.existsSync(generated)) throw new Error('dvisvgm did not produce project-workflow.svg.');
    fs.copyFileSync(generated, output);
    fs.writeFileSync(fingerprintFile, `${fingerprint}\n`);
    console.log('Regenerated assets/project-workflow.svg from diagrams/project-workflow.tex.');
    return true;
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildWorkflowDiagram();
