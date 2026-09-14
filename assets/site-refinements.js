(() => {
  "use strict";
  const byId = id => document.getElementById(id);

  // Dynamic copyright year without analytical execution.
  document.querySelectorAll("[data-current-year]").forEach(node => { node.textContent = String(new Date().getFullYear()); });

  // OECD guidance is deliberately the final content object, after bibliography when present.
  document.querySelectorAll(".oecd-rules").forEach(note => {
    const main = note.closest("main") || document.querySelector("main");
    const refs = byId("refs") || document.querySelector("#quarto-bibliography, .references");
    if (refs?.parentElement) refs.parentElement.insertBefore(note, refs.nextSibling);
    else if (main) main.appendChild(note);
  });

  // Interactive objects share one caption/surface treatment.
  ["fig-country-coverage","tbl-series-explorer","fig-series-trajectories","fig-series-missingness"].forEach(id => byId(id)?.classList.add("interactive-object"));

  // Reader-facing table headers and semantic table refinements.
  const renameHeaders = (id, names) => {
    const table = byId(id)?.querySelector("table"); if (!table) return;
    [...table.querySelectorAll("thead th")].forEach((th,i) => {
      if (!names[i]) return;
      if (names[i] === "Unique MEASURE codes") {
        th.replaceChildren(document.createTextNode("Unique "));
        const code = document.createElement("code"); code.textContent = "MEASURE";
        th.append(code, document.createTextNode(" codes"));
      } else {
        th.textContent = names[i];
      }
    });
  };
  renameHeaders("tbl-registered-dataflows", ["Dataset","Agency","Dataflow","Version"]);
  renameHeaders("tbl-database-inventory", ["Dataset","Observation rows","Reference areas","Unique MEASURE codes","First period","Last period"]);

  const inventory = byId("tbl-database-inventory")?.querySelector("table");
  inventory?.querySelectorAll("tbody tr").forEach(tr => {
    [...tr.cells].forEach((td,i) => { if ([1,2,3,4,5].includes(i)) td.classList.add("numeric-cell"); if ([1,2,3].includes(i)) { const n=Number(td.textContent.replaceAll(",","")); if(Number.isFinite(n)) td.textContent=n.toLocaleString(); } });
    if (/current well-being/i.test(tr.cells[0]?.textContent || "")) tr.classList.add("primary-dataset-row");
  });

  // V04: editorial group rows based on the existing reference-table vocabulary.
  const api = byId("tbl-api-reference")?.querySelector("table");
  if (api) {
    const labels = [
      [0,"Endpoints"],[6,"Query construction"],[17,"Formats"],[21,"Operational guidance"]
    ];
    const rows=[...api.tBodies[0].rows];
    labels.reverse().forEach(([index,label])=>{
      const tr=document.createElement("tr"); tr.className="table-section-row";
      const td=document.createElement("td"); td.colSpan=3; td.textContent=label; tr.appendChild(td);
      api.tBodies[0].insertBefore(tr, rows[index] || null);
    });
    api.querySelectorAll("tbody td:first-child strong").forEach(strong => strong.replaceWith(document.createTextNode(strong.textContent)));
    api.querySelectorAll("tbody td:last-child .citation").forEach(citation => {
      const first = citation.firstChild;
      const last = citation.lastChild;
      if (first?.nodeType === Node.TEXT_NODE) first.nodeValue = first.nodeValue.replace(/^\s*\(/, "");
      if (last?.nodeType === Node.TEXT_NODE) last.nodeValue = last.nodeValue.replace(/\)\s*$/, "");
    });
  }

  const selectedSeriesTable = byId("tbl-selected-series")?.querySelector("table");
  selectedSeriesTable?.querySelectorAll("tbody tr").forEach((tr) => {
    const cell = tr.cells[2];
    if (!cell || cell.querySelector("code")) return;
    const value = cell.textContent.trim();
    const code = document.createElement("code");
    code.textContent = value;
    cell.replaceChildren(code);
  });

  const panelObject=byId("tbl-panel-series-summary") || byId("panel-series-summary");
  const panelTable=panelObject?.querySelector("table");
  const panelSummary=panelTable?.querySelector("tbody tr");
  if(panelObject && panelTable && panelSummary){
    const raw=[...panelSummary.cells].map(td=>td.textContent.trim());
    const [series,strongly,weakly,unbalanced,completion,periods]=raw;
    const completionValue=Number(completion);
    const items=[
      {label:"Analytical series", value:series, className:"panel-kpi-series"},
      {label:"Unbalanced", value:unbalanced, meta:`${strongly} strongly balanced · ${weakly} weakly balanced`, className:"panel-kpi-balance"},
      {label:"Median completion", value:Number.isFinite(completionValue)?`${(completionValue*100).toFixed(1)}%`:completion, className:"panel-kpi-completion"},
      {label:"Median periods", value:periods, className:"panel-kpi-periods"}
    ];
    const cards=document.createElement("div");
    cards.className="panel-summary";
    cards.setAttribute("role","group");
    cards.setAttribute("aria-label","Panel summary");
    items.forEach(item=>{
      const card=document.createElement("div"); card.className=`panel-summary-card ${item.className}`;
      const value=document.createElement("strong"); value.textContent=item.value;
      const label=document.createElement("span"); label.textContent=item.label;
      card.append(value,label);
      if(item.meta){const meta=document.createElement("small");meta.textContent=item.meta;card.append(meta);}
      cards.append(card);
    });
    panelObject.id="panel-series-summary";
    panelObject.className="panel-summary-object";
    panelObject.replaceChildren(cards);
  }

  // V12: semantic emphasis without body-column fills.
  byId("tbl-demographic-comparison-summary")?.querySelectorAll("tbody tr").forEach(tr => {
    if (tr.cells[2]) tr.cells[2].classList.add("match-share-cell");
    if (tr.cells[3]) tr.cells[3].classList.add("parent-only-cell");
    if (tr.cells[4]) tr.cells[4].classList.add("specialized-only-cell");
  });

  // Parent-only audit tables: publication-quality headers and deterministic display order.
  const auditHeaders=["Reference area","Measure","Unit","Age","Sex","Education level","Domain","Period","Current well-being value","Specialized value","Classification"];
  ["tbl-age-parent-only-records","tbl-sex-parent-only-records","tbl-education-parent-only-records"].forEach((id, seedIndex) => {
    const table=byId(id)?.querySelector("table"); if(!table) return;
    [...table.querySelectorAll("thead th")].forEach((th,i)=>{ if(auditHeaders[i]) th.textContent=auditHeaders[i]; });
    const body=table.tBodies[0]; if(!body) return;
    const rows=[...body.rows];
    // Fixed deterministic permutation. The source render uses a bounded frozen audit sample.
    rows.sort((a,b)=>{
      const hash=(tr,seed)=>[...tr.textContent].reduce((h,c)=>(h*33+c.charCodeAt(0)+seed)>>>0,5381);
      return hash(a,1701+seedIndex)-hash(b,1701+seedIndex);
    }).forEach(row=>body.appendChild(row));
  });

  // Selected-series caption prefix.
  ["tbl-selected-series","fig-panelview-example"].forEach(id => {
    const cap=byId(id)?.querySelector("figcaption"); if(!cap) return;
    const series=cap.querySelector(".object-caption-series");
    if(series && !cap.querySelector(".series-caption-prefix")) {
      const prefix=document.createElement("span"); prefix.className="series-caption-prefix"; prefix.textContent="Series: ";
      series.before(prefix);
    }
  });

  const sampleCaptionTitles={
    "tbl-age-parent-only-records":"Random sample of up to 20 records classified as available only in Current well-being in the age comparison",
    "tbl-sex-parent-only-records":"Random sample of up to 20 records classified as available only in Current well-being in the sex comparison",
    "tbl-education-parent-only-records":"Random sample of up to 20 records classified as available only in Current well-being in the education-level comparison"
  };
  Object.entries(sampleCaptionTitles).forEach(([id,title])=>{const cap=byId(id)?.querySelector(".object-caption-title");if(cap)cap.textContent=title;});
  const modelCap=byId("tbl-models")?.querySelector("figcaption");
  if(modelCap){const title=modelCap.querySelector(".object-caption-title");if(title){title.textContent="Employment-rate coefficient across specifications";if(!modelCap.querySelector(".object-caption-subtitle")){const sub=document.createElement("span");sub.className="object-caption-subtitle";sub.textContent="N is the fitted-model observation count; Countries and Periods describe the input sample for each specification";title.after(sub);}}}

  // V21: clarify sample counts, add normal-approximation intervals, and group specifications.
  const models=byId("tbl-models")?.querySelector("table");
  if(models){
    const heads=[...models.querySelectorAll("thead th")];
    if(heads[3]) heads[3].textContent="Input countries"; if(heads[4]) heads[4].textContent="Input periods";
    const ciHead=document.createElement("th");ciHead.textContent="Approx. 95% interval";heads.at(-1)?.after(ciHead);
    let lastSample=""; [...models.tBodies[0].rows].forEach(tr=>{
      const sample=tr.cells[0]?.textContent.trim()||""; const model=tr.cells[1]?.textContent.trim().toLowerCase()||"";
      if(sample!==lastSample){tr.classList.add("model-group-start");lastSample=sample;}
      const estimate=Number(tr.cells[5]?.textContent), se=Number(tr.cells[6]?.textContent); const ci=document.createElement("td");
      ci.textContent=Number.isFinite(estimate)&&Number.isFinite(se)?`[${(estimate-1.96*se).toFixed(4)}, ${(estimate+1.96*se).toFixed(4)}]`:"—"; tr.appendChild(ci);
      if(/high-coverage core periods/i.test(sample)&&/two-way|twfe/.test(model))tr.classList.add("preferred-model-row");
    });
  }

  // Table 14: deliberate two-line sample label for the high-coverage core.
  byId("tbl-models")?.querySelectorAll("tbody tr").forEach((tr) => {
    const cell = tr.cells[0];
    if (!cell || !/high-coverage core periods/i.test(cell.textContent || "")) return;
    cell.replaceChildren(document.createTextNode("High-coverage core"), document.createElement("br"), document.createTextNode("periods"));
  });

})();
