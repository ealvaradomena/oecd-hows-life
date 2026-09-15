/** Static publication checks. Reads HTML and local files; does not run analytics. */
import fs from 'node:fs';
import path from 'node:path';

export function validateSite(directory, pages) {
  const failures = [];
  const inventory = [];
  const numbers = new Set();
  const sequences = { Figure: [], Table: [] };
  for (const page of pages) {
    const htmlPath = path.join(directory, page.file.replace(/\.qmd$/, '.html'));
    const html = fs.readFileSync(htmlPath, 'utf8');
    const ids = [...html.matchAll(/(?<![\w-])id="([^"]+)"/g)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) failures.push(`${page.file}: duplicate HTML IDs`);
    const floats = [...html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)];
    for (const id of page.objects) {
      if (!ids.includes(id)) failures.push(`${page.file}: missing object ${id}`);
    }
    for (const [, content] of floats) {
      const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/.exec(content);
      if (!caption) { failures.push(`${page.file}: uncaptioned figure`); continue; }
      const text = caption[1].replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').trim();
      const number = /^(Figure|Table)\s+(\d+)(?::|\s|$)/.exec(text);
      if (!number) failures.push(`${page.file}: caption lacks number: ${text}`);
      else {
        const key = `${number[1]} ${number[2]}`;
        if (numbers.has(key)) failures.push(`Repeated site-wide number: ${key}`);
        numbers.add(key);
        sequences[number[1]].push(Number(number[2]));
      }
      const objectStart = content.search(/<(?:img|table|pre)\b|<div id="(?:series|country)-/);
      if (objectStart >= 0 && caption.index > objectStart) failures.push(`${page.file}: caption below object: ${text}`);
      inventory.push({ page: page.file, caption: text });
    }
    if (floats.length !== page.objects.length) failures.push(`${page.file}: object/caption count mismatch`);
    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt="[^"]+"/.test(match[0])) failures.push(`${page.file}: image lacks descriptive alt text`);
    }
    for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = raw.replaceAll('&amp;', '&');
      if (/^(?:[a-z]+:|\/\/)/i.test(value)) continue;
      const [resource, fragment] = value.split('#');
      let target = decodeURIComponent(resource.split('?')[0]);
      target = target.startsWith('/') ? path.join(directory, target) : path.resolve(path.dirname(htmlPath), target || path.basename(htmlPath));
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) { failures.push(`${page.file}: missing resource ${value}`); continue; }
      if (fragment && target.endsWith('.html')) {
        const targetHtml = target === htmlPath ? html : fs.readFileSync(target, 'utf8');
        if (!targetHtml.includes(`id="${decodeURIComponent(fragment)}"`)) failures.push(`${page.file}: broken fragment ${value}`);
      }
    }
    if (/class="quarto-xref"[^>]*>\?\?/.test(html)) failures.push(`${page.file}: unresolved cross-reference`);
  }
  for (const [type, values] of Object.entries(sequences)) {
    values.forEach((value, index) => {
      if (value !== index + 1) failures.push(`${type} numbering is not continuous site-wide: expected ${index + 1}, found ${value}`);
    });
  }
  if (failures.length) throw new Error(failures.join('\n'));
  fs.writeFileSync(path.join(directory, 'object-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  console.log(`Validated ${inventory.length} numbered captions, unique IDs, local links, and image descriptions.`);
  return inventory;
}
