#!/usr/bin/env node
/** Apply the same canonical site-wide numbering/polish pass used by strict publication. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { polishSite } from './polish-html.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const order=['index.qmd','analysis/01-api-and-structure.qmd','analysis/02-database-inventory.qmd','analysis/03-panel-structure.qmd','analysis/05-demographic-comparisons.qmd','analysis/09-series-explorer.qmd','analysis/10-twfe-analysis.qmd','analysis/series.qmd'];
const pages=order.map(file=>{const source=fs.readFileSync(path.join(root,file),'utf8');const matches=[...source.matchAll(/(?:\{#|#\|\s*label:\s*)((?:fig|tbl)-[\w-]+)/g)].sort((a,b)=>a.index-b.index);return {file,objects:[...new Set(matches.map(m=>m[1]))]};});
polishSite(path.join(root,'docs'),pages);
console.log('Applied canonical site-wide table/figure numbering and presentation polish.');
