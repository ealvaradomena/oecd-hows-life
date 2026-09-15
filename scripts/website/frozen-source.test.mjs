import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePage } from './build.mjs';
import { signature, metadata, sha256Artifact } from './frozen-source.mjs';

const token = '```{r}\n#| label: fig-example\n#| fig-cap: "Original caption."\nplot(values)\n```';
const frozen = '\n![Original caption.](example_files/fig-example-1.png){#fig-example}\n';
const entry = { bindings: [{ signature: signature(token), metadata: metadata(token), range: [0, frozen.length] }] };

test('caption and identifier edits reuse frozen image bytes and filenames', () => {
  const revised = token.replace('label: fig-example', 'label: fig-revised').replace('Original caption.', 'Approved caption.');
  const result = compilePage(`New prose.\n${revised}\nMore prose.`, entry, frozen);
  assert.match(result, /New prose/);
  assert.match(result, /Approved caption/);
  assert.match(result, /\{#fig-revised\}/);
  assert.match(result, /example_files\/fig-example-1\.png/);
  assert.doesNotMatch(result, /plot\(values\)/);
});

test('changed R calculations fail instead of falling back to execution', () => {
  assert.throws(() => compilePage(token.replace('plot(values)', 'plot(new_values)'), entry, frozen), /Unmatched computation/);
});

test('execution options are not presentation metadata', () => {
  assert.throws(() => compilePage(token.replace('plot(values)', '#| eval: false\nplot(values)'), entry, frozen), /Unmatched computation/);
});

test('new inline expressions fail even if the R chunks still match', () => {
  assert.throws(() => compilePage(`${token}\nValue: \`r mean(values)\``, entry, frozen), /Unmatched computation/);
});

test('foreign executable chunks and includes cannot enter staged Markdown', () => {
  for (const source of ['```{python}\nprint(1)\n```', '{{< include analysis.qmd >}}']) {
    assert.throws(() => compilePage(source, { bindings: [] }), /Executable or embedded/);
  }
});

test('ambiguous repeated expressions fail closed', () => {
  const scalar = '`r x`';
  const signatureValue = signature(scalar);
  const bindings = [{ signature: signatureValue, metadata: {}, range: [0, 1] }, { signature: signatureValue, metadata: {}, range: [1, 2] }];
  assert.throws(() => compilePage(scalar, { bindings }, '12'), /Ambiguous/);
});

test('ordinary example code stays visible and non-executable', () => {
  const source = '```r\nsource("scripts/00-run-all.R")\n```';
  assert.equal(compilePage(source, { bindings: [] }), source);
});

test('text artifact hashes are stable across LF and CRLF checkouts', () => {
  assert.equal(
    sha256Artifact('assets/example.json', Buffer.from('{\r\n  "value": 1\r\n}\r\n')),
    sha256Artifact('assets/example.json', Buffer.from('{\n  "value": 1\n}\n')),
  );
});

test('binary artifact hashes remain byte-exact', () => {
  assert.notEqual(
    sha256Artifact('figure.png', Buffer.from([0x0d, 0x0a])),
    sha256Artifact('figure.png', Buffer.from([0x0a])),
  );
});
