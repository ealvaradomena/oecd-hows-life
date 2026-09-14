(() => {
  "use strict";

  const status = document.getElementById("series-detail-status");
  const header = document.getElementById("series-detail-header");
  if (!status || !header) return;

  const params = new URLSearchParams(window.location.search);
  const seriesId = params.get("id");
  const svgNS = "http://www.w3.org/2000/svg";

  const displayValue = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  const formatRate = (value) => {
    if (value === null || Number.isNaN(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(1)}%`;
  };

  const formatObservation = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Missing";
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const formatStatus = (row) => {
    const code = String(row?.status ?? "").trim();
    if (!code) return "";
    const label = String(row?.status_label ?? "").trim();
    return label ? ` · OECD status ${code} — ${label}` : ` · OECD status ${code}`;
  };

  const formatObservationDetails = (row) => `${formatObservation(row?.value)}${formatStatus(row)}`;

  const createTooltip = () => {
    const tooltip = document.createElement("div");
    tooltip.className = "series-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    const move = (event) => {
      const offset = 14;
      const width = tooltip.offsetWidth || 180;
      const height = tooltip.offsetHeight || 36;
      const left = Math.min(event.clientX + offset, window.innerWidth - width - 10);
      const top = Math.min(event.clientY + offset, window.innerHeight - height - 10);
      tooltip.style.left = `${Math.max(10, left)}px`;
      tooltip.style.top = `${Math.max(10, top)}px`;
    };

    return {
      show(text, event) {
        tooltip.textContent = text;
        tooltip.hidden = false;
        move(event);
      },
      move,
      hide() {
        tooltip.hidden = true;
      }
    };
  };

  const tooltip = createTooltip();

  const createDefinitionComponent = (series) => {
    const definitions = [["Measure",series.measure,series.measure_code],["Unit of measure",series.unit,series.unit_code],["Age",series.age,series.age_code],["Sex",series.sex,series.sex_code],["Education level",series.education,series.education_code],["Domain",series.domain,series.domain_code]];
    const grid=document.createElement("div");
    grid.className="series-definition-grid";
    grid.setAttribute("role","group");
    grid.setAttribute("aria-label","Series definition");
    definitions.forEach(([dimension,label,code])=>{
      const item=document.createElement("div"); item.className="series-definition-item";
      const dimensionLabel=document.createElement("span"); dimensionLabel.className="series-definition-dimension"; dimensionLabel.textContent=dimension;
      const value=document.createElement("strong"); value.textContent=displayValue(label);
      const codeValue=document.createElement("code"); codeValue.textContent=displayValue(code);
      item.append(dimensionLabel,value,codeValue);
      grid.appendChild(item);
    });
    return grid;
  };

  const createMetricGrid = (series) => {
    const referenceAreas = Number(series.n_units);
    const periods = Number(series.n_periods);
    const observed = Number(series.observed);
    const possible = Number(series.possible);
    const missing = Number.isFinite(possible) && Number.isFinite(observed)
      ? Math.max(0, possible - observed)
      : null;
    const completion = Number(series.completion_rate);

    const summary = document.createElement("div");
    summary.className = "series-panel-summary";

    const structure = document.createElement("section");
    structure.className = "series-panel-card series-panel-card-structure";
    structure.setAttribute("aria-label", "Panel dimensions");
    structure.innerHTML = `
      <div class="series-panel-eyebrow">Panel dimensions</div>
      <div class="series-panel-equation">
        <span class="series-panel-factor"><strong>${displayValue(series.n_units)}</strong><small>reference areas</small></span>
        <span class="series-panel-operator" aria-hidden="true">×</span>
        <span class="series-panel-factor"><strong>${displayValue(series.n_periods)}</strong><small>time periods</small></span>
        <span class="series-panel-operator" aria-hidden="true">=</span>
        <span class="series-panel-factor series-panel-factor-result"><strong>${displayValue(series.possible)}</strong><small>possible cells</small></span>
      </div>
      <div class="series-panel-period">${displayValue(series.first_period)}–${displayValue(series.last_period)}</div>
    `;

    const coverage = document.createElement("section");
    coverage.className = "series-panel-card series-panel-card-coverage";
    coverage.setAttribute("aria-label", "Observation coverage");
    const completionPercent = Number.isFinite(completion)
      ? Math.max(0, Math.min(100, completion * 100))
      : 0;
    coverage.innerHTML = `
      <div class="series-panel-eyebrow">Observation coverage</div>
      <div class="series-panel-coverage-line">
        <span><strong>${displayValue(series.observed)}</strong><small>observed</small></span>
        <span class="series-panel-fraction-divider">/</span>
        <span><strong>${displayValue(series.possible)}</strong><small>possible</small></span>
        <span class="series-panel-equals" aria-hidden="true">=</span>
        <span class="series-panel-completion"><strong>${formatRate(series.completion_rate)}</strong><small>complete</small></span>
      </div>
    `;

    const statusCard = document.createElement("section");
    const balance = displayValue(series.balance_status);
    const balanced = String(series.balance_status || "").toLowerCase() === "balanced";
    statusCard.className = `series-panel-card series-panel-card-status ${balanced ? "is-balanced" : "is-unbalanced"}`;
    statusCard.setAttribute("aria-label", `Panel balance: ${balance}`);
    const missingText = missing === null
      ? "Balance across reference areas and periods"
      : missing === 0
        ? "No cells are missing"
        : `${missing.toLocaleString()} ${missing === 1 ? "cell" : "cells"} missing`;
    statusCard.innerHTML = `
      <div class="series-panel-status-mark" aria-hidden="true"></div>
      <div>
        <div class="series-panel-status-value">${balance} panel</div>
        <div class="series-panel-status-detail">${missingText}</div>
      </div>
    `;

    summary.append(structure, coverage, statusCard);
    return summary;
  };

  const descriptiveStatistics = (observations) => {
    const values = observations
      .map((row) => row.value)
      .filter((value) => value !== null && Number.isFinite(Number(value)))
      .map(Number);

    if (!values.length) return null;

    const n = values.length;
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const variance = n > 1
      ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (n - 1)
      : 0;

    return {
      n,
      mean,
      sd: Math.sqrt(variance),
      min: Math.min(...values),
      max: Math.max(...values)
    };
  };

  const createStatisticsTable = (observations) => {
    const stats=descriptiveStatistics(observations); const strip=document.createElement("div");strip.className="series-statistics-strip";
    if(!stats){strip.textContent="No non-missing observations are available.";return strip;}
    const magnitude=Math.max(Math.abs(stats.min),Math.abs(stats.max)); const digits=magnitude>=100?1:magnitude>=10?2:3;
    [["N",stats.n,true],["Mean",stats.mean,false],["SD",stats.sd,false],["Min",stats.min,false],["Max",stats.max,false]].forEach(([label,value,count])=>{const item=document.createElement("div");item.className="series-statistic";const val=document.createElement("strong");val.textContent=count?Number(value).toLocaleString():Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});const lab=document.createElement("span");lab.textContent=label;item.append(val,lab);strip.appendChild(item)});
    strip.setAttribute("role","group");strip.setAttribute("aria-label","Descriptive statistics");return strip;
  };

  const createAreaSelectionController = () => {
    let selectedAreaCode = null;
    let selectedPointKey = null;
    const lines = new Map();
    const rows = new Map();
    const buttons = new Map();
    const points = new Map();
    const cells = new Map();
    const hitTargets = new Map();
    const persistentLabels = new Map();

    const update = () => {
      lines.forEach((line, areaCode) => {
        line.classList.toggle("series-area-line-selected", selectedAreaCode === areaCode);
        line.classList.toggle(
          "series-area-line-dimmed",
          selectedAreaCode !== null && selectedAreaCode !== areaCode
        );
      });

      rows.forEach((row, areaCode) => {
        row.classList.toggle("series-missingness-row-selected", selectedAreaCode === areaCode);
      });

      buttons.forEach((button, areaCode) => {
        const selected = selectedAreaCode === areaCode && selectedPointKey === null;
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.title = selected
          ? `Deselect ${button.textContent}`
          : `Highlight ${button.textContent} in the trajectory plot`;
      });

      points.forEach((point, key) => {
        const selected = selectedPointKey === key;
        point.classList.toggle("series-point-selected", selected);
        if (selected && point.parentNode) point.parentNode.appendChild(point);
      });

      cells.forEach((cell, key) => {
        const selected = selectedPointKey === key;
        cell.classList.toggle("series-cell-selected", selected);
        cell.setAttribute("aria-pressed", selected ? "true" : "false");
      });

      persistentLabels.forEach((label, areaCode) => {
        const selected = selectedAreaCode === areaCode;
        label.classList.toggle("series-country-label-active", selected);
        label.setAttribute("aria-hidden", selected ? "false" : "true");
        if (!selected) return;

        const point = selectedPointKey && selectedPointKey.startsWith(`${areaCode}|`)
          ? points.get(selectedPointKey)
          : [...points.entries()].filter(([key]) => key.startsWith(`${areaCode}|`)).at(-1)?.[1];
        if (point) {
          label.setAttribute("x", Number(point.getAttribute("cx")) + 9);
          label.setAttribute("y", Number(point.getAttribute("cy")) - 9);
          if (label.parentNode) label.parentNode.appendChild(label);
        }
      });

      hitTargets.forEach((target, areaCode) => {
        target.setAttribute("aria-pressed", selectedAreaCode === areaCode ? "true" : "false");
      });
    };

    return {
      registerLine(areaCode, line) {
        lines.set(areaCode, line);
        update();
      },
      registerRow(areaCode, row, button) {
        rows.set(areaCode, row);
        buttons.set(areaCode, button);
        update();
      },
      registerPoint(areaCode, time, point) {
        points.set(`${areaCode}|${time}`, point);
        update();
      },
      registerCell(areaCode, time, cell) {
        cells.set(`${areaCode}|${time}`, cell);
        update();
      },
      registerHitTarget(areaCode, target) {
        hitTargets.set(areaCode, target);
        update();
      },
      registerLabel(areaCode, label) {
        persistentLabels.set(areaCode, label);
        update();
      },
      toggle(areaCode) {
        if (selectedAreaCode === areaCode && selectedPointKey === null) {
          selectedAreaCode = null;
        } else {
          selectedAreaCode = areaCode;
        }
        selectedPointKey = null;
        update();
      },
      selectPoint(areaCode, time) {
        const key = `${areaCode}|${time}`;
        if (selectedPointKey === key) {
          selectedAreaCode = null;
          selectedPointKey = null;
        } else {
          selectedAreaCode = areaCode;
          selectedPointKey = key;
        }
        update();
      }
    };
  };

  const createMissingness = (observations, selection) => {
    const areas = [...new Map(observations.map((row) => [row.area_code, row.area])).entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const times = [...new Set(observations.map((row) => Number(row.time)))].sort((a, b) => a - b);
    const cells = new Map(
      observations.map((row) => [`${row.area_code}|${row.time}`, row])
    );

    const outer = document.createElement("div");
    outer.className = "series-missingness-wrapper";

    const table = document.createElement("table");
    table.className = "series-missingness";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "";
    corner.setAttribute("aria-label", "Reference area");
    headerRow.appendChild(corner);

    times.forEach((time) => {
      const th = document.createElement("th");
      th.textContent = time;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    areas.forEach(([areaCode, areaLabel]) => {
      const row = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";

      const labelButton = document.createElement("button");
      labelButton.type = "button";
      labelButton.className = "series-area-select";
      labelButton.textContent = areaLabel || areaCode;
      labelButton.setAttribute("aria-pressed", "false");
      labelButton.addEventListener("click", () => selection.toggle(areaCode));
      label.appendChild(labelButton);
      row.appendChild(label);
      selection.registerRow(areaCode, row, labelButton);

      times.forEach((time) => {
        const td = document.createElement("td");
        const observation = cells.get(`${areaCode}|${time}`);
        const value = observation?.value;
        const observed = value !== null && value !== undefined && Number.isFinite(Number(value));
        const context = observed
          ? `${areaLabel || areaCode}, ${time}: ${formatObservationDetails(observation)}`
          : `${areaLabel || areaCode}, ${time}: Missing${formatStatus(observation)}`;

        td.className = observed ? "series-cell-observed" : "series-cell-missing";
        td.setAttribute("aria-label", context);
        td.title = context;
        td.addEventListener("mouseenter", (event) => tooltip.show(context, event));
        td.addEventListener("mousemove", tooltip.move);
        td.addEventListener("mouseleave", tooltip.hide);

        if (observed) {
          td.tabIndex = 0;
          td.setAttribute("role", "button");
          td.setAttribute("aria-pressed", "false");
          selection.registerCell(areaCode, time, td);
          const select = () => selection.selectPoint(areaCode, time);
          td.addEventListener("click", select);
          td.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              select();
            }
          });
        }

        row.appendChild(td);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    outer.appendChild(table);

    const legend = document.createElement("div");
    legend.className = "series-missingness-legend";
    legend.innerHTML = '<span><i class="series-cell-observed"></i>Observed</span><span><i class="series-cell-missing"></i>Missing</span>';

    const details = document.createElement("div"); details.className="series-selection-details"; details.setAttribute("aria-live","polite"); details.textContent="Select an observed cell to keep its reference area, year, value, and OECD status visible.";
    table.querySelectorAll("td[role=button]").forEach(cell => cell.addEventListener("click", () => { details.textContent = cell.getAttribute("aria-label") || "Selected observation"; }));
    const container = document.createElement("div");
    container.append(legend, outer, details);
    return container;
  };

  const createTrajectoryPlot = (observations, selection) => {
    const observed = observations.filter((row) =>
      row.value !== null && Number.isFinite(Number(row.value)) && Number.isFinite(Number(row.time))
    );

    const container = document.createElement("div");
    container.className = "series-trajectory-wrapper";

    if (!observed.length) {
      container.textContent = "No non-missing observations are available for plotting.";
      return container;
    }

    const width = 900;
    const height = 430;
    const margin = { top: 24, right: 130, bottom: 58, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const times = observed.map((row) => Number(row.time));
    const values = observed.map((row) => Number(row.value));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (minValue === maxValue) {
      minValue -= 0.5;
      maxValue += 0.5;
    }

    const x = (time) => margin.left + ((time - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
    const y = (value) => margin.top + (1 - ((value - minValue) / (maxValue - minValue))) * plotHeight;

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "series-trajectory-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Reference-area trajectories over time");

    const axisX = document.createElementNS(svgNS, "line");
    axisX.setAttribute("x1", margin.left);
    axisX.setAttribute("x2", width - margin.right);
    axisX.setAttribute("y1", height - margin.bottom);
    axisX.setAttribute("y2", height - margin.bottom);
    axisX.setAttribute("class", "series-axis");
    svg.appendChild(axisX);

    const axisY = document.createElementNS(svgNS, "line");
    axisY.setAttribute("x1", margin.left);
    axisY.setAttribute("x2", margin.left);
    axisY.setAttribute("y1", margin.top);
    axisY.setAttribute("y2", height - margin.bottom);
    axisY.setAttribute("class", "series-axis");
    svg.appendChild(axisY);

    const byArea = new Map();
    observed.forEach((row) => {
      if (!byArea.has(row.area_code)) byArea.set(row.area_code, []);
      byArea.get(row.area_code).push(row);
    });

    byArea.forEach((rows) => {
      rows.sort((a, b) => Number(a.time) - Number(b.time));
      const areaCode = rows[0].area_code;
      const areaLabel = rows[0].area || areaCode;
      const points = rows.map((row) => `${x(Number(row.time))},${y(Number(row.value))}`).join(" ");

      const polyline = document.createElementNS(svgNS, "polyline");
      polyline.setAttribute("points", points);
      polyline.setAttribute("class", "series-area-line");
      polyline.dataset.areaCode = areaCode;
      polyline.setAttribute("aria-label", areaLabel);
      svg.appendChild(polyline);
      selection.registerLine(areaCode, polyline);

      const hitLine = document.createElementNS(svgNS, "polyline");
      hitLine.setAttribute("points", points);
      hitLine.setAttribute("class", "series-line-hit-target");
      hitLine.setAttribute("tabindex", "0");
      hitLine.setAttribute("role", "button");
      hitLine.setAttribute("aria-label", `Highlight ${areaLabel} trajectory`);
      hitLine.setAttribute("aria-pressed", "false");
      hitLine.addEventListener("mouseenter", (event) => {
        polyline.classList.add("series-area-line-hovered");
        tooltip.show(areaLabel, event);
      });
      hitLine.addEventListener("mousemove", tooltip.move);
      hitLine.addEventListener("mouseleave", () => {
        polyline.classList.remove("series-area-line-hovered");
        tooltip.hide();
      });
      const selectArea = () => selection.toggle(areaCode);
      hitLine.addEventListener("click", selectArea);
      hitLine.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectArea();
        }
      });
      svg.appendChild(hitLine);
      selection.registerHitTarget(areaCode, hitLine);

      rows.forEach((row) => {
        const point = document.createElementNS(svgNS, "circle");
        point.setAttribute("cx", x(Number(row.time)));
        point.setAttribute("cy", y(Number(row.value)));
        point.setAttribute("r", 5);
        point.setAttribute("class", "series-point");
        point.setAttribute(
          "aria-label",
          `${areaLabel}, ${row.time}: ${formatObservationDetails(row)}`
        );
        svg.appendChild(point);
        selection.registerPoint(areaCode, row.time, point);
      });

      const persistentLabel = document.createElementNS(svgNS, "text");
      persistentLabel.setAttribute("class", "series-country-label");
      persistentLabel.setAttribute("aria-hidden", "true");
      persistentLabel.textContent = areaLabel;
      svg.appendChild(persistentLabel);
      selection.registerLabel(areaCode, persistentLabel);
    });

    const byTime = new Map();
    observed.forEach((row) => {
      const time = Number(row.time);
      if (!byTime.has(time)) byTime.set(time, []);
      byTime.get(time).push(Number(row.value));
    });

    const means = [...byTime.entries()]
      .map(([time, vals]) => [time, vals.reduce((a, b) => a + b, 0) / vals.length])
      .sort((a, b) => a[0] - b[0]);

    const meanLine = document.createElementNS(svgNS, "polyline");
    meanLine.setAttribute(
      "points",
      means.map(([time, value]) => `${x(time)},${y(value)}`).join(" ")
    );
    meanLine.setAttribute("class", "series-mean-line");
    svg.appendChild(meanLine);

    const ticks = 5;
    for (let index = 0; index <= ticks; index += 1) {
      const value = minValue + ((maxValue - minValue) * index / ticks);
      const yy = y(value);
      const tick = document.createElementNS(svgNS, "text");
      tick.setAttribute("x", margin.left - 10);
      tick.setAttribute("y", yy + 4);
      tick.setAttribute("text-anchor", "end");
      tick.setAttribute("class", "series-axis-label");
      tick.textContent = value.toFixed(2);
      svg.appendChild(tick);
    }

    const span = Math.max(1, maxTime - minTime);
    const step = span <= 12 ? 2 : Math.ceil(span / 8);
    const timeTicks = []; for (let t = minTime; t <= maxTime; t += step) timeTicks.push(t); if (!timeTicks.includes(maxTime)) timeTicks.push(maxTime);
    timeTicks.forEach((time) => {
      const tick = document.createElementNS(svgNS, "text");
      tick.setAttribute("x", x(time));
      tick.setAttribute("y", height - margin.bottom + 25);
      tick.setAttribute("text-anchor", "middle");
      tick.setAttribute("class", "series-axis-label");
      tick.textContent = time;
      svg.appendChild(tick);
    });

    const legend = document.createElement("div");
    legend.className = "series-trajectory-legend";
    legend.innerHTML = '<span><i class="series-area-line-key"></i>Reference areas</span><span><i class="series-mean-line-key"></i>Mean</span>';

    container.append(legend, svg);
    return container;
  };

  const updateSeriesCaptions = (series) => {
    document.querySelectorAll("[data-series-caption]").forEach((node) => {
      node.textContent = series.measure;
    });
    document.querySelectorAll("[data-series-unit]").forEach((node) => {
      node.textContent = displayValue(series.unit);
    });
  };

  const renderSeries = (series, observations) => {
    status.remove();

    const title = document.createElement("h2");
    title.className = "series-detail-title";
    title.textContent = series.measure;

    const subtitle = document.createElement("p");
    subtitle.className = "series-detail-subtitle";
    subtitle.textContent = `${series.domain} · ${series.unit}`;
    header.replaceChildren(title, subtitle);
    updateSeriesCaptions(series);

    const areaSelection = createAreaSelectionController();
    document.getElementById("series-definition-content").replaceChildren(createDefinitionComponent(series));
    document.getElementById("series-metrics").replaceChildren(createMetricGrid(series));
    document.getElementById("series-statistics").replaceChildren(createStatisticsTable(observations));
    document.getElementById("series-trajectories").replaceChildren(
      createTrajectoryPlot(observations, areaSelection)
    );
    document.getElementById("series-missingness").replaceChildren(
      createMissingness(observations, areaSelection)
    );
  };

  const fail = (message) => {
    status.className = "series-error";
    status.textContent = message;
  };

  if (!seriesId) {
    fail("No analytical series was selected. Open this page from the Analytical Series Explorer.");
    return;
  }

  Promise.all([
    fetch("../assets/series-inventory.json").then((response) => {
      if (!response.ok) throw new Error(`Inventory HTTP ${response.status}`);
      return response.json();
    }),
    fetch("../assets/series-data.json").then((response) => {
      if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
      return response.json();
    }),
    fetch("../assets/series-status.json").then((response) => response.ok ? response.json() : {})
  ])
    .then(([inventory, data, statusData]) => {
      const series = inventory.find((row) => row.series_id === seriesId);
      if (!series) throw new Error("The selected SERIES_ID is not present in the inventory");
      const statusByPoint = new Map(
        (statusData[seriesId] || []).map((row) => [`${row.area_code}|${row.time}`, row])
      );
      const observations = (data[seriesId] || []).map((row) => ({
        ...row,
        ...(statusByPoint.get(`${row.area_code}|${row.time}`) || {})
      }));
      renderSeries(series, observations);
    })
    .catch((error) => {
      fail(`The selected analytical series could not be loaded (${error.message}).`);
    });
})();
