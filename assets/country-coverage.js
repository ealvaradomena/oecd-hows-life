(() => {
  "use strict";

  const root = document.getElementById("country-coverage-matrix") ||
    document.getElementById("country-coverage");
  if (!root) return;

  const scriptUrl = new URL(document.currentScript.src);
  const assetBase = new URL(".", scriptUrl);
  const siteBase = new URL("../", assetBase);
  let inventory = [];
  let seriesData = {};
  let coverage = new Map();
  let areas = [];
  let filtered = [];
  let selectedArea = "";
  let onlyObserved = false;
  let query = "";

  const tooltip = document.createElement("div");
  tooltip.className = "series-tooltip";
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  const moveTooltip = (event) => {
    const offset = 14;
    const width = tooltip.offsetWidth || 190;
    const height = tooltip.offsetHeight || 45;
    tooltip.style.left = `${Math.max(10, Math.min(event.clientX + offset, window.innerWidth - width - 10))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(event.clientY + offset, window.innerHeight - height - 10))}px`;
  };

  const showTooltip = (text, event) => {
    tooltip.textContent = text;
    tooltip.hidden = false;
    moveTooltip(event);
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  const searchableText = (series) => [
    series.measure,
    series.measure_code,
    series.unit,
    series.unit_code,
    series.age,
    series.age_code,
    series.sex,
    series.sex_code,
    series.education,
    series.education_code,
    series.domain,
    series.domain_code,
    series.series_id
  ].filter(Boolean).join(" ").toLowerCase();

  const seriesLabel = (series) => {
    const subgroup = [series.age, series.sex, series.education]
      .filter((value) => value && value !== "Total")
      .join(" · ");
    return subgroup ? `${series.measure} — ${subgroup}` : series.measure;
  };

  const key = (seriesId, areaCode) => `${seriesId}|${areaCode}`;

  const applyFilters = () => {
    filtered = inventory.filter((series) => {
      const matchesQuery = !query || searchableText(series).includes(query);
      const matchesArea = !onlyObserved || !selectedArea || (coverage.get(key(series.series_id, selectedArea)) || 0) > 0;
      return matchesQuery && matchesArea;
    });
    renderMatrix();
  };

  const buildControls = () => {
    const controls = document.createElement("div");
    controls.className = "country-coverage-controls";

    const searchControl = document.createElement("div");
    searchControl.className = "country-coverage-control";
    const searchLabel = document.createElement("label");
    searchLabel.htmlFor = "coverage-series-search";
    searchLabel.textContent = "Search analytical series";
    const search = document.createElement("input");
    search.id = "coverage-series-search";
    search.type = "search";
    search.placeholder = "Measure, domain, subgroup, unit, or SDMX code";
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      applyFilters();
    });
    searchControl.append(searchLabel, search);

    const areaControl = document.createElement("div");
    areaControl.className = "country-coverage-control";
    const areaLabel = document.createElement("label");
    areaLabel.htmlFor = "coverage-area-select";
    areaLabel.textContent = "Reference area";
    const select = document.createElement("select");
    select.id = "coverage-area-select";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All reference areas";
    select.appendChild(all);
    areas.forEach(([code, label]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = label || code;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      selectedArea = select.value;
      if (!selectedArea) onlyObserved = false;
      applyFilters();
      syncCheck();
    });
    areaControl.append(areaLabel, select);

    const check = document.createElement("label");
    check.className = "country-coverage-check";
    const checkbox = document.createElement("input");
    checkbox.id = "coverage-only-observed";
    checkbox.type = "checkbox";
    checkbox.disabled = !selectedArea;
    checkbox.addEventListener("change", () => {
      onlyObserved = checkbox.checked;
      applyFilters();
    });
    const checkText = document.createElement("span");
    checkText.textContent = "Show only series with observations for the selected reference area";
    check.append(checkbox, checkText);

    const syncCheck = () => {
      checkbox.disabled = !selectedArea;
      checkbox.checked = onlyObserved;
    };
    controls.syncCheck = syncCheck;
    controls.append(searchControl, areaControl, check);
    return controls;
  };

  let controls = null;
  const syncCheck = () => {
    if (controls && controls.syncCheck) controls.syncCheck();
  };

  const orderedAreas = () => {
    if (!selectedArea) return areas;
    const selected = areas.find(([code]) => code === selectedArea);
    return selected ? [selected, ...areas.filter(([code]) => code !== selectedArea)] : areas;
  };

  const renderMatrix = () => {
    root.querySelector(".country-coverage-wrapper")?.remove();
    root.querySelector(".country-coverage-legend")?.remove();
    root.querySelector(".country-coverage-summary")?.remove();
    root.querySelector(".country-coverage-details")?.remove();
    root.querySelector(".country-coverage-footer")?.remove();

    const rows = filtered;
    const displayAreas = orderedAreas();

    const summary = document.createElement("div");
    summary.className = "country-coverage-summary";
    const hasActiveSummary = Boolean(selectedArea || query || filtered.length !== inventory.length);
    if (hasActiveSummary) {
      const summaryHint = document.createElement("span");
      summaryHint.textContent = selectedArea
        ? `Selected: ${areas.find(([code]) => code === selectedArea)?.[1] || selectedArea}`
        : "Filtered analytical series";
      const summaryCount = document.createElement("strong");
      summaryCount.textContent = `${filtered.length.toLocaleString()} of ${inventory.length.toLocaleString()} analytical series`;
      summary.append(summaryHint, summaryCount);
    }

    const legend = document.createElement("div");
    legend.className = "country-coverage-legend";
    legend.innerHTML = '<span><i class="coverage-none"></i>No observations</span><span><i class="coverage-some"></i>Partial coverage</span><span><i class="coverage-complete"></i>Complete on series support</span>';

    const details = document.createElement("div");
    details.className = "country-coverage-details";
    details.setAttribute("aria-live", "polite");
    details.textContent = "Select a matrix cell to keep its coverage details visible.";

    const wrapper = document.createElement("div");
    wrapper.className = "country-coverage-wrapper";
    const table = document.createElement("table");
    table.className = "country-coverage-table";

    const thead = document.createElement("thead");
    const head = document.createElement("tr");
    const seriesHead = document.createElement("th");
    seriesHead.scope = "col";
    seriesHead.textContent = "Analytical series";
    head.appendChild(seriesHead);
    displayAreas.forEach(([code, label]) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label || code;
      th.title = `${label || code} (${code})`;
      if (code === selectedArea) th.classList.add("country-coverage-selected");
      head.appendChild(th);
    });
    thead.appendChild(head);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = displayAreas.length + 1;
      td.className = "series-empty";
      td.textContent = "No analytical series match the current filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach((series) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        const link = document.createElement("a");
        link.href = new URL(
          `analysis/series.html?id=${encodeURIComponent(series.series_id)}`,
          siteBase
        ).toString();
        const fullSeriesLabel = seriesLabel(series);
        link.textContent = fullSeriesLabel;
        link.title = fullSeriesLabel;
        link.setAttribute("aria-label", `Open analytical series: ${fullSeriesLabel}`);
        th.appendChild(link);
        tr.appendChild(th);

        displayAreas.forEach(([areaCode, areaLabel]) => {
          const count = coverage.get(key(series.series_id, areaCode)) || 0;
          const periods = Number(series.n_periods) || 0;
          const td = document.createElement("td");
          const complete = periods > 0 && count === periods;
          const coverageRatio = periods > 0 ? Math.min(1, count / periods) : 0;
          td.className = count === 0
            ? "coverage-none"
            : complete
              ? "coverage-complete"
              : "coverage-some";
          if (count > 0) td.style.setProperty("--coverage-ratio", coverageRatio.toFixed(4));
          if (areaCode === selectedArea) td.classList.add("country-coverage-selected");
          const text = `${areaLabel || areaCode}: ${count} of ${periods} periods observed for ${series.measure}`;
          td.setAttribute("aria-label", text);
          td.title = text;
          td.tabIndex = 0;
          td.setAttribute("role", "button");
          const selectCell = () => {
            root.querySelectorAll(".country-coverage-cell-selected").forEach(cell => cell.classList.remove("country-coverage-cell-selected"));
            td.classList.add("country-coverage-cell-selected");
            details.textContent = text;
          };
          td.addEventListener("click", selectCell);
          td.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCell(); } });
          td.addEventListener("mouseenter", (event) => showTooltip(text, event));
          td.addEventListener("mousemove", moveTooltip);
          td.addEventListener("mouseleave", hideTooltip);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);

    root.append(...(hasActiveSummary ? [summary] : []), legend, wrapper, details);
  };

  Promise.all([
    fetch(new URL("series-inventory.json", assetBase)).then((response) => {
      if (!response.ok) throw new Error(`Inventory HTTP ${response.status}`);
      return response.json();
    }),
    fetch(new URL("series-data.json", assetBase)).then((response) => {
      if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
      return response.json();
    })
  ])
    .then(([inventoryData, observations]) => {
      inventory = inventoryData.slice().sort((a, b) =>
        String(a.measure).localeCompare(String(b.measure)) ||
        String(a.series_id).localeCompare(String(b.series_id))
      );
      seriesData = observations;

      const areaMap = new Map();
      Object.entries(seriesData).forEach(([seriesId, rows]) => {
        const counts = new Map();
        rows.forEach((row) => {
          if (!row.area_code) return;
          areaMap.set(row.area_code, row.area || row.area_code);
          if (row.value !== null && Number.isFinite(Number(row.value))) {
            counts.set(row.area_code, (counts.get(row.area_code) || 0) + 1);
          }
        });
        counts.forEach((count, areaCode) => coverage.set(key(seriesId, areaCode), count));
      });

      areas = [...areaMap.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      filtered = inventory.slice();
      root.replaceChildren();
      controls = buildControls();
      root.appendChild(controls);
      renderMatrix();
    })
    .catch((error) => {
      root.innerHTML = "";
      const message = document.createElement("p");
      message.className = "series-error";
      message.textContent = `Country coverage could not be loaded (${error.message}). Rebuild the analytical assets before rendering the site.`;
      root.appendChild(message);
    });
})();
