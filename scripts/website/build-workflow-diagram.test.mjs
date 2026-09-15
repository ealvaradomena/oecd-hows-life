import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWorkflowDiagram, workflowDiagramFingerprint } from './build-workflow-diagram.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-diagram-test-'));
  for (const relative of ['diagrams/project-workflow.tex', 'scripts/website/build-workflow-diagram.mjs', 'scripts/website/build-workflow-diagram.ts', 'assets/project-workflow.svg']) {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, relative);
  }
  return root;
}

test('current fingerprint skips TeX commands and preserves the SVG', t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const svg = path.join(root, 'assets/project-workflow.svg');
  fs.writeFileSync(path.join(root, 'assets/project-workflow.sha256'), `${workflowDiagramFingerprint(root)}\n`);
  let commands = 0;
  assert.equal(buildWorkflowDiagram({ root, commandAvailable: () => { commands++; return true; } }), false);
  assert.equal(commands, 0); assert.equal(fs.readFileSync(svg, 'utf8'), 'assets/project-workflow.svg');
});

test('changed source regenerates the SVG and records the new fingerprint', t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'assets/project-workflow.sha256'), 'stale\n');
  const commands = [];
  const runCommand = (command, args) => {
    commands.push(command);
    if (command === 'pdflatex') fs.writeFileSync(path.join(args.at(-2), 'project-workflow.pdf'), 'pdf');
    if (command === 'dvisvgm') fs.writeFileSync(args[args.indexOf('-o') + 1], '<svg>regenerated</svg>');
    return { status: 0 };
  };
  assert.equal(buildWorkflowDiagram({ root, commandAvailable: () => true, runCommand }), true);
  assert.deepEqual(commands, ['pdflatex', 'dvisvgm']);
  assert.equal(fs.readFileSync(path.join(root, 'assets/project-workflow.svg'), 'utf8'), '<svg>regenerated</svg>');
  assert.equal(fs.readFileSync(path.join(root, 'assets/project-workflow.sha256'), 'utf8').trim(), workflowDiagramFingerprint(root));
});

test('stale output fails closed when TeX is unavailable', t => {
  const root = fixture(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => buildWorkflowDiagram({ root, commandAvailable: () => false }), /stale or missing/);
});

test('fingerprint is stable across LF and CRLF checkouts', t => {
  const lf = fixture(); const crlf = fixture();
  t.after(() => { fs.rmSync(lf, { recursive: true, force: true }); fs.rmSync(crlf, { recursive: true, force: true }); });
  for (const relative of ['diagrams/project-workflow.tex', 'scripts/website/build-workflow-diagram.mjs', 'scripts/website/build-workflow-diagram.ts']) {
    const file = path.join(crlf, relative);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  }
  assert.equal(workflowDiagramFingerprint(lf), workflowDiagramFingerprint(crlf));
});
