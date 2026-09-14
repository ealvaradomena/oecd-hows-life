# ==============================================================================
# INPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-employment-life-satisfaction-sample.rds: Matched estimation sample.
#
# OUTPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-employment-life-satisfaction-models.rds: Fitted model objects.
# - outputs/diagnostics/twfe-employment-life-satisfaction-period-coverage.csv: Period coverage and core-period flags.
# - outputs/diagnostics/twfe-employment-life-satisfaction-core-sample.csv: Preferred estimation sample.
# - outputs/diagnostics/twfe-employment-life-satisfaction-model-summary.csv: Model estimates and diagnostics.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Fit Employment-Life Satisfaction TWFE Models
#
# Purpose:
# - Define a high-coverage core period sample using a transparent coverage threshold
# - Estimate pooled OLS, country fixed effects, and two-way fixed effects
# - Compare the core-period results with the full matched estimation sample
#
# Requirements:
# - Estimation sample created by scripts/08-build-estimation-sample.R
# - fixest package installed by scripts/00-setup.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Load Project Functions and Estimation Sample ----
#
#
# ////////////////////////////////////////////////////

# Load helpers that select high-coverage periods, fit comparable specifications,
# and extract a common coefficient summary from each fitted model
source(here::here("R", "econometric_diagnostics.R"))

# Define and validate the persisted matched sample required by this modeling stage
sample_path <- here::here(
  "outputs",
  "diagnostics",
  "twfe-employment-life-satisfaction-sample.rds"
)

if (!file.exists(sample_path)) {
  stop(
    "TWFE estimation sample not found. Run scripts/08-build-estimation-sample.R first."
  )
}

# Load the exact sample audited by the preceding script before any period selection
full_sample <- readRDS(sample_path)


# ////////////////////////////////////////////////////
#
#
# 2. Define the High-Coverage Core Sample ----
#
#
# ////////////////////////////////////////////////////

# Set the explicit coverage rule that distinguishes the high-coverage core sample
core_period_min_unit_coverage <- 0.70

# Assess every period against the rule, then retain only qualifying observations
period_coverage <- SELECT_CORE_TWFE_PERIODS(
  data = full_sample,
  unit = "REF_AREA",
  time = "TIME_PERIOD",
  min_unit_coverage = core_period_min_unit_coverage
)

core_periods <- period_coverage |>
  dplyr::filter(core_period) |>
  dplyr::pull(TIME_PERIOD)

# Preserve country-period ordering in the selected core sample for reproducible output
core_sample <- full_sample |>
  dplyr::filter(
    TIME_PERIOD %in% core_periods
  ) |>
  dplyr::arrange(
    REF_AREA,
    TIME_PERIOD
  )

message(
  "Core TWFE periods selected at >= ",
  paste0(round(100 * core_period_min_unit_coverage), "%"),
  " country coverage: ",
  paste(core_periods, collapse = ", "),
  "."
)


# ////////////////////////////////////////////////////
#
#
# 3. Fit Full-Sample and Core-Sample Models ----
#
#
# ////////////////////////////////////////////////////

# Fit parallel pooled, country-FE, and TWFE specifications on both supports so
# the reported comparison separates coverage selection from model specification
full_models <- FIT_TWFE_MODEL_SEQUENCE(
  data = full_sample,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
)

core_models <- FIT_TWFE_MODEL_SEQUENCE(
  data = core_sample,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
)


# ////////////////////////////////////////////////////
#
#
# 4. Summarize the Predictor Coefficients ----
#
#
# ////////////////////////////////////////////////////

# Extract the predictor coefficient from each model, bind samples, and impose a
# stable display ordering that remains independent of list-construction order
full_model_summary <- SUMMARISE_TWFE_MODELS(
  models = full_models,
  sample_name = "Full matched sample",
  data = full_sample,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
)

core_model_summary <- SUMMARISE_TWFE_MODELS(
  models = core_models,
  sample_name = "High-coverage core periods",
  data = core_sample,
  unit = "REF_AREA",
  time = "TIME_PERIOD"
)

model_summary <- dplyr::bind_rows(
  core_model_summary,
  full_model_summary
) |>
  dplyr::mutate(
    model = factor(
      model,
      levels = c(
        "pooled_ols",
        "country_fe",
        "twfe"
      )
    )
  ) |>
  dplyr::arrange(
    sample,
    model
  ) |>
  dplyr::mutate(
    model = as.character(model)
  )


# ////////////////////////////////////////////////////
#
#
# 5. Save Model Artifacts ----
#
#
# ////////////////////////////////////////////////////

# Use the shared analytical stem for every persisted model-stage artifact
output_stem <- "twfe-employment-life-satisfaction"

# Persist models, selected periods, samples, and summary together for reproducible
# downstream inspection without requiring the fit stage to be rerun
saveRDS(
  list(
    core_period_min_unit_coverage = core_period_min_unit_coverage,
    core_periods = core_periods,
    full_sample = full_sample,
    core_sample = core_sample,
    full_models = full_models,
    core_models = core_models,
    model_summary = model_summary
  ),
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-models.rds")
  )
)

# Export coverage, core rows, and coefficient summaries as separate review tables
readr::write_csv(
  period_coverage,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-period-coverage.csv")
  )
)

readr::write_csv(
  core_sample,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-core-sample.csv")
  )
)

readr::write_csv(
  model_summary,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-model-summary.csv")
  )
)

message(
  "TWFE models fitted for ",
  nrow(core_sample),
  " core-sample observations and ",
  nrow(full_sample),
  " full-sample observations."
)
# FINAL OUTPUT LINE
