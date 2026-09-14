# ==============================================================================
# INPUTS
# ==============================================================================
# - config/analysis.yml: Total-population codes and comparison tolerance.
# - data/processed/current_wellbeing.rds: Parent dataflow snapshot.
# - data/processed/current_wellbeing_{age,sex,education}.rds: Specialized snapshots.
#
# OUTPUTS
# ==============================================================================
# - data/processed/comparison_<dimension>.rds: Record-level comparison results.
# - outputs/tables/comparison-<dimension>-summary.csv: Comparison summaries.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Compare OECD Dataflows
#
# Purpose:
# - Compare Current well-being with age, sex, and education dissemination dataflows
# - Classify exact overlap and discrepancies on shared SDMX keys
#
# Requirements:
# - Processed RDS artifacts created by scripts/03-clean-data.R
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

# Load shared configuration and comparison helpers before reading processed snapshots
source(here::here("R", "config.R"))
source(here::here("R", "COMPARE_DATAFLOWS.R"))

# Retrieve tolerance and aggregate-population codes that define comparable scope
cfg <- READ_PROJECT_CONFIG()

# Load the parent Current well-being cube used as the common comparison baseline
cwb <- readRDS(
  here::here("data", "processed", "current_wellbeing.rds")
)

# Map reporting labels to the specialized processed dataflow keys to compare
children <- c(
  age = "current_wellbeing_age",
  sex = "current_wellbeing_sex",
  education = "current_wellbeing_education"
)


# ////////////////////////////////////////////////////
#
#
# 2. Compare Demographic Dataflows ----
#
#
# ////////////////////////////////////////////////////

purrr::iwalk(
  children,
  function(child_key, comparison_name) {
    # Load one specialized dissemination view and compare it against the parent
    child <- readRDS(
      here::here(
        "data",
        "processed",
        paste0(child_key, ".rds")
      )
    )

    # Harmonize scope, retain shared SDMX keys, and classify coverage/value agreement
    comparison <- COMPARE_DATAFLOWS(
      parent = cwb,
      child = child,
      value = cfg$analysis$panel$value,
      tolerance = cfg$analysis$comparison$value_tolerance,
      total_codes = cfg$analysis$panel$total_codes
    )

    # Persist complete record-level results for later inspection and narrative use
    saveRDS(
      comparison,
      here::here(
        "data",
        "processed",
        paste0("comparison_", comparison_name, ".rds")
      )
    )

    # Export the compact status summary used in comparison tables and reporting
    readr::write_csv(
      COMPARISON_SUMMARY(comparison),
      here::here(
        "outputs",
        "tables",
        paste0("comparison-", comparison_name, "-summary.csv")
      )
    )
  }
)
# FINAL OUTPUT LINE
