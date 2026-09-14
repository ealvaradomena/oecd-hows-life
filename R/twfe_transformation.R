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
# TWFE transformation helpers
#
# Purpose:
#   Residualize variables with respect to unit and time fixed effects and
#   verify the Frisch-Waugh-Lovell equivalence numerically.
#
# Requirements:
#   dplyr, fixest, tibble
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
# ////////////////////////////////////////////////////


# ////////////////////////////////////////////////////
#
#
# 1. Fixed-Effect Residualization ----
#
#
# ////////////////////////////////////////////////////

RESIDUALIZE_FIXED_EFFECTS <- function(
  data,
  variable,
  unit,
  time
) {
  # Build a variable-specific regression on country and period indicators so
  # its residuals contain only variation not explained by either fixed effect
  formula <- stats::as.formula(
    paste0(
      variable,
      " ~ factor(",
      unit,
      ") + factor(",
      time,
      ")"
    )
  )

  # Preserve row alignment with na.exclude because returned residuals are added
  # back to the filtered transformation dataset in the calling helper
  fit <- stats::lm(
    formula,
    data = data,
    na.action = stats::na.exclude
  )

  stats::residuals(fit)
}


BUILD_TWFE_TRANSFORMATION <- function(
  data,
  outcome = "life_satisfaction",
  predictor = "employment_rate",
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) {
  # Verify that callers supplied all named outcome, predictor, country, and
  # period fields before constructing the transformed estimation dataset
  required <- c(
    outcome,
    predictor,
    unit,
    time
  )

  missing_columns <- setdiff(
    required,
    names(data)
  )

  if (length(missing_columns) > 0L) {
    # Stop with the explicit missing fields rather than producing partial residuals
    stop(
      "Missing required columns: ",
      paste(missing_columns, collapse = ", "),
      "."
    )
  }

  # Restrict to complete model rows so both residualizations share identical support
  transformed <- data |>
    dplyr::filter(
      !is.na(.data[[outcome]]),
      !is.na(.data[[predictor]]),
      !is.na(.data[[unit]]),
      !is.na(.data[[time]])
    )

  # Remove country and period effects from each variable independently; these
  # residuals provide the Frisch-Waugh-Lovell representation of the TWFE model
  outcome_residual <- RESIDUALIZE_FIXED_EFFECTS(
    data = transformed,
    variable = outcome,
    unit = unit,
    time = time
  )

  predictor_residual <- RESIDUALIZE_FIXED_EFFECTS(
    data = transformed,
    variable = predictor,
    unit = unit,
    time = time
  )

  outcome_twfe <- paste0(
    outcome,
    "_twfe"
  )

  predictor_twfe <- paste0(
    predictor,
    "_twfe"
  )

  # Return the retained sample with both dynamic and standard alias columns for
  # downstream verification and presentation code
  transformed |>
    dplyr::mutate(
      "{outcome_twfe}" := outcome_residual,
      "{predictor_twfe}" := predictor_residual,
      twfe_outcome = outcome_residual,
      twfe_predictor = predictor_residual
    )
}


# ////////////////////////////////////////////////////
#
#
# 2. FWL Verification ----
#
#
# ////////////////////////////////////////////////////

VERIFY_TWFE_TRANSFORMATION <- function(
  data,
  outcome = "life_satisfaction",
  predictor = "employment_rate",
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  tolerance = 1e-10
) {
  # Fit the direct two-way-fixed-effects specification using the caller's
  # configured column names as the benchmark for the transformed regression
  twfe_formula <- stats::as.formula(
    paste0(
      outcome,
      " ~ ",
      predictor,
      " | ",
      unit,
      " + ",
      time
    )
  )

  twfe_fit <- fixest::feols(
    twfe_formula,
    data = data
  )

  # Construct the corresponding residualized data, then estimate through-origin
  # regression because fixed effects have already been removed from both fields
  transformed <- BUILD_TWFE_TRANSFORMATION(
    data = data,
    outcome = outcome,
    predictor = predictor,
    unit = unit,
    time = time
  )

  transformed_fit <- stats::lm(
    twfe_outcome ~ 0 + twfe_predictor,
    data = transformed
  )

  twfe_coefficient <- unname(
    stats::coef(twfe_fit)[[predictor]]
  )

  transformed_coefficient <- unname(
    stats::coef(transformed_fit)[["twfe_predictor"]]
  )

  # Report the numerical gap against the supplied tolerance for a reusable audit
  difference <- abs(
    twfe_coefficient -
      transformed_coefficient
  )

  tibble::tibble(
    twfe_coefficient = twfe_coefficient,
    transformed_coefficient = transformed_coefficient,
    absolute_difference = difference,
    tolerance = tolerance,
    equivalent = difference <= tolerance
  )
}
