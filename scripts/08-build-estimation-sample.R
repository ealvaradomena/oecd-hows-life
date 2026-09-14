# ==============================================================================
# INPUTS
# ==============================================================================
# - config/analysis.yml: Outcome, panel, and total-population settings.
# - data/processed/current_wellbeing.rds: Normalized Current well-being data.
# - data/processed/current_wellbeing-labels.rds: SDMX labels.
# - outputs/diagnostics/twfe-candidates.rds: Feasible predictor diagnostics.
#
# OUTPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-employment-life-satisfaction-sample.rds: Matched estimation sample.
# - outputs/diagnostics/twfe-employment-life-satisfaction-sample.csv: Tabular matched sample.
# - outputs/diagnostics/twfe-employment-life-satisfaction-summary.csv: Sample summary.
# - outputs/diagnostics/twfe-employment-life-satisfaction-by-area.csv: Reference-area coverage.
# - outputs/diagnostics/twfe-employment-life-satisfaction-by-period.csv: Period coverage.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Build Employment-Life Satisfaction Estimation Sample
#
# Purpose:
# - Construct the exact country-period sample shared by life satisfaction and employment
# - Verify uniqueness of the country-period key before fixed-effects estimation
# - Audit country and period coverage without yet fitting a regression model
#
# Requirements:
# - Processed Current well-being data created by scripts/03-clean-data.R
# - TWFE feasibility diagnostics created by scripts/07-twfe-feasibility.R
# - SDMX labels created by scripts/03-clean-data.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Load Project Functions and Data ----
#
#
# ////////////////////////////////////////////////////

# Load configuration, panel IDs, and estimation-sample helpers before reading
# the previously processed observations, labels, and feasibility diagnostics
source(here::here("R", "config.R"))
source(here::here("R", "panel_diagnostics.R"))
source(here::here("R", "econometric_diagnostics.R"))

# Read shared field names and the configured case-study outcome
cfg <- READ_PROJECT_CONFIG()

# Load observations, labels, and feasibility findings required to select series
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

twfe_candidates <- readRDS(
  here::here(
    "outputs",
    "diagnostics",
    "twfe-candidates.rds"
  )
)


# ////////////////////////////////////////////////////
#
#
# 2. Identify the Selected Outcome and Predictor ----
#
#
# ////////////////////////////////////////////////////

# Specify the reviewed employment-rate candidate exactly as represented in the
# saved feasibility inventory before extracting its outcome and predictor IDs
predictor_measure <- "2_1"
predictor_label <- "Employment rate"

# Require the chosen measure/label pair to resolve to one candidate definition
predictor_candidate <- twfe_candidates |>
  dplyr::filter(
    MEASURE == predictor_measure,
    MEASURE_LABEL == predictor_label
  )

if (nrow(predictor_candidate) != 1L) {
  # Prevent an ambiguous predictor selection from changing the estimation sample
  stop(
    "Expected exactly one aggregate-population employment-rate candidate; found ",
    nrow(predictor_candidate),
    "."
  )
}

# Retain the exact coded IDs used by helpers to isolate both selected series
outcome_series_id <- predictor_candidate$outcome_series_id[[1]]
predictor_series_id <- predictor_candidate$SERIES_ID[[1]]

# Extract country labels so the saved sample can be interpreted without SDMX codes
reference_area_labels <- cwb_labels |>
  dplyr::filter(
    DIMENSION == cfg$analysis$panel$unit
  ) |>
  dplyr::select(
    CODE,
    LABEL
  )


# ////////////////////////////////////////////////////
#
#
# 3. Construct the Common Estimation Sample ----
#
#
# ////////////////////////////////////////////////////

# Construct the exact common-support outcome-predictor sample and derive three
# complementary coverage summaries used to audit it before model fitting
twfe_sample <- BUILD_TWFE_ESTIMATION_SAMPLE(
  data = cwb,
  outcome_series_id = outcome_series_id,
  predictor_series_id = predictor_series_id,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time,
  value = cfg$analysis$panel$value,
  unit_labels = reference_area_labels
)

sample_summary <- SUMMARISE_TWFE_SAMPLE(
  data = twfe_sample,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time
)

sample_by_area <- SUMMARISE_TWFE_SAMPLE_BY_UNIT(
  data = twfe_sample,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time
)

sample_by_period <- SUMMARISE_TWFE_SAMPLE_BY_PERIOD(
  data = twfe_sample,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time
)


# ////////////////////////////////////////////////////
#
#
# 4. Save Estimation-Sample Artifacts ----
#
#
# ////////////////////////////////////////////////////

# Use one shared filename stem to keep all sample artifacts visibly associated
output_stem <- "twfe-employment-life-satisfaction"

# Save the R-native sample used directly by downstream fixed-effects estimation
saveRDS(
  twfe_sample,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-sample.rds")
  )
)

# Export the matched rows and each coverage summary for transparent inspection
readr::write_csv(
  twfe_sample,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-sample.csv")
  )
)

readr::write_csv(
  sample_summary,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-summary.csv")
  )
)

readr::write_csv(
  sample_by_area,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-by-area.csv")
  )
)

readr::write_csv(
  sample_by_period,
  here::here(
    "outputs",
    "diagnostics",
    paste0(output_stem, "-by-period.csv")
  )
)

message(
  "TWFE estimation sample saved: ",
  nrow(twfe_sample),
  " country-period observations across ",
  dplyr::n_distinct(twfe_sample[[cfg$analysis$panel$unit]]),
  " reference areas."
)
# FINAL OUTPUT LINE
