(() => {
  "use strict";

  const selectedSeriesUrl = "../assets/selected-series.json";
  const seriesDataUrl = "../assets/series-data.json";

  const selectedSeriesName = (selected) => String(selected?.measure || "").trim();

  const applySelectedSeriesName = (selected) => {
    const name = selectedSeriesName(selected);
    if (!name) return;

    document.querySelectorAll("[data-selected-series-name]").forEach((node) => {
      node.textContent = name;
    });

    ["tbl-selected-series", "fig-panelview-example"].forEach((id) => {
      const object = document.getElementById(id);
      const caption = object?.querySelector("figcaption");
      if (!caption) return;

      let series = caption.querySelector(".object-caption-series");
      if (!series) {
        series = document.createElement("span");
        series.className = "object-caption-series";
        caption.appendChild(series);
      }
      series.textContent = name;
      if (!series.previousElementSibling?.classList.contains("series-caption-prefix")) { const prefix=document.createElement("span"); prefix.className="series-caption-prefix"; prefix.textContent="Series: "; series.before(prefix); }
    });
  };

  const enhancePanelView = (selected, data) => {
    const figure = document.getElementById("fig-panelview-example");
    if (!figure) return;

    const target = figure.querySelector("figure > div[aria-describedby]");
    if (!target) return;

    const makeKey = (area, time) => `${area}|${time}`;
    const observations = data[selected.series_id] || [];
    if (!observations.length) return;

    const areas = [...new Map(observations.map((row) => [row.area_code, row.area])).entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const periods = [...new Set(observations.map((row) => Number(row.time)))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const observed = new Set(
      observations
        .filter((row) => row.value !== null && Number.isFinite(Number(row.value)))
        .map((row) => makeKey(row.area_code, Number(row.time)))
    );

    const shell = document.createElement("div");
    shell.className = "panelview-browser-figure";

    const legend = document.createElement("div");
    legend.className = "panelview-legend";
    legend.setAttribute("aria-label", "Observation status legend");
    legend.innerHTML = '<span><i class="panelview-observed-key"></i>Observed</span><span><i class="panelview-missing-key"></i>Missing</span>';

    const scroller = document.createElement("div");
    scroller.className = "panelview-matrix-scroll";
    const table = document.createElement("table");
    table.className = "panelview-matrix";
    table.setAttribute("aria-label", `Reference area–time-period missingness for ${selected.measure}`);

    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "Reference area";
    header.appendChild(corner);
    periods.forEach((period) => {
      const th = document.createElement("th");
      th.textContent = period;
      header.appendChild(th);
    });
    thead.appendChild(header);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    areas.forEach(([areaCode, areaLabel]) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = areaCode;
      th.title = areaLabel || areaCode;
      tr.appendChild(th);
      periods.forEach((period) => {
        const td = document.createElement("td");
        const isObserved = observed.has(makeKey(areaCode, period));
        td.className = isObserved ? "panelview-cell-observed" : "panelview-cell-missing";
        td.title = `${areaLabel || areaCode}, ${period}: ${isObserved ? "Observed" : "Missing"}`;
        td.setAttribute("aria-label", td.title);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroller.appendChild(table);
    shell.append(legend, scroller);
    target.replaceChildren(shell);
  };

  fetch(selectedSeriesUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Selected-series HTTP ${response.status}`);
      return response.json();
    })
    .then((selectedRaw) => {
      const selected = Array.isArray(selectedRaw) ? selectedRaw[0] : selectedRaw;
      applySelectedSeriesName(selected);

      return fetch(seriesDataUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Series-data HTTP ${response.status}`);
          return response.json();
        })
        .then((data) => enhancePanelView(selected, data));
    })
    .catch(() => {
      // Keep frozen content as the fallback if local presentation assets fail.
    });
})();
