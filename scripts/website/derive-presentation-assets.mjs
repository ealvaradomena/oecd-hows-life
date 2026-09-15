/**
 * Derive presentation-only JSON from already frozen local artifacts.
 *
 * This module never contacts the OECD and never reruns analytical R code.
 * The caller must verify the frozen artifact manifest before invoking it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map(value => value.trim());
  return rows
    .filter(values => values.some(value => value !== ''))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const clean = value => {
  const cleaned = String(value ?? '').trim();
  return cleaned === 'NA' ? '' : cleaned;
};
const readCsv = file => parseCsv(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  if (fs.existsSync(file)) {
    try { if (isDeepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value)) return; }
    catch { /* Rewrite malformed or non-JSON content below. */ }
  }
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function statusLabelsFromStructure(file) {
  if (!fs.existsSync(file)) return {};
  const xml = fs.readFileSync(file, 'utf8');
  const start = xml.indexOf('<structure:Codelist id="CL_OBS_STATUS"');
  if (start < 0) return {};
  const end = xml.indexOf('</structure:Codelist>', start);
  const block = xml.slice(start, end > start ? end : undefined);
  const labels = {};
  const codePattern = /<structure:Code id="([^"]+)">([\s\S]*?)<\/structure:Code>/g;
  let match;
  while ((match = codePattern.exec(block))) {
    const name = /<common:Name xml:lang="en">([\s\S]*?)<\/common:Name>/.exec(match[2]);
    if (name) labels[match[1]] = name[1].replace(/\s+/g, ' ').trim();
  }
  return labels;
}

function seriesId(row) {
  return [row.MEASURE, row.UNIT_MEASURE, row.AGE, row.SEX, row.EDUCATION_LEV, row.DOMAIN]
    .map(clean)
    .join('|');
}

function deriveSeriesStatus(root, raw, labels) {
  const output = path.join(root, 'assets', 'series-status.json');
  if (!raw) {
    if (!fs.existsSync(output)) writeJson(output, {});
    return;
  }

  const bySeries = {};
  for (const row of raw) {
    const status = clean(row.OBS_STATUS);
    if (!status) continue;
    const id = seriesId(row);
    if (!bySeries[id]) bySeries[id] = [];
    bySeries[id].push({
      area_code: clean(row.REF_AREA),
      time: clean(row.TIME_PERIOD),
      status,
      status_label: labels[status] ?? null
    });
  }
  writeJson(output, bySeries);
}

function deriveTwfeAudit(root, raw, labels) {
  const output = path.join(root, 'assets', 'twfe-audit.json');
  const samplePath = path.join(root, 'outputs', 'diagnostics', 'twfe-employment-life-satisfaction-sample.csv');
  const areaPath = path.join(root, 'outputs', 'diagnostics', 'twfe-employment-life-satisfaction-by-area.csv');
  if (!raw || !fs.existsSync(samplePath) || !fs.existsSync(areaPath)) {
    // Preserve the reviewed canonical publication asset when local analytical
    // inputs are unavailable, as they are in a clean strict-publication checkout.
    if (!fs.existsSync(output)) writeJson(output, {
      available: false,
      message: 'The status audit requires the frozen Current well-being raw snapshot and TWFE sample diagnostics.'
    });
    return;
  }

  const sample = readCsv(samplePath);
  const sampleKeys = new Set(sample.map(row => `${clean(row.REF_AREA)}|${clean(row.TIME_PERIOD)}`));
  const targets = new Map([
    ['11_1|0_TO_10|_T|_T|_T|HSL_11', 'Life satisfaction'],
    ['2_1|PT_POP_Y25T64|_T|_T|_T|HSL_2', 'Employment rate']
  ]);
  const counts = new Map();

  for (const row of raw) {
    const id = seriesId(row);
    if (!targets.has(id)) continue;
    if (!sampleKeys.has(`${clean(row.REF_AREA)}|${clean(row.TIME_PERIOD)}`)) continue;
    const status = clean(row.OBS_STATUS) || '(blank)';
    const key = `${targets.get(id)}\u0000${status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const status_summary = [...counts.entries()]
    .map(([key, count]) => {
      const [variable, status] = key.split('\u0000');
      return {
        variable,
        status,
        status_label: status === '(blank)' ? 'No status code supplied' : (labels[status] ?? 'Label unavailable'),
        observations: count
      };
    })
    .sort((a, b) => a.variable.localeCompare(b.variable) || a.status.localeCompare(b.status));

  const areaRows = readCsv(areaPath);
  const areas = areaRows.map(row => ({
    code: clean(row.REF_AREA ?? row.ref_area ?? row.CODE ?? row.code),
    label: clean(row.UNIT_LABEL ?? row.unit_label ?? row.REF_AREA_LABEL ?? row.ref_area_label ?? row.LABEL ?? row.label)
  })).filter(row => row.code || row.label)
    .sort((a, b) => (a.label || a.code).localeCompare(b.label || b.code));

  writeJson(output, {
    available: true,
    note: 'Status codes are counted on the frozen full matched sample used by the TWFE workflow. No observations are automatically excluded because of their status code.',
    status_summary,
    areas
  });
}

function deriveRetrievalManifest(root) {
  const output = path.join(root, 'assets', 'retrieval-manifest.json');
  const manifestPath = path.join(root, 'data', 'retrieval-manifest.csv');
  if (!fs.existsSync(manifestPath)) {
    // Preserve a previously derived frozen provenance asset rather than replacing it
    // with a less informative placeholder during presentation-only builds.
    if (!fs.existsSync(output)) writeJson(output, {
      available: false,
      message: 'This frozen snapshot predates retrieval-manifest logging. Its exact original retrieval timestamp is unavailable.'
    });
    return;
  }
  const rows = readCsv(manifestPath).map(row => ({
    resource_type: clean(row.resource_type),
    key: clean(row.key),
    title: clean(row.title),
    agency: clean(row.agency),
    dataflow: clean(row.dataflow),
    version: clean(row.version),
    url: clean(row.url),
    retrieved_at_utc: clean(row.retrieved_at_utc),
    sha256: clean(row.sha256),
    http_status: clean(row.http_status),
    etag: clean(row.etag),
    last_modified: clean(row.last_modified),
    content_type: clean(row.content_type),
    cache_reused: clean(row.cache_reused),
    retrieval_timestamp_status: clean(row.retrieval_timestamp_status)
  }));
  writeJson(output, { available: true, rows });
}

export function derivePresentationAssets({ root }) {
  const rawPath = path.join(root, 'data', 'raw', 'current_wellbeing.csv');
  const structurePath = path.join(root, 'data', 'metadata', 'current_wellbeing-structure.xml');
  const raw = fs.existsSync(rawPath) ? readCsv(rawPath) : null;
  const labels = statusLabelsFromStructure(structurePath);

  deriveSeriesStatus(root, raw, labels);
  deriveTwfeAudit(root, raw, labels);
  deriveRetrievalManifest(root);
}
