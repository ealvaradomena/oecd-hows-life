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
# Econometric Diagnostic Helpers
#
# Purpose:
# - Identify aggregate-population analytical series for panel modeling
# - Measure overlap between a configured outcome and candidate predictors
# - Quantify within-country variation relevant to fixed-effects estimation
#
# Requirements:
# - Processed Current well-being RDS snapshot
# - Panel inventory created by scripts/04-panel-diagnostics.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Identify Aggregate-Population Series ----
#
#
# ////////////////////////////////////////////////////

FILTER_TOTAL_POPULATION <- function(
  data,
  total_codes = list(
    AGE = "_T",
    SEX = "_T",
    EDUCATION_LEV = "_T"
  )
) {
  # Apply aggregate-population restrictions only to dimensions represented in
  # this dataflow, preserving compatibility with differently shaped inputs
  for (dimension in names(total_codes)) {
    if (dimension %in% names(data)) {
      data <- data |>
        dplyr::filter(
          .data[[dimension]] == total_codes[[dimension]]
        )
    }
  }

  data
}

IDENTIFY_OUTCOME_SERIES <- function(
  panel_inventory,
  outcome_measure,
  total_codes
) {
  # Isolate the configured outcome after applying the same demographic scope
  # used for predictors, requiring one unambiguous series definition
  outcome_candidates <- panel_inventory |>
    FILTER_TOTAL_POPULATION(
      total_codes = total_codes
    ) |>
    dplyr::filter(
      MEASURE == outcome_measure
    )

  if (nrow(outcome_candidates) == 0L) {
    # Stop before pairwise diagnostics could silently use an absent outcome
    stop(
      "No aggregate-population outcome series found for MEASURE = ",
      outcome_measure,
      "."
    )
  }

  if (nrow(outcome_candidates) > 1L) {
    # A measure can have multiple dimension definitions; require the caller's
    # configuration to resolve that ambiguity before model preparation
    stop(
      "Outcome MEASURE = ",
      outcome_measure,
      " maps to more than one aggregate-population analytical series. ",
      "Specify a unique outcome series before proceeding."
    )
  }

  outcome_candidates
}


# ////////////////////////////////////////////////////
#
#
# 2. Prepare Series for Pairwise Overlap ----
#
#
# ////////////////////////////////////////////////////

PREPARE_MODEL_SERIES <- function(
  data,
  series_id,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE",
  value_name = "value"
) {
  # Attach series IDs, then reduce the selected measure to the observed
  # country-period values that can enter a two-variable estimation sample
  series <- ADD_PANEL_SERIES_ID(
    data = data,
    unit = unit,
    time = time,
    value = value
  ) |>
    dplyr::filter(
      SERIES_ID == series_id,
      !is.na(.data[[value]])
    ) |>
    dplyr::transmute(
      !!rlang::sym(unit) := .data[[unit]],
      !!rlang::sym(time) := .data[[time]],
      !!rlang::sym(value_name) := .data[[value]]
    )

  duplicates <- series |>
    dplyr::count(
      dplyr::across(
        dplyr::all_of(c(unit, time))
      ),
      name = "n"
    ) |>
    dplyr::filter(n > 1L)

  if (nrow(duplicates)) {
    # Fixed-effects diagnostics require one outcome or predictor per country-period
    stop(
      "Duplicate country-period observations detected for SERIES_ID = ",
      series_id,
      "."
    )
  }

  series
}


# ////////////////////////////////////////////////////
#
#
# 3. Measure Fixed-Effects Variation ----
#
#
# ////////////////////////////////////////////////////

WITHIN_SD <- function(data, variable, unit) {
  # Remove each country's mean so the resulting standard deviation isolates
  # within-country variation relevant to fixed-effects identification
  transformed <- data |>
    dplyr::group_by(
      .data[[unit]]
    ) |>
    dplyr::mutate(
      .within = .data[[variable]] - mean(
        .data[[variable]],
        na.rm = TRUE
      )
    ) |>
    dplyr::ungroup()

  stats::sd(
    transformed$.within,
    na.rm = TRUE
  )
}

UNITS_WITH_CHANGE <- function(data, variable, unit) {
  # Count countries with genuine within-country movement, rather than merely
  # counting countries that appear in the common estimation sample
  data |>
    dplyr::group_by(
      .data[[unit]]
    ) |>
    dplyr::summarise(
      n_values = dplyr::n_distinct(
        .data[[variable]],
        na.rm = TRUE
      ),
      .groups = "drop"
    ) |>
    dplyr::summarise(
      n_units_with_change = sum(n_values > 1L)
    ) |>
    dplyr::pull(n_units_with_change)
}


# ////////////////////////////////////////////////////
#
#
# 4. Diagnose Outcome-Predictor Overlap ----
#
#
# ////////////////////////////////////////////////////

PAIRWISE_TWFE_DIAGNOSTICS <- function(
  data,
  outcome_series_id,
  predictor_series_id,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Prepare the two named series separately so their values can be joined only
  # on country-period observations they genuinely share
  outcome <- PREPARE_MODEL_SERIES(
    data = data,
    series_id = outcome_series_id,
    unit = unit,
    time = time,
    value = value,
    value_name = "outcome"
  )

  predictor <- PREPARE_MODEL_SERIES(
    data = data,
    series_id = predictor_series_id,
    unit = unit,
    time = time,
    value = value,
    value_name = "predictor"
  )

  # Form the common-support sample used to assess whether a predictor has
  # coverage and variation compatible with the configured outcome
  estimation_sample <- outcome |>
    dplyr::inner_join(
      predictor,
      by = c(unit, time)
    ) |>
    dplyr::filter(
      !is.na(outcome),
      !is.na(predictor)
    )

  if (nrow(estimation_sample) == 0L) {
    # Return a typed zero-row diagnostic rather than allowing later summaries
    # to compute misleading statistics from an empty overlap
    return(
      tibble::tibble(
        observations = 0L,
        n_units = 0L,
        n_periods = 0L,
        first_period = NA_character_,
        last_period = NA_character_,
        possible = 0L,
        completion_rate = NA_real_,
        predictor_sd = NA_real_,
        predictor_within_sd = NA_real_,
        predictor_within_share = NA_real_,
        outcome_sd = NA_real_,
        outcome_within_sd = NA_real_,
        outcome_within_share = NA_real_,
        n_units_with_predictor_change = 0L
      )
    )
  }

  # Derive coverage and total/within variation measures from the exact overlap
  n_units <- dplyr::n_distinct(
    estimation_sample[[unit]]
  )

  n_periods <- dplyr::n_distinct(
    estimation_sample[[time]]
  )

  possible <- n_units * n_periods
  predictor_sd <- stats::sd(
    estimation_sample$predictor,
    na.rm = TRUE
  )
  predictor_within_sd <- WITHIN_SD(
    data = estimation_sample,
    variable = "predictor",
    unit = unit
  )
  outcome_sd <- stats::sd(
    estimation_sample$outcome,
    na.rm = TRUE
  )
  outcome_within_sd <- WITHIN_SD(
    data = estimation_sample,
    variable = "outcome",
    unit = unit
  )

  tibble::tibble(
    observations = nrow(estimation_sample),
    n_units = n_units,
    n_periods = n_periods,
    first_period = as.character(
      min(estimation_sample[[time]], na.rm = TRUE)
    ),
    last_period = as.character(
      max(estimation_sample[[time]], na.rm = TRUE)
    ),
    possible = possible,
    completion_rate = if (possible > 0L) {
      nrow(estimation_sample) / possible
    } else {
      NA_real_
    },
    predictor_sd = predictor_sd,
    predictor_within_sd = predictor_within_sd,
    predictor_within_share = if (
      !is.na(predictor_sd) && predictor_sd > 0
    ) {
      predictor_within_sd / predictor_sd
    } else {
      NA_real_
    },
    outcome_sd = outcome_sd,
    outcome_within_sd = outcome_within_sd,
    outcome_within_share = if (
      !is.na(outcome_sd) && outcome_sd > 0
    ) {
      outcome_within_sd / outcome_sd
    } else {
      NA_real_
    },
    n_units_with_predictor_change = UNITS_WITH_CHANGE(
      data = estimation_sample,
      variable = "predictor",
      unit = unit
    )
  )
}


# ////////////////////////////////////////////////////
#
#
# 5. Build TWFE Candidate Inventory ----
#
#
# ////////////////////////////////////////////////////

BUILD_TWFE_CANDIDATE_INVENTORY <- function(
  data,
  panel_inventory,
  outcome_measure,
  total_codes,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE"
) {
  # Resolve the single configured outcome before evaluating every other eligible
  # aggregate-population series as a potential predictor
  outcome_series <- IDENTIFY_OUTCOME_SERIES(
    panel_inventory = panel_inventory,
    outcome_measure = outcome_measure,
    total_codes = total_codes
  )

  outcome_series_id <- outcome_series$SERIES_ID[[1]]

  # Exclude the outcome itself and retain only aggregate-population candidates
  candidate_series <- panel_inventory |>
    FILTER_TOTAL_POPULATION(
      total_codes = total_codes
    ) |>
    dplyr::filter(
      SERIES_ID != outcome_series_id
    )

  if (nrow(candidate_series) == 0L) {
    # A model-search inventory has no useful interpretation without predictors
    stop("No aggregate-population predictor series were available for comparison.")
  }

  # Apply identical overlap diagnostics to each candidate and bind the results
  diagnostics <- purrr::map_dfr(
    candidate_series$SERIES_ID,
    function(predictor_series_id) {
      PAIRWISE_TWFE_DIAGNOSTICS(
        data = data,
        outcome_series_id = outcome_series_id,
        predictor_series_id = predictor_series_id,
        unit = unit,
        time = time,
        value = value
      ) |>
        dplyr::mutate(
          SERIES_ID = predictor_series_id,
          .before = 1L
        )
    }
  )

  # Reattach readable series metadata and rank candidates by coverage and
  # within-country predictor variation for downstream feasibility review
  candidate_series |>
    dplyr::select(
      SERIES_ID,
      MEASURE,
      dplyr::any_of("MEASURE_LABEL"),
      UNIT_MEASURE,
      dplyr::any_of("UNIT_MEASURE_LABEL"),
      DOMAIN,
      dplyr::any_of("DOMAIN_LABEL")
    ) |>
    dplyr::left_join(
      diagnostics,
      by = "SERIES_ID"
    ) |>
    dplyr::mutate(
      outcome_series_id = outcome_series_id,
      outcome_measure = outcome_measure,
      outcome_label = if (
        "MEASURE_LABEL" %in% names(outcome_series)
      ) {
        outcome_series$MEASURE_LABEL[[1]]
      } else {
        outcome_measure
      },
      .after = SERIES_ID
    ) |>
    dplyr::arrange(
      dplyr::desc(n_units),
      dplyr::desc(n_periods),
      dplyr::desc(completion_rate),
      dplyr::desc(predictor_within_share),
      SERIES_ID
    )
}


# ////////////////////////////////////////////////////
#
#
# 6. Build a Fixed-Effects Estimation Sample ----
#
#
# ////////////////////////////////////////////////////

BUILD_TWFE_ESTIMATION_SAMPLE <- function(
  data,
  outcome_series_id,
  predictor_series_id,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  value = "OBS_VALUE",
  unit_labels = NULL
) {
  # Prepare and join the requested outcome and predictor on common country-period
  # rows, creating the exact sample used by subsequent estimation scripts
  outcome <- PREPARE_MODEL_SERIES(
    data = data,
    series_id = outcome_series_id,
    unit = unit,
    time = time,
    value = value,
    value_name = "outcome"
  )

  predictor <- PREPARE_MODEL_SERIES(
    data = data,
    series_id = predictor_series_id,
    unit = unit,
    time = time,
    value = value,
    value_name = "predictor"
  )

  estimation_sample <- outcome |>
    dplyr::inner_join(
      predictor,
      by = c(unit, time)
    ) |>
    dplyr::arrange(
      .data[[unit]],
      .data[[time]]
    )

  if (!is.null(unit_labels)) {
    # Validate optional country labels before enriching the otherwise coded sample
    required_label_columns <- c(
      "CODE",
      "LABEL"
    )

    if (!all(required_label_columns %in% names(unit_labels))) {
      stop(
        "unit_labels must contain CODE and LABEL columns."
      )
    }

    # Keep one label per country code so the descriptive column cannot multiply rows
    labels <- unit_labels |>
      dplyr::select(
        !!rlang::sym(unit) := CODE,
        UNIT_LABEL = LABEL
      ) |>
      dplyr::distinct(
        .data[[unit]],
        .keep_all = TRUE
      )

    estimation_sample <- estimation_sample |>
      dplyr::left_join(
        labels,
        by = unit
      ) |>
      dplyr::relocate(
        UNIT_LABEL,
        .after = dplyr::all_of(unit)
      )
  }

  duplicates <- estimation_sample |>
    dplyr::count(
      dplyr::across(
        dplyr::all_of(c(unit, time))
      ),
      name = "n"
    ) |>
    dplyr::filter(n > 1L)

  if (nrow(duplicates) > 0L) {
    # The saved sample must remain one row per country-period for model fitting
    stop(
      "Duplicate country-period rows remain after constructing the estimation sample."
    )
  }

  estimation_sample
}


# ////////////////////////////////////////////////////
#
#
# 7. Audit Estimation-Sample Coverage ----
#
#
# ////////////////////////////////////////////////////

SUMMARISE_TWFE_SAMPLE <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Produce one-row coverage and variation diagnostics for the exact common
  # sample, which makes later model results interpretable in their data context
  if (nrow(data) == 0L) {
    stop("The TWFE estimation sample is empty.")
  }

  # Determine the observed support before calculating its theoretical cell count
  periods <- sort(
    unique(data[[time]])
  )

  units <- unique(data[[unit]])
  possible <- length(units) * length(periods)

  tibble::tibble(
    observations = nrow(data),
    n_units = length(units),
    n_periods = length(periods),
    first_period = as.character(periods[[1]]),
    last_period = as.character(periods[[length(periods)]]),
    possible = possible,
    completion_rate = nrow(data) / possible,
    outcome_mean = mean(data$outcome, na.rm = TRUE),
    outcome_sd = stats::sd(data$outcome, na.rm = TRUE),
    outcome_within_sd = WITHIN_SD(
      data = data,
      variable = "outcome",
      unit = unit
    ),
    predictor_mean = mean(data$predictor, na.rm = TRUE),
    predictor_sd = stats::sd(data$predictor, na.rm = TRUE),
    predictor_within_sd = WITHIN_SD(
      data = data,
      variable = "predictor",
      unit = unit
    ),
    n_units_with_predictor_change = UNITS_WITH_CHANGE(
      data = data,
      variable = "predictor",
      unit = unit
    )
  )
}

SUMMARISE_TWFE_SAMPLE_BY_UNIT <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Compare each country's contribution to the common period support so uneven
  # country coverage remains visible alongside the saved estimation sample
  all_periods <- sort(
    unique(data[[time]])
  )

  n_all_periods <- length(all_periods)
  has_unit_label <- "UNIT_LABEL" %in% names(data)

  data |>
    dplyr::group_by(
      dplyr::across(
        dplyr::all_of(
          c(
            unit,
            if (has_unit_label) "UNIT_LABEL"
          )
        )
      )
    ) |>
    dplyr::summarise(
      observations = dplyr::n(),
      n_periods = dplyr::n_distinct(.data[[time]]),
      first_period = as.character(min(.data[[time]], na.rm = TRUE)),
      last_period = as.character(max(.data[[time]], na.rm = TRUE)),
      period_coverage = n_periods / n_all_periods,
      outcome_mean = mean(outcome, na.rm = TRUE),
      outcome_sd = stats::sd(outcome, na.rm = TRUE),
      predictor_mean = mean(predictor, na.rm = TRUE),
      predictor_sd = stats::sd(predictor, na.rm = TRUE),
      predictor_distinct_values = dplyr::n_distinct(
        predictor,
        na.rm = TRUE
      ),
      .groups = "drop"
    ) |>
    dplyr::arrange(
      dplyr::desc(n_periods),
      .data[[unit]]
    )
}

SUMMARISE_TWFE_SAMPLE_BY_PERIOD <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Summarize country coverage and means by period for reporting on time support
  n_all_units <- dplyr::n_distinct(
    data[[unit]]
  )

  data |>
    dplyr::group_by(
      .data[[time]]
    ) |>
    dplyr::summarise(
      observations = dplyr::n(),
      n_units = dplyr::n_distinct(.data[[unit]]),
      unit_coverage = n_units / n_all_units,
      outcome_mean = mean(outcome, na.rm = TRUE),
      predictor_mean = mean(predictor, na.rm = TRUE),
      .groups = "drop"
    ) |>
    dplyr::arrange(
      .data[[time]]
    )
}


# ////////////////////////////////////////////////////
#
#
# 8. Select High-Coverage Core Periods ----
#
#
# ////////////////////////////////////////////////////

SELECT_CORE_TWFE_PERIODS <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  min_unit_coverage = 0.70
) {
  # Validate the requested threshold before identifying high-coverage periods
  if (min_unit_coverage <= 0 || min_unit_coverage > 1) {
    stop("min_unit_coverage must be greater than 0 and no greater than 1.")
  }

  n_all_units <- dplyr::n_distinct(
    data[[unit]]
  )

  if (n_all_units == 0L) {
    stop("Cannot select core periods from an empty estimation sample.")
  }

  # Mark each period against the common unit denominator for transparent core
  # sample selection by downstream model-fitting scripts
  period_coverage <- data |>
    dplyr::group_by(
      .data[[time]]
    ) |>
    dplyr::summarise(
      n_units = dplyr::n_distinct(.data[[unit]]),
      unit_coverage = n_units / n_all_units,
      .groups = "drop"
    ) |>
    dplyr::mutate(
      core_period = unit_coverage >= min_unit_coverage
    ) |>
    dplyr::arrange(
      .data[[time]]
    )

  if (!any(period_coverage$core_period)) {
    # Do not return an unusable selection when no period meets the threshold
    stop(
      "No periods satisfy min_unit_coverage = ",
      min_unit_coverage,
      "."
    )
  }

  period_coverage
}


# ////////////////////////////////////////////////////
#
#
# 9. Fit Pooled, Country-FE, and TWFE Models ----
#
#
# ////////////////////////////////////////////////////

FIT_TWFE_MODEL_SEQUENCE <- function(
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Confirm the common sample contains every field needed by all three models
  required_columns <- c(
    unit,
    time,
    "outcome",
    "predictor"
  )

  missing_columns <- setdiff(
    required_columns,
    names(data)
  )

  if (length(missing_columns)) {
    # Prevent formula construction from masking a missing analytical field
    stop(
      "Model data are missing required columns: ",
      paste(missing_columns, collapse = ", "),
      "."
    )
  }

  if (nrow(data) == 0L) {
    stop("Cannot fit TWFE models to an empty sample.")
  }

  # Construct formulas from the configured country and period field names, then
  # estimate comparable pooled, country-FE, and two-way-FE specifications
  cluster_formula <- stats::as.formula(
    paste0("~ ", unit)
  )

  country_fe_formula <- stats::as.formula(
    paste0(
      "outcome ~ predictor | ",
      unit
    )
  )

  twfe_formula <- stats::as.formula(
    paste0(
      "outcome ~ predictor | ",
      unit,
      " + ",
      time
    )
  )

  list(
    pooled_ols = fixest::feols(
      outcome ~ predictor,
      data = data,
      vcov = cluster_formula
    ),
    country_fe = fixest::feols(
      country_fe_formula,
      data = data,
      vcov = cluster_formula
    ),
    twfe = fixest::feols(
      twfe_formula,
      data = data,
      vcov = cluster_formula
    )
  )
}


# ////////////////////////////////////////////////////
#
#
# 10. Summarize Model Sequence ----
#
#
# ////////////////////////////////////////////////////

SUMMARISE_TWFE_MODELS <- function(
  models,
  sample_name,
  data,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Extract the same focal coefficient from each fitted specification into a
  # table that can be compared across alternative fixed-effects controls
  model_names <- names(models)

  if (is.null(model_names) || any(model_names == "")) {
    stop("models must be a named list.")
  }

  purrr::map_dfr(
    model_names,
    function(model_name) {
      # Read the fitted model's coefficient table and require the focal predictor
      fit <- models[[model_name]]
      coefficient_table <- fixest::coeftable(fit)

      if (!"predictor" %in% rownames(coefficient_table)) {
        stop(
          "Predictor coefficient not found in model: ",
          model_name,
          "."
        )
      }

      predictor_row <- coefficient_table["predictor", ]

      tibble::tibble(
        sample = sample_name,
        model = model_name,
        observations = stats::nobs(fit),
        n_units = dplyr::n_distinct(data[[unit]]),
        n_periods = dplyr::n_distinct(data[[time]]),
        estimate = unname(predictor_row[["Estimate"]]),
        std_error = unname(predictor_row[["Std. Error"]]),
        statistic = unname(predictor_row[["t value"]]),
        p_value = unname(predictor_row[["Pr(>|t|)"]])
      )
    }
  )
}
