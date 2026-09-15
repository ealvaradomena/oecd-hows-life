/**
 * Derive presentation-only SVG assets from existing frozen JSON/CSV artifacts.
 * Runs through Quarto's bundled Deno runtime; no external Node installation is
 * required and no analytical pipeline or OECD API call is performed.
 */

const root = new URL("../../", import.meta.url);
const projectRoot = (await Deno.realPath(root)).replaceAll("\\", "/");
const outputSetting = (Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ?? "").trim();
if (!outputSetting) {
  throw new Error("QUARTO_PROJECT_OUTPUT_DIR is required; refusing to write presentation assets without an explicit local output root.");
}
const outputCandidate = /^(?:[A-Za-z]:\/|\/)/.test(outputSetting.replaceAll("\\", "/"))
  ? outputSetting
  : `${projectRoot}/${outputSetting}`;
const outputRoot = (await Deno.realPath(outputCandidate)).replaceAll("\\", "/");
const comparable = (value: string) => Deno.build.os === "windows" ? value.toLowerCase() : value;
if (!comparable(outputRoot).startsWith(`${comparable(projectRoot)}/`)) {
  throw new Error("Quarto output directory must remain inside the project tree.");
}
if (comparable(outputRoot) === comparable(`${projectRoot}/docs`)) {
  throw new Error("Ordinary render hooks may not write to canonical docs/.");
}
const outputAssets = `${outputRoot}/assets`;
await Deno.mkdir(outputAssets, { recursive: true });
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}[character] ?? character));

function projectUrl(path: string): URL {
  return new URL(path.replaceAll("\\", "/"), root);
}

async function readText(path: string): Promise<string> {
  return decoder.decode(await Deno.readFile(projectUrl(path)));
}

async function writeText(path: string, value: string): Promise<void> {
  const filename = path.replaceAll("\\", "/").split("/").at(-1);
  if (!filename || filename === "." || filename === "..") throw new Error(`Invalid output filename: ${path}`);
  await Deno.writeFile(`${outputAssets}/${filename}`, encoder.encode(`${value}\n`));
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

async function csv(path: string): Promise<Record<string, string>[]> {
  const lines = (await readText(path)).trim().split(/\r?\n/);
  const header = parseCsvLine(lines.shift() ?? "");
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(values.map((value, index) => [header[index], value]));
  });
}

function shell(width: number, height: number, body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><style>text{font-family:system-ui,sans-serif;fill:#282822}.muted{fill:#666;font-size:12px}.axis{stroke:#cfc7cb;stroke-width:1}.teal{fill:#157c87}.pink{fill:#bd1763}.burg{fill:#871548}.gold{fill:#d6a700}</style>${body}</svg>`;
}

async function completion(): Promise<void> {
  const rows = JSON.parse(await readText("assets/series-inventory.json"));
  const values = rows.map((row: Record<string, unknown>) => Number(row.completion_rate)).filter(Number.isFinite);
  const bins = 20;
  const counts = Array(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor(value * bins))] += 1;
  const width = 820;
  const height = 380;
  const margin = { left: 60, right: 30, top: 35, bottom: 55 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(...counts);
  let body = `<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`;
  counts.forEach((count, index) => {
    const barWidth = plotWidth / bins - 2;
    const barHeight = count / maximum * plotHeight;
    const x = margin.left + index * plotWidth / bins + 1;
    const y = height - margin.bottom - barHeight;
    body += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2" fill="#157c87" opacity=".78"/>`;
  });
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const medianX = margin.left + median * plotWidth;
  body += `<line x1="${medianX}" x2="${medianX}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#bd1763" stroke-width="2" stroke-dasharray="5 4"/><text x="${medianX - 5}" y="${margin.top + 12}" text-anchor="end" class="muted">Median ${(median * 100).toFixed(1)}%</text><line x1="${width - margin.right}" x2="${width - margin.right}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#d6a700" stroke-width="2"/><text x="${margin.left}" y="${height - 16}" class="muted">0%</text><text x="${width - margin.right}" y="${height - 16}" text-anchor="end" class="muted">100% completion</text><text transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle" class="muted">Analytical series</text>`;
  await writeText("assets/completion-rate.svg", shell(width, height, body, "Distribution of analytical-series completion rates"));
}

async function coverage(): Promise<void> {
  const rows = await csv("outputs/diagnostics/twfe-employment-life-satisfaction-period-coverage.csv");
  const width = 820;
  const height = 390;
  const margin = { left: 55, right: 25, top: 38, bottom: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let body = `<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`;
  rows.forEach((row, index) => {
    const value = Number(row.unit_coverage);
    const x = margin.left + index * plotWidth / rows.length + 4;
    const barWidth = plotWidth / rows.length - 8;
    const barHeight = value * plotHeight;
    const y = height - margin.bottom - barHeight;
    const fill = String(row.core_period).toLowerCase() === "true" ? "#157c87" : "#cfc7cb";
    body += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2" fill="${fill}"/><text x="${x + barWidth / 2}" y="${height - margin.bottom + 18}" text-anchor="end" transform="rotate(-45 ${x + barWidth / 2} ${height - margin.bottom + 18})" class="muted">${esc(row.TIME_PERIOD)}</text>`;
    if (value >= 0.7) body += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="muted">${Math.round(value * 100)}%</text>`;
  });
  const thresholdY = height - margin.bottom - 0.7 * plotHeight;
  body += `<line x1="${margin.left}" x2="${width - margin.right}" y1="${thresholdY}" y2="${thresholdY}" stroke="#bd1763" stroke-width="2" stroke-dasharray="6 4"/><text x="${margin.left + 6}" y="${thresholdY - 7}" text-anchor="start" fill="#bd1763" style="font-weight:700;font-size:12px">70% core-period rule</text><text transform="translate(17 ${height / 2}) rotate(-90)" text-anchor="middle" class="muted">Countries represented</text>`;
  await writeText("assets/twfe-period-coverage.svg", shell(width, height, body, "Country coverage by period with 70 percent core-period threshold"));
}

async function models(): Promise<void> {
  const rows = await csv("outputs/diagnostics/twfe-employment-life-satisfaction-model-summary.csv");
  const groups = ["High-coverage core periods", "Full matched sample"];
  const width = 820;
  const height = 430;
  const margin = { left: 210, right: 40, top: 40, bottom: 40 };
  const xMin = -0.005;
  const xMax = 0.085;
  const x = (value: number) => margin.left + (value - xMin) / (xMax - xMin) * (width - margin.left - margin.right);
  let body = ``;
  let y = 65;
  for (const group of groups) {
    body += `<text x="12" y="${y}" fill="#871548" style="font-weight:700;font-size:14px">${esc(group)}</text>`;
    y += 28;
    for (const row of rows.filter((candidate) => candidate.sample === group)) {
      const estimate = Number(row.estimate);
      const standardError = Number(row.std_error);
      const low = estimate - 1.96 * standardError;
      const high = estimate + 1.96 * standardError;
      const preferred = group === groups[0] && row.model === "twfe";
      body += `<text x="28" y="${y + 4}" style="font-size:13px;font-weight:400">${esc(row.model.replaceAll("_", " "))}${preferred ? " + preferred" : ""}</text><line x1="${x(low)}" x2="${x(high)}" y1="${y}" y2="${y}" stroke="${preferred ? "#871548" : "#111111"}" stroke-width="2"/><circle cx="${x(estimate)}" cy="${y}" r="${preferred ? 6 : 5}" fill="${preferred ? "#871548" : "#111111"}"/>`;
      y += 38;
    }
    y += 16;
  }
  body += `<text x="${margin.left}" y="${height - 10}" class="muted">0</text><text x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 10}" text-anchor="middle" class="muted">Employment coefficient</text>`;
  await writeText("assets/twfe-model-progression.svg", shell(width, height, body, "Employment coefficients across core and full matched samples"));
}

async function fwl(): Promise<void> {
  const rows = await csv("outputs/diagnostics/twfe-employment-life-satisfaction-transformed.csv");
  const verification = (await csv("outputs/diagnostics/twfe-employment-life-satisfaction-fwl-verification.csv"))[0];
  const beta = Number(verification.twfe_coefficient ?? verification.transformed_coefficient);
  const xs = rows.map((row) => Number(row.employment_rate_twfe)).filter(Number.isFinite);
  const ys = rows.map((row) => Number(row.life_satisfaction_twfe)).filter(Number.isFinite);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const width = 820;
  const height = 500;
  const margin = { left: 70, right: 35, top: 45, bottom: 60 };
  const X = (value: number) => margin.left + (value - xMin) / (xMax - xMin) * (width - margin.left - margin.right);
  const Y = (value: number) => margin.top + (yMax - value) / (yMax - yMin) * (height - margin.top - margin.bottom);
  let body = `<line x1="${X(0)}" x2="${X(0)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#cfc7cb"/><line x1="${margin.left}" x2="${width - margin.right}" y1="${Y(0)}" y2="${Y(0)}" stroke="#cfc7cb"/>`;
  rows.forEach((row) => {
    const x = Number(row.employment_rate_twfe);
    const y = Number(row.life_satisfaction_twfe);
    if (Number.isFinite(x) && Number.isFinite(y)) body += `<circle cx="${X(x)}" cy="${Y(y)}" r="3.2" fill="#157c87" opacity=".42"/>`;
  });
  body += `<line x1="${X(xMin)}" y1="${Y(beta * xMin)}" x2="${X(xMax)}" y2="${Y(beta * xMax)}" stroke="#bd1763" stroke-width="3"/><text x="${width - margin.right}" y="${height - margin.bottom - 8}" text-anchor="end" fill="#bd1763" style="font-weight:700;font-size:13px">TWFE slope β = ${beta.toFixed(4)}</text><text x="${width / 2}" y="${height - 15}" text-anchor="middle" class="muted">Employment rate residual</text><text transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle" class="muted">Life satisfaction residual</text>`;
  await writeText("assets/twfe-fwl.svg", shell(width, height, body, "Residualized life satisfaction and employment with TWFE slope"));
}

await completion();
await coverage();
await models();
await fwl();
console.log("Derived presentation SVG assets.");
