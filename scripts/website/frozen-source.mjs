/** Presentation-only utilities. Never evaluate R or inline expressions. */
import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const normalize = text => text.replace(/\r\n/g, '\n');
export const tokens = text => [...text.matchAll(/^```\{r[^\n]*\}\n[\s\S]*?^```[ \t]*$|`r [^`\n]+`/gm)];
// Only these non-computational options may change without a new result binding.
export const signature = token => sha256(token.replace(/^#\| (?:label|fig-cap|tbl-cap|fig-alt):.*\n/gm, ''));
export function metadata(token) {
  return Object.fromEntries([...token.matchAll(/^#\| (label|fig-cap|tbl-cap|fig-alt):\s*(.*)$/gm)]
    .map(([, key, value]) => [key, value.replace(/^"(.*)"$/, '$1')]));
}
export function substituteOutput(output, previous, current) {
  for (const key of ['label', 'fig-cap', 'tbl-cap']) {
    if (previous[key] && current[key] && previous[key] !== current[key]) {
      if (key === 'label') {
        // Preserve frozen figure filenames: rename identifiers only.
        output = output.replaceAll(`#${previous[key]}`, `#${current[key]}`);
      } else {
        output = output.replaceAll(previous[key], current[key].replaceAll("'", '&#39;'));
      }
    }
  }
  if (current['fig-alt']) {
    output = output.replace(/(!\[[^\]]*\]\([^\n]+\)\{[^}\n]*)(\})/g,
      (_, prefix, end) => `${prefix} fig-alt="${current['fig-alt'].replaceAll('"', '&quot;')}"${end}`);
  }
  return output;
}
