/** Presentation-only HTML polishing. Never executes analysis. */
import fs from 'node:fs';
import path from 'node:path';

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function captionMarkup(inner) {
  let content = inner.trim();
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  const match = /^(Figure|Table)(?:&nbsp;|\s)+(\d+):?\s*([\s\S]*)$/.exec(content);
  if (!match) return inner;
  const [, type, number, rawTitle] = match;
  const subtitleMatch = rawTitle.match(/<span\s+class=["']object-caption-subtitle["'][^>]*>[\s\S]*?<\/span>/i);
  const withoutSubtitle = subtitleMatch ? rawTitle.replace(subtitleMatch[0], "") : rawTitle;
  const title = withoutSubtitle.trim().replace(/([.!?])((?:\s*<\/[^>]+>)*)\s*$/, "$2");
  const subtitle = subtitleMatch ? subtitleMatch[0].replace(/([.!?])(?=\s*<\/span>)/, "") : "";
  return `\n<span class="object-caption-number">${type}&nbsp;${number}</span>\n<span class="object-caption-title">${title}</span>${subtitle ? `\n${subtitle}` : ""}\n`;
}

export function polishHtml(html, numberMap = new Map()) {
  html = html.replace(/<figcaption\b([^>]*)>([\s\S]*?)<\/figcaption>/g,
    (_, attrs, inner) => `<figcaption${attrs}>${captionMarkup(inner)}</figcaption>`);

  for (const [id, label] of numberMap) {
    const [type, number] = label.split(' ');
    const hrefPattern = new RegExp(`(<a\\b[^>]*href="[^"]*#${escapeRegExp(id)}"[^>]*class="[^"]*quarto-xref[^"]*"[^>]*>)[\\s\\S]*?(<\\/a>)`, 'g');
    html = html.replace(hrefPattern, `$1${type}&nbsp;${number}$2`);
  }
  return html;
}

export function buildNumberMap(pages) {
  let figure = 1;
  let table = 1;
  const map = new Map();
  for (const page of pages) {
    for (const id of page.objects) {
      map.set(id, id.startsWith('fig-') ? `Figure ${figure++}` : `Table ${table++}`);
    }
  }
  return map;
}


function replaceFigureImage(html, id, assetPath, alt) {
  const pattern = new RegExp(`(<div\\b[^>]*id="${escapeRegExp(id)}"[\\s\\S]*?<figure[^>]*>[\\s\\S]*?)<img\\b[^>]*>`, 'm');
  return html.replace(pattern, `$1<img src="${assetPath}" class="img-fluid presentation-svg" alt="${alt}">`);
}

export function polishSite(directory, pages) {
  const numbers = buildNumberMap(pages);
  for (const page of pages) {
    const file = path.join(directory, page.file.replace(/\.qmd$/, '.html'));
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8');
    for (const id of page.objects) {
      const label = numbers.get(id);
      const [type, number] = label.split(' ');
      const objectPattern = new RegExp(`(<div\\b[^>]*id="${escapeRegExp(id)}"[\\s\\S]*?<figcaption\\b[^>]*>)([\\s\\S]*?)(<\\/figcaption>)`);
      html = html.replace(objectPattern, (_, before, inner, after) => {
        const renumbered = inner.replace(/^(\s*)(Figure|Table)(?:&nbsp;|\s)+\d+:?/, `$1${type}&nbsp;${number}`);
        return `${before}${captionMarkup(renumbered)}${after}`;
      });
    }
    if (page.file === "analysis/02-database-inventory.qmd") {
      html = html.replace(/(<div\b[^>]*id="tbl-database-inventory"[\s\S]*?<\/table>)/, table => table
        .replace(/>(?:observations|data_points)<\/th>/i, ">Observation rows</th>")
        .replace(/>(?:countries|reference_areas)<\/th>/i, ">Reference areas</th>")
        .replace(/>measures<\/th>/i, ">Unique <code>MEASURE</code> codes</th>")
        .replace(/>first_period<\/th>/i, ">First period</th>")
        .replace(/>last_period<\/th>/i, ">Last period</th>"));
    }
    if (page.file === "analysis/03-panel-structure.qmd") {
      html = html
        .replaceAll("Statistical series", "Analytical series")
        .replaceAll("statistical series", "analytical series");
    }
    if (page.file === "analysis/03-panel-structure.qmd") {
      html = replaceFigureImage(html, "fig-completion-rate", "../assets/completion-rate.svg", "Distribution of analytical-series completion rates");
    }
    if (page.file === "analysis/10-twfe-analysis.qmd") {
      html = replaceFigureImage(html, "fig-period-coverage", "../assets/twfe-period-coverage.svg", "Country coverage by period with the 70 percent core-period rule");
      html = replaceFigureImage(html, "fig-model-progression", "../assets/twfe-model-progression.svg", "Employment coefficients across core and full matched samples");
      html = replaceFigureImage(html, "fig-fwl", "../assets/twfe-fwl.svg", "Residualized life satisfaction and employment with the TWFE slope");
    }
    html = polishHtml(html, numbers);
    fs.writeFileSync(file, html);
  }
  return numbers;
}
