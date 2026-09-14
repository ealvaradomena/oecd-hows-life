# ==============================================================================
# INPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-employment-life-satisfaction-core-sample.csv: Preferred TWFE estimation sample.
#
# OUTPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-employment-life-satisfaction-transformed.csv: Fixed-effect residualized variables.
# - outputs/diagnostics/twfe-employment-life-satisfaction-fwl-verification.csv: FWL equivalence check.
# - outputs/diagnostics/twfe-employment-life-satisfaction-transformed.rds: Residualized analysis data.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Build TWFE Transformed Variables
#
# Purpose:
# - Residualize employment and life satisfaction against country and period effects
# - Verify that the transformed regression reproduces the TWFE coefficient
#
# Requirements:
#   dplyr, fixest, here, readr
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
# ////////////////////////////////////////////////////


# ////////////////////////////////////////////////////
#
#
# 1. Load and Validate Core Sample ----
#
#
# ////////////////////////////////////////////////////

# Load the residualization and Frisch-Waugh-Lovell verification helpers
source(
  here::here(
    "R",
    "twfe_transformation.R"
  )
)

# Locate and validate the high-coverage sample saved by the preceding model stage
sample_path <- here::here(
  "outputs",
  "diagnostics",
  "twfe-employment-life-satisfaction-core-sample.csv"
)

if (!file.exists(sample_path)) {
  stop(
    "Core TWFE estimation sample not found. ",
    "Run scripts/09-fit-twfe-models.R first."
  )
}

# Read the tabular core sample that will receive fixed-effect residualized fields
core_sample <- readr::read_csv(
  sample_path,
  show_col_types = FALSE
)

# Require the four fields needed by both the direct TWFE and transformed regressions
required_columns <- c(
  "REF_AREA",
  "TIME_PERIOD",
  "outcome",
  "predictor"
)

missing_columns <- setdiff(
  required_columns,
  names(core_sample)
)

if (length(missing_columns) > 0L) {
  # Stop before transformation if the saved sample no longer has the expected schema
  stop(
    "Core sample is missing required columns: ",
    paste(missing_columns, collapse = ", "),
    "."
  )
}


# ////////////////////////////////////////////////////
#
#
# 2. Construct and Verify Fixed-Effect Residuals ----
#
#
# ////////////////////////////////////////////////////

# Residualize both selected variables, then rename output fields for the
# analytical terminology used by the published diagnostic artifacts
twfe_transformed <- BUILD_TWFE_TRANSFORMATION(
  data = core_sample,
  outcome = "outcome",
  predictor = "predictor",
  unit = "REF_AREA",
  time = "TIME_PERIOD"
) |>
  dplyr::rename(
    life_satisfaction = outcome,
    employment_rate = predictor,
    life_satisfaction_twfe = outcome_twfe,
    employment_rate_twfe = predictor_twfe
  ) |>
  dplyr::mutate(
    twfe_outcome = life_satisfaction_twfe,
    twfe_predictor = employment_rate_twfe
  )

# Compare transformed and direct TWFE coefficients as a numerical FWL check
twfe_verification <- VERIFY_TWFE_TRANSFORMATION(
  data = core_sample,
  outcome = "outcome",
  predictor = "predictor",
  unit = "REF_AREA",
  time = "TIME_PERIOD"
)


# ////////////////////////////////////////////////////
#
#
# 3. Validate Numerical Equivalence ----
#
#
# ////////////////////////////////////////////////////

if (!isTRUE(twfe_verification$equivalent[[1]])) {
  # Do not write transformed artifacts if they fail the configured equivalence test
  stop(
    "Double-demeaned regression does not reproduce the TWFE coefficient. ",
    "Absolute difference: ",
    signif(
      twfe_verification$absolute_difference[[1]],
      6
    ),
    "."
  )
}


# ////////////////////////////////////////////////////
#
#
# 4. Persist Transformation Artifacts ----
#
#
# ////////////////////////////////////////////////////

# Define and create the diagnostics location shared by all transformation outputs
output_dir <- here::here(
  "outputs",
  "diagnostics"
)

dir.create(
  output_dir,
  recursive = TRUE,
  showWarnings = FALSE
)

# Write tabular residuals, the verification record, and an R-native copy for
# later analytical reuse without reconstructing the fixed-effect transformation
readr::write_csv(
  twfe_transformed,
  file.path(
    output_dir,
    "twfe-employment-life-satisfaction-transformed.csv"
  )
)

readr::write_csv(
  twfe_verification,
  file.path(
    output_dir,
    "twfe-employment-life-satisfaction-fwl-verification.csv"
  )
)

saveRDS(
  twfe_transformed,
  file.path(
    output_dir,
    "twfe-employment-life-satisfaction-transformed.rds"
  )
)

message(
  "TWFE transformation verified. Coefficient = ",
  round(
    twfe_verification$twfe_coefficient[[1]],
    6
  ),
  "; transformed slope = ",
  round(
    twfe_verification$transformed_coefficient[[1]],
    6
  ),
  "."
)
# FINAL OUTPUT LINE
