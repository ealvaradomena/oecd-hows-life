#!/usr/bin/env node
/** Regenerate the web SVG from the authoritative TikZ source when TeX tools are available. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import {spawnSync} from 'node:child_process'; import {fileURLToPath} from 'node:url';
export function buildWorkflowDiagram({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')}={}){
  const source=path.join(root,'diagrams','project-workflow.tex'); const output=path.join(root,'assets','project-workflow.svg');
  if(!fs.existsSync(source)) throw new Error('Missing authoritative TikZ source: diagrams/project-workflow.tex');
  const has=cmd=>spawnSync(cmd,['--version'],{stdio:'ignore',shell:false}).status===0;
  if(!has('pdflatex')||!has('dvisvgm')){if(!fs.existsSync(output))throw new Error('TikZ SVG is missing and pdflatex/dvisvgm are unavailable.');console.log('TikZ tools unavailable; using checked-in project-workflow.svg generated from diagrams/project-workflow.tex.');return false;}
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hl-tikz-')); try{
    let r=spawnSync('pdflatex',['-interaction=nonstopmode','-halt-on-error','-output-directory',tmp,source],{stdio:'inherit',shell:false}); if(r.status!==0)throw new Error('pdflatex failed for project workflow.');
    const pdf=path.join(tmp,'project-workflow.pdf'); r=spawnSync('dvisvgm',['--pdf','--no-fonts','--exact','-o',output,pdf],{stdio:'inherit',shell:false}); if(r.status!==0)throw new Error('dvisvgm failed for project workflow.'); return true;
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))buildWorkflowDiagram();
