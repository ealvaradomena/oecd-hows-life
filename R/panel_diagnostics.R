# ==============================================================================
# INPUTS
# ==============================================================================
# - None; helper functions operate on in-memory data supplied by callers.
#
# OUTPUTS
# ==============================================================================
# - None.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Panel Diagnostic Helpers
#
# Purpose:
# - Define OECD analytical series suitable for panel diagnostics
# - Measure strong and weak balancedness, coverage, spans, and internal gaps
# - Prepare availability matrices for panelView
#
# Requirements:
# - Processed OECD RDS snapshots
# - Panel variable names defined in config/analysis.yml
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Identify Panel Series ----
#
#
# ////////////////////////////////////////////////////

PANEL_SERIES_DIMENSIONS <- function(data, unit, time, value) {
  # Limit identifiers to the canonical analytical dimensions, deliberately
  # excluding country, period, and observed value fields that vary within a series
  canonical_dimensions <- c(
    "MEASURE",
    "UNIT_MEASURE",
    "AGE",
    "SEX",
    "EDUCATION_LEV",
    "DOMAIN"
  )

  intersect(
    canonical_dimensions,
    names(data)
  )
}

ADD_PANEL_SERIES_ID <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Detect the dimensions that distinguish otherwise separate OECD measures
  # before constructing the identifier used to split diagnostic calculations
  dimensions <- PANEL_SERIES_DIMENSIONS(
    data = data,
    unit = unit,
    time = time,
    value = value
  )

  if (!length(dimensions)) {
    # Fail explicitly because diagnostics require at least one reproducible
    # definition of what counts as a distinct analytical series
    stop("No series-defining dimensions were detected.")
  }

  # Retain the source dimensions and add a stable composite ID used by inventory
  # and balance helpers to apply the same country-time checks per series
  data |>
    tidyr::unite(
      col = "SERIES_ID",
      dplyr::all_of(dimensions),
      sep = "|",
      remove = FALSE,
      na.rm = FALSE
    )
}


# ////////////////////////////////////////////////////
#
#
# 2. Diagnose One Country-Time Panel ----
#
#
# ////////////////////////////////////////////////////

PANEL_BALANCE_SUMMARY <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Isolate the requested country-period-value fields so balancedness refers to
  # one analytical series rather than unrelated metadata columns
  panel <- data |>
    dplyr::select(
      dplyr::all_of(c(unit, time, value))
    ) |>
    dplyr::distinct()

  duplicates <- panel |>
    dplyr::count(
      dplyr::across(
        dplyr::all_of(c(unit, time))
      ),
      name = "n"
    ) |>
    dplyr::filter(n > 1L)

  if (nrow(duplicates)) {
    # Ambiguous country-period rows would invalidate the coverage counts below
    stop("Duplicate unit-time observations prevent panel balancedness diagnostics.")
  }

  # Separate actual measurements from structurally present but missing cells
    dplyr::filter(
      !is.na(.data[[value]])
    )

  # Establish the full country and period support against which completeness is
  # measured, including countries that have no observed values at all
  periods <- sort(
    unique(panel[[time]])
  )

  units <- sort(
    unique(panel[[unit]])
  )

  by_unit_observed <- observed |>
    dplyr::group_by(
      .data[[unit]]
    ) |>
    dplyr::summarise(
      n_periods = dplyr::n_distinct(.data[[time]]),
      first_period = min(.data[[time]], na.rm = TRUE),
      last_period = max(.data[[time]], na.rm = TRUE),
      .groups = "drop"
    )

  # Reattach countries with zero observed values so weak-balance checks do not
  # silently omit them from the candidate series diagnostics
  by_unit <- tibble::tibble(
    !!rlang::sym(unit) := units
  ) |>
    dplyr::left_join(
      by_unit_observed,
      by = unit
    ) |>
    dplyr::mutate(
      n_periods = dplyr::coalesce(n_periods, 0L)
    )

  possible <- length(units) * length(periods)
  n_observed <- nrow(observed)

  # Strong balance means every country is observed in every period on support
  strongly_balanced <- possible > 0L && n_observed == possible

  # Weak balance compares counts only, allowing countries to cover different
  # calendar periods while still contributing an equal number of observations
  weakly_balanced <- nrow(by_unit) > 0L &&
    dplyr::n_distinct(by_unit$n_periods) == 1L

  tibble::tibble(
    n_units = length(units),
    n_periods = length(periods),
    first_period = if (length(periods)) min(periods) else NA,
    last_period = if (length(periods)) max(periods) else NA,
    observed = n_observed,
    possible = possible,
    completion_rate = if (possible > 0L) n_observed / possible else NA_real_,
    strongly_balanced = strongly_balanced,
    weakly_balanced = weakly_balanced,
    min_periods_per_unit = if (nrow(by_unit)) min(by_unit$n_periods) else NA_integer_,
    max_periods_per_unit = if (nrow(by_unit)) max(by_unit$n_periods) else NA_integer_
  )
}

PANEL_GAP_SUMMARY <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Derive annual coverage only where period labels can be interpreted as years;
  # nonannual codes are excluded rather than assigned an artificial chronology
  annual <- data |>
    dplyr::mutate(
      .year = suppressWarnings(
        as.integer(.data[[time]])
      )
    ) |>
    dplyr::filter(
      !is.na(.year),
      !is.na(.data[[value]])
    )

  annual |>
    dplyr::group_by(
      .data[[unit]]
    ) |>
    dplyr::summarise(
      first_year = min(.year),
      last_year = max(.year),
      observed_years = dplyr::n_distinct(.year),
      span_years = last_year - first_year + 1L,
      internal_gaps = span_years - observed_years,
      .groups = "drop"
    )
}


# ////////////////////////////////////////////////////
#
#
# 3. Diagnose All Analytical Series ----
#
#
# ////////////////////////////////////////////////////

INVENTORY_PANEL_SERIES <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Create an ID-bearing copy so each unique measure definition receives an
  # independent country-time coverage and balancedness assessment
  data_with_id <- ADD_PANEL_SERIES_ID(
    data = data,
    unit = unit,
    time = time,
    value = value
  )

  dimensions <- PANEL_SERIES_DIMENSIONS(
    data = data,
    unit = unit,
    time = time,
    value = value
  )

  # Split by the composite definition and bind one comparable diagnostic record
  # per series for selection and reporting in downstream scripts
  data_with_id |>
    dplyr::group_split(SERIES_ID, .keep = TRUE) |>
    purrr::map_dfr(
      function(series_data) {
        # Compute coverage statistics and retain the first shared dimension
        # values as the human-inspectable definition of this series
        summary <- PANEL_BALANCE_SUMMARY(
          data = series_data,
          unit = unit,
          time = time,
          value = value
        )

        definition <- series_data |>
          dplyr::summarise(
            dplyr::across(
              dplyr::all_of(dimensions),
              dplyr::first
            )
          )

        dplyr::bind_cols(
          tibble::tibble(
            SERIES_ID = unique(series_data$SERIES_ID)
          ),
          definition,
          summary
        )
      }
    ) |>
    # Translate the two balance flags into one display category, then rank the
    # inventory so more complete and longer-running candidates appear first
    dplyr::mutate(
      balance_status = dplyr::case_when(
        strongly_balanced ~ "Strongly balanced",
        weakly_balanced ~ "Weakly balanced",
        TRUE ~ "Unbalanced"
      )
    ) |>
    dplyr::arrange(
      dplyr::desc(completion_rate),
      dplyr::desc(n_periods),
      SERIES_ID
    )
}


# ////////////////////////////////////////////////////
#
#
# 4. Prepare panelView Missingness Data ----
#
#
# ////////////////////////////////////////////////////

PREPARE_PANELVIEW_MISSINGNESS <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Complete the country-period grid so downstream panelView data distinguishes
  # absent observations from countries or periods omitted from the input table
  units <- sort(unique(data[[unit]]))
  periods <- sort(unique(data[[time]]))

  tidyr::expand_grid(
    !!rlang::sym(unit) := units,
    !!rlang::sym(time) := periods
  ) |>
    dplyr::left_join(
      data |>
        dplyr::select(
          dplyr::all_of(c(unit, time, value))
        ) |>
        dplyr::distinct(),
      by = c(unit, time)
    )
}
