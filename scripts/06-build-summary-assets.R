# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: Registered dataflow definitions.
# - data/processed/<dataflow>.rds: Normalized dataflow snapshots.
# - data/processed/panel_inventory.rds: Panel diagnostics.
# - data/processed/current_wellbeing-labels.rds: SDMX labels.
#
# OUTPUTS
# ==============================================================================
# - outputs/tables/database-inventory.csv: Local database inventory.
# - assets/series-inventory.json: Analytical-series summary data.
# - assets/selected-series.json: Selected diagnostic-series metadata.
# - assets/series-data.json: Browser-facing analytical-series observations.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Build Summary Assets
#
# Purpose:
# - Create compact reusable tables for the Quarto site from processed data
#
# Requirements:
# - Processed data and diagnostics created by scripts/03-clean-data.R through scripts/05-compare-dataflows.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Load Dataflow Registry ----
#
#
# ////////////////////////////////////////////////////

# Load the dataflow registry that defines every processed snapshot represented
# in the compact database inventory exported for the site and project reporting
source(here::here("R", "config.R"))

registry <- DATAFLOW_REGISTRY()


# ////////////////////////////////////////////////////
#
#
# 2. Build Database Inventory ----
#
#
# ////////////////////////////////////////////////////

# Read each processed snapshot and bind high-level coverage counts into one
# database inventory rather than exposing large data files to the summary pages
inventory <- purrr::pmap_dfr(
  registry,
  function(key, title, agency, dataflow, version, comparison_dimension) {
    # Read the normalized artifact associated with this registered dataflow
    data <- readRDS(
      here::here(
        "data",
        "processed",
        paste0(key, ".rds")
      )
    )

    tibble::tibble(
      dataset = title,
      data_points = nrow(data),
      reference_areas = if ("REF_AREA" %in% names(data)) dplyr::n_distinct(data$REF_AREA) else NA_integer_,
      measures = if ("MEASURE" %in% names(data)) dplyr::n_distinct(data$MEASURE) else NA_integer_,
      first_period = if ("TIME_PERIOD" %in% names(data)) min(data$TIME_PERIOD, na.rm = TRUE) else NA_character_,
      last_period = if ("TIME_PERIOD" %in% names(data)) max(data$TIME_PERIOD, na.rm = TRUE) else NA_character_
    )
  }
)

# Export the compact database inventory as a stable, inspectable table
readr::write_csv(
  inventory,
  here::here(
    "outputs",
    "tables",
    "database-inventory.csv"
  )
)

# ////////////////////////////////////////////////////
#
#
# 3. Build Analytical Series Explorer Assets ----
#
#
# ////////////////////////////////////////////////////

# Load the series-ID helper used to place observations in the same series groups
# already diagnosed and ranked by the panel-inventory stage
source(here::here("R", "panel_diagnostics.R"))

# Ensure the website asset directory exists before JSON serialization
dir.create(
  here::here("assets"),
  recursive = TRUE,
  showWarnings = FALSE
)

# Read the ranked diagnostic inventory that supplies series metadata and coverage
panel_inventory <- readRDS(
  here::here(
    "data",
    "processed",
    "panel_inventory.rds"
  )
)

# Read observations and the parallel SDMX dictionary needed by browser assets
cwb <- readRDS(
  here::here(
    "data",
    "processed",
    "current_wellbeing.rds"
  )
)

cwb_labels <- readRDS(
  here::here(
    "data",
    "processed",
    "current_wellbeing-labels.rds"
  )
)

# Select browser-oriented names, labels, and diagnostics from the full inventory;
# codes remain alongside labels so the site can retain stable internal identifiers
series_inventory_asset <- panel_inventory |>
  dplyr::transmute(
    series_id = SERIES_ID,
    measure = dplyr::coalesce(MEASURE_LABEL, MEASURE),
    measure_code = MEASURE,
    unit = dplyr::coalesce(UNIT_MEASURE_LABEL, UNIT_MEASURE),
    unit_code = UNIT_MEASURE,
    age = dplyr::coalesce(AGE_LABEL, AGE),
    age_code = AGE,
    sex = dplyr::coalesce(SEX_LABEL, SEX),
    sex_code = SEX,
    education = dplyr::coalesce(EDUCATION_LEV_LABEL, EDUCATION_LEV),
    education_code = EDUCATION_LEV,
    domain = dplyr::coalesce(DOMAIN_LABEL, DOMAIN),
    domain_code = DOMAIN,
    n_units,
    n_periods,
    first_period,
    last_period,
    observed,
    possible,
    completion_rate,
    balance_status
  ) |>
  dplyr::arrange(
    dplyr::desc(completion_rate),
    dplyr::desc(n_periods),
    series_id
  )

# Serialize the full series catalog for the interactive analytical-series explorer
jsonlite::write_json(
  series_inventory_asset,
  path = here::here(
    "assets",
    "series-inventory.json"
  ),
  dataframe = "rows",
  auto_unbox = TRUE,
  pretty = TRUE,
  na = "null"
)

# Select one long-running, most-complete series as the site's default diagnostic view
selected_panel_series_asset <- series_inventory_asset |>
  dplyr::filter(
    n_periods == max(n_periods, na.rm = TRUE)
  ) |>
  dplyr::arrange(
    dplyr::desc(completion_rate),
    series_id
  ) |>
  dplyr::slice(1)

# Save that default selection separately so the browser need not repeat the ranking
jsonlite::write_json(
  selected_panel_series_asset,
  path = here::here(
    "assets",
    "selected-series.json"
  ),
  dataframe = "rows",
  auto_unbox = TRUE,
  pretty = TRUE,
  na = "null"
)

# Extract country labels once for attachment to every browser-facing observation
reference_area_labels <- cwb_labels |>
  dplyr::filter(
    DIMENSION == "REF_AREA"
  ) |>
  dplyr::select(
    REF_AREA = CODE,
    REF_AREA_LABEL = LABEL
  )

# Detect any available source status-label field without assuming one schema variant
status_label_column <- intersect(
  c(
    "OBSERVATION_STATUS",
    "OBS_STATUS_LABEL",
    "OBSERVATION_STATUS_LABEL"
  ),
  names(cwb)
)

# Preserve raw observation status and a display label in normalized auxiliary fields
  dplyr::mutate(
    .OBS_STATUS = if ("OBS_STATUS" %in% names(cwb)) as.character(OBS_STATUS) else NA_character_,
    .OBS_STATUS_LABEL = if (length(status_label_column) > 0L) {
      as.character(.data[[status_label_column[[1]]]])
    } else {
      NA_character_
    }
  )

# Attach the stable series ID, retain annual observations, and reshape fields to
# the concise browser schema consumed by the interactive series display
  dplyr::filter(
    !is.na(TIME_PERIOD_NUMERIC)
  ) |>
  dplyr::left_join(
    reference_area_labels,
    by = "REF_AREA"
  ) |>
  dplyr::transmute(
    SERIES_ID,
    area = dplyr::coalesce(REF_AREA_LABEL, REF_AREA),
    area_code = REF_AREA,
    time = TIME_PERIOD_NUMERIC,
    value = OBS_VALUE,
    status = .OBS_STATUS,
    status_label = .OBS_STATUS_LABEL
  )

# Partition observations by series before serializing a key-addressable JSON object
  dplyr::group_split(
    SERIES_ID,
    .keep = TRUE
  )

# Name each list element by its series ID and remove repeated identifier columns
  purrr::set_names(
    purrr::map_chr(
      series_data_split,
      ~ unique(.x$SERIES_ID)
    )
  ) |>
  purrr::map(
    ~ .x |>
      dplyr::select(
        area,
        area_code,
        time,
        value,
        status,
        status_label
      )
  )

# Write the compact series-to-observations map used by browser-side interaction
jsonlite::write_json(
  series_data_asset,
  path = here::here(
    "assets",
    "series-data.json"
  ),
  dataframe = "rows",
  auto_unbox = TRUE,
  pretty = FALSE,
  na = "null"
)
# FINAL OUTPUT LINE
