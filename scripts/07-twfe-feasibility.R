# ==============================================================================
# INPUTS
# ==============================================================================
# - config/analysis.yml: Outcome and panel settings.
# - data/processed/current_wellbeing.rds: Normalized Current well-being data.
# - data/processed/panel_inventory.rds: Panel diagnostics.
#
# OUTPUTS
# ==============================================================================
# - outputs/diagnostics/twfe-candidates.rds: Candidate-series diagnostics.
# - outputs/diagnostics/twfe-candidates.csv: Tabular candidate diagnostics.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# TWFE Feasibility Diagnostics
#
# Purpose:
# - Anchor the econometric exercise on configured life satisfaction
# - Evaluate aggregate-population predictor series on their actual overlap with the outcome
# - Save country-year coverage and within-country variation diagnostics for model selection
#
# Requirements:
# - Processed Current well-being data created by scripts/03-clean-data.R
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
# 1. Load Project Functions and Data ----
#
#
# ////////////////////////////////////////////////////

# Load configuration and helpers that define candidate series and quantify their
# common outcome-predictor coverage before any fixed-effects model is estimated
source(here::here("R", "config.R"))
source(here::here("R", "panel_diagnostics.R"))
source(here::here("R", "econometric_diagnostics.R"))

# Read the configured outcome and panel field names used throughout this diagnostic
cfg <- READ_PROJECT_CONFIG()

# Load the full normalized snapshot and the prior per-series panel inventory
cwb <- readRDS(
  here::here(
    "data",
    "processed",
    "current_wellbeing.rds"
  )
)

panel_inventory <- readRDS(
  here::here(
    "data",
    "processed",
    "panel_inventory.rds"
  )
)


# ////////////////////////////////////////////////////
#
#
# 2. Build Life-Satisfaction Overlap Inventory ----
#
#
# ////////////////////////////////////////////////////

# Evaluate each eligible aggregate-population predictor against the configured
# outcome on its actual common country-period support and within-country movement
twfe_candidates <- BUILD_TWFE_CANDIDATE_INVENTORY(
  data = cwb,
  panel_inventory = panel_inventory,
  outcome_measure = cfg$analysis$case_study$outcome_measure,
  total_codes = cfg$analysis$panel$total_codes,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time,
  value = cfg$analysis$panel$value
)


# ////////////////////////////////////////////////////
#
#
# 3. Save Diagnostic Artifacts ----
#
#
# ////////////////////////////////////////////////////

# Persist the complete candidate diagnostics for later predictor selection
saveRDS(
  twfe_candidates,
  here::here(
    "outputs",
    "diagnostics",
    "twfe-candidates.rds"
  )
)

# Export an inspectable CSV companion for feasibility review outside R
readr::write_csv(
  twfe_candidates,
  here::here(
    "outputs",
    "diagnostics",
    "twfe-candidates.csv"
  )
)

message(
  "TWFE feasibility inventory saved: ",
  nrow(twfe_candidates),
  " aggregate-population predictor series evaluated."
)
# FINAL OUTPUT LINE
