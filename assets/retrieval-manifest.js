(() => {
  "use strict";
  const container = document.getElementById("retrieval-manifest-summary");
  if (!container) return;
  fetch("../assets/retrieval-manifest.json").then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
    if(!data.available){container.textContent=data.message;return;}
    const rows=data.rows.filter(row=>row.resource_type==="data" && String(row.retrieved_at_utc || "").trim());
    const table=document.createElement("table");
    table.innerHTML="<thead><tr><th>Dataset</th><th>Dataflow</th><th>Version</th><th>Version Retrieved</th><th>SHA-256</th></tr></thead>";
    const body=document.createElement("tbody");
    rows.forEach(item=>{
      const tr=document.createElement("tr");
      [item.title,item.dataflow,item.version].forEach(value=>{const td=document.createElement("td");td.textContent=value||"—";tr.appendChild(td);});
      const retrieved=document.createElement("td");
      const stamp=String(item.retrieved_at_utc||"").trim();
      if(stamp){const normalized=stamp.replace("T"," ").replace(/Z$/," UTC");const parts=normalized.split(/\s+/);const date=document.createElement("span");date.textContent=parts[0]||"—";const time=document.createElement("span");time.textContent=`${(parts[1]||"").replace(/\.\d+$/g,"")} UTC`.replace(" UTC UTC"," UTC");retrieved.append(date,document.createElement("br"),time);}else{retrieved.textContent="—";} tr.appendChild(retrieved);
      const hash=document.createElement("td"); const full=item.sha256||""; hash.textContent=full?`${full.slice(0,5)}...`:"—"; if(full){hash.className="hash-cell";} tr.appendChild(hash);
      body.appendChild(tr);
    }); table.appendChild(body); container.replaceChildren(table);
  }).catch(error=>{container.textContent=`Retrieval-manifest information could not be loaded (${error.message}).`;});
})();
