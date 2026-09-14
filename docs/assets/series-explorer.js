(() => {
  "use strict";

  const root = document.getElementById("series-explorer");
  if (!root) return;

  let inventory = [];
  let filtered = [];
  let searchQuery = "";
  let selectedDomain = "";
  let sortKey = "completion_rate";
  let sortDirection = "desc";

  const formatRate = (value) => {
    if (value === null || Number.isNaN(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(1)}%`;
  };

  const displayValue = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  const isTotal = (code, label) => code === "_T" || String(label).toLowerCase() === "total";

  const seriesClassifications = (row) => {
    const ageTotal = isTotal(row.age_code, row.age);
    const sexTotal = isTotal(row.sex_code, row.sex);
    const educationTotal = isTotal(row.education_code, row.education);
    if (ageTotal && sexTotal && educationTotal) return ["Aggregate"];

    const labels = [];
    if (!ageTotal) labels.push("By Age");
    if (!educationTotal) labels.push("By Education");
    if (!sexTotal) labels.push("By Sex");
    return labels;
  };

  const isAggregateSeries = (row) => seriesClassifications(row).includes("Aggregate");

  const applyFilters = () => {
    filtered = inventory.filter((row) => {
      const matchesSearch = !searchQuery || Object.values(row).some((value) =>
        value !== null && String(value).toLowerCase().includes(searchQuery)
      );
      const matchesDomain = !selectedDomain || row.domain === selectedDomain;
      return matchesSearch && matchesDomain;
    });
    renderTable();
  };

  function buildControls() {
    const controls = document.createElement("div");
    controls.className = "series-explorer-controls";

    const searchGroup = document.createElement("div");
    searchGroup.className = "series-control-group";
    const label = document.createElement("label");
    label.setAttribute("for", "series-search");
    label.textContent = "Search analytical series";

    const input = document.createElement("input");
    input.id = "series-search";
    input.type = "search";
    input.placeholder = "Measure, subgroup, unit, or SDMX code";
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      searchQuery = input.value.trim().toLowerCase();
      applyFilters();
    });
    searchGroup.append(label, input);

    const domainGroup = document.createElement("div");
    domainGroup.className = "series-control-group series-domain-control";
    const domainLabel = document.createElement("label");
    domainLabel.setAttribute("for", "series-domain");
    domainLabel.textContent = "Domain";
    const domainSelect = document.createElement("select");
    domainSelect.id = "series-domain";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All domains";
    domainSelect.appendChild(all);
    [...new Set(inventory.map((row) => row.domain).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .forEach((domain) => {
        const option = document.createElement("option");
        option.value = domain;
        option.textContent = domain;
        domainSelect.appendChild(option);
      });
    domainSelect.addEventListener("change", () => {
      selectedDomain = domainSelect.value;
      applyFilters();
    });
    domainGroup.append(domainLabel, domainSelect);

    controls.append(searchGroup, domainGroup);
    return controls;
  }

  function renderTable() {
    const oldWrapper = root.querySelector(".series-table-wrapper");
    const oldFooter = root.querySelector(".series-table-footer");
    if (oldWrapper) oldWrapper.remove();
    if (oldFooter) oldFooter.remove();

    const rows = filtered.slice().sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      let comparison;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && left !== "" && right !== "") {
        comparison = leftNumber - rightNumber;
      } else {
        comparison = String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    const wrapper = document.createElement("div");
    wrapper.className = "series-table-wrapper";

    const table = document.createElement("table");
    table.className = "series-table";

    const columns = [
      ["view", "View"],
      ["measure", "Measure"],
      ["unit", "Unit"],
      ["age", "Age"],
      ["sex", "Sex"],
      ["education", "Education"],
      ["domain", "Domain"],
      ["n_units", "Areas"],
      ["n_periods", "Periods"],
      ["completion_rate", "Completion"],
      ["balance_status", "Balance"]
    ];

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach(([key, label]) => {
      const th = document.createElement("th");
      th.scope = "col";
      if (key === "view") {
        const accessibleLabel = document.createElement("span");
        accessibleLabel.className = "visually-hidden";
        accessibleLabel.textContent = label;
        th.appendChild(accessibleLabel);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "series-sort-button";
        button.textContent = label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (sortKey === key) sortDirection = sortDirection === "asc" ? "desc" : "asc";
          else { sortKey = key; sortDirection = "asc"; }
          renderTable();
        });
        th.appendChild(button);
        th.setAttribute("aria-sort", sortKey === key ? (sortDirection === "asc" ? "ascending" : "descending") : "none");
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "series-empty";
      td.textContent = "No analytical series match this search.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.className = "series-clickable-row";
        if (isAggregateSeries(row)) tr.classList.add("series-total-row");
        tr.tabIndex = 0;
        tr.setAttribute("role", "link");
        tr.setAttribute("aria-label", `Open ${displayValue(row.measure)}`);

        const openSeries = () => {
          window.location.href = `series.html?id=${encodeURIComponent(row.series_id)}`;
        };

        tr.addEventListener("click", openSeries);
        tr.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openSeries();
          }
        });

        columns.forEach(([key]) => {
          const td = document.createElement("td");
          if (key === "completion_rate") {
            const rate = Number(row[key]);
            const label = document.createElement("span"); label.textContent = formatRate(rate);
            const bar = document.createElement("span"); bar.className = "series-completion-mini";
            const fill = document.createElement("i"); fill.style.width = `${Math.max(0, Math.min(100, rate * 100))}%`; bar.appendChild(fill);
            td.append(label, bar);
          } else if (key === "view") {
            td.className = "series-view-cell"; td.textContent = "View";
          } else { td.textContent = displayValue(row[key]); }

          if (key === "measure") {
            seriesClassifications(row).forEach((classification) => {
              const badge = document.createElement("span");
              badge.className = "series-classification-badge";
              badge.dataset.classification = classification.toLowerCase().replaceAll(" ", "-");
              badge.textContent = classification;
              td.appendChild(badge);
            });
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);
    root.appendChild(wrapper);

    const footer = document.createElement("div");
    footer.className = "series-table-footer";

    const count = document.createElement("span");
    count.textContent = filtered.length === inventory.length
      ? `${inventory.length.toLocaleString()} analytical series`
      : `${filtered.length.toLocaleString()} of ${inventory.length.toLocaleString()} analytical series`;
    footer.appendChild(count);
    root.appendChild(footer);
  }

  fetch("../assets/series-inventory.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      inventory = data.slice().sort((a, b) =>
        Number(b.completion_rate ?? -Infinity) - Number(a.completion_rate ?? -Infinity)
      );
      filtered = inventory.slice();
      root.replaceChildren(buildControls());
      renderTable();
    })
    .catch((error) => {
      root.innerHTML = "";
      const message = document.createElement("p");
      message.className = "series-error";
      message.textContent = `The analytical series inventory could not be loaded (${error.message}). Rebuild the analytical assets before rendering the site.`;
      root.appendChild(message);
    });
})();
