/**
 * Apply canonical site-wide numbering and presentation-only HTML polish after
 * ordinary Quarto rendering. Runs through Quarto's bundled Deno runtime, so no
 * separately installed Node.js runtime is required.
 */

const root = new URL("../../", import.meta.url);
const pageOrder = [
  "index.qmd",
  "analysis/01-api-and-structure.qmd",
  "analysis/02-database-inventory.qmd",
  "analysis/03-panel-structure.qmd",
  "analysis/05-demographic-comparisons.qmd",
  "analysis/09-series-explorer.qmd",
  "analysis/10-twfe-analysis.qmd",
  "analysis/series.qmd",
];
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function projectUrl(path: string): URL {
  return new URL(path.replaceAll("\\", "/"), root);
}

async function readText(path: string): Promise<string> {
  return decoder.decode(await Deno.readFile(projectUrl(path)));
}

async function writeText(path: string, value: string): Promise<void> {
  await Deno.writeFile(projectUrl(path), encoder.encode(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function captionMarkup(inner: string): string {
  const content = inner.trim().replace(/`([^`]+)`/g, "<code>$1</code>");
  const match = /^(Figure|Table)(?:&nbsp;|\s)+(\d+):?\s*([\s\S]*)$/.exec(content);
  if (!match) return inner;
  const [, type, number, rawTitle] = match;
  const subtitleMatch = rawTitle.match(/<span\s+class=["']object-caption-subtitle["'][^>]*>[\s\S]*?<\/span>/i);
  const withoutSubtitle = subtitleMatch ? rawTitle.replace(subtitleMatch[0], "") : rawTitle;
  const title = withoutSubtitle.trim().replace(/([.!?])((?:\s*<\/[^>]+>)*)\s*$/, "$2");
  const subtitle = subtitleMatch ? subtitleMatch[0].replace(/([.!?])(?=\s*<\/span>)/, "") : "";
  return `\n<span class="object-caption-number">${type}&nbsp;${number}</span>\n<span class="object-caption-title">${title}</span>${subtitle ? `\n${subtitle}` : ""}\n`;
}

function objectIds(source: string): string[] {
  const matches = [...source.matchAll(/(?:\{#|#\|\s*label:\s*)((?:fig|tbl)-[\w-]+)/g)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((match) => match[1]);
  return [...new Set(matches)].filter((id) => id !== "tbl-panel-series-summary");
}

const pages = [];
for (const file of pageOrder) {
  pages.push({ file, objects: objectIds(await readText(file)) });
}

let figure = 1;
let table = 1;
const numbers = new Map<string, string>();
for (const page of pages) {
  for (const id of page.objects) {
    numbers.set(id, id.startsWith("fig-") ? `Figure ${figure++}` : `Table ${table++}`);
  }
}

function replaceFigureImage(html: string, id: string, assetPath: string, alt: string): string {
  const pattern = new RegExp(`(<div\\b[^>]*id="${escapeRegExp(id)}"[\\s\\S]*?<figure[^>]*>)[\\s\\S]*?(<figcaption\\b)`, "m");
  return html.replace(pattern, `$1<img src="${assetPath}" class="img-fluid presentation-svg" alt="${alt}">$2`);
}

for (const page of pages) {
  const htmlPath = `docs/${page.file.replace(/\.qmd$/, ".html")}`;
  try {
    await Deno.stat(projectUrl(htmlPath));
  } catch {
    continue;
  }

  let html = await readText(htmlPath);

  for (const id of page.objects) {
    const label = numbers.get(id);
    if (!label) continue;
    const [type, number] = label.split(" ");
    const objectPattern = new RegExp(`(<div\\b[^>]*id="${escapeRegExp(id)}"[\\s\\S]*?<figcaption\\b[^>]*>)([\\s\\S]*?)(<\\/figcaption>)`);
    html = html.replace(objectPattern, (_match, before, inner, after) => {
      const renumbered = inner.replace(/^(\s*)(Figure|Table)(?:&nbsp;|\s)+\d+:?/, `$1${type}&nbsp;${number}`);
      return `${before}${captionMarkup(renumbered)}${after}`;
    });
  }

  html = html.replace(/<figcaption\b([^>]*)>([\s\S]*?)<\/figcaption>/g, (_match, attributes, inner) => `<figcaption${attributes}>${captionMarkup(inner)}</figcaption>`);

  for (const [id, label] of numbers) {
    const [type, number] = label.split(" ");
    const hrefPattern = new RegExp(`(<a\\b[^>]*href="[^"]*#${escapeRegExp(id)}"[^>]*class="[^"]*quarto-xref[^"]*"[^>]*>)[\\s\\S]*?(<\\/a>)`, "g");
    html = html.replace(hrefPattern, `$1${type}&nbsp;${number}$2`);
  }

  if (page.file === "analysis/02-database-inventory.qmd") {
    html = html.replace(/(<div\b[^>]*id="tbl-database-inventory"[\s\S]*?<\/table>)/, (matched) => matched
      .replace(/>(?:observations|data_points)<\/th>/i, ">Observation rows</th>")
      .replace(/>(?:countries|reference_areas)<\/th>/i, ">Reference areas</th>")
      .replace(/>measures<\/th>/i, ">Unique <code>MEASURE</code> codes</th>")
      .replace(/>first_period<\/th>/i, ">First period</th>")
      .replace(/>last_period<\/th>/i, ">Last period</th>"));
  }

  if (page.file === "analysis/03-panel-structure.qmd") {
    html = html.replaceAll("Statistical series", "Analytical series").replaceAll("statistical series", "analytical series");
    html = replaceFigureImage(html, "fig-completion-rate", "../assets/completion-rate.svg", "Distribution of analytical-series completion rates");
  }

  if (page.file === "analysis/10-twfe-analysis.qmd") {
    html = replaceFigureImage(html, "fig-period-coverage", "../assets/twfe-period-coverage.svg", "Country coverage by period with the 70 percent core-period rule");
    html = replaceFigureImage(html, "fig-model-progression", "../assets/twfe-model-progression.svg", "Employment coefficients across core and full matched samples");
    html = replaceFigureImage(html, "fig-fwl", "../assets/twfe-fwl.svg", "Residualized life satisfaction and employment with the TWFE slope");
  }

  await writeText(htmlPath, html);
}

console.log(`Applied canonical site-wide numbering (${table - 1} tables, ${figure - 1} figures) and presentation polish.`);
