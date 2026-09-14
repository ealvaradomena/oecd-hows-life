# ==============================================================================
# INPUTS
# ==============================================================================
# - config/analysis.yml: Panel dimension settings.
# - data/processed/current_wellbeing.rds: Normalized Current well-being data.
# - data/processed/current_wellbeing-labels.rds: SDMX labels.
#
# OUTPUTS
# ==============================================================================
# - data/processed/panel_inventory.rds: Analytical-series panel diagnostics.
# - outputs/tables/panel-inventory.csv: Tabular panel diagnostics.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Panel Diagnostics
#
# Purpose:
# - Evaluate panel balancedness for every Current well-being analytical series
# - Save series-level balance metrics for Quarto reporting
#
# Requirements:
# - Processed Current well-being RDS artifact created by scripts/03-clean-data.R
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

# Load configuration, panel diagnostics, and SDMX label helpers used to create
# a readable series-level coverage inventory from the processed observation data
source(here::here("R", "config.R"))
source(here::here("R", "panel_diagnostics.R"))
source(here::here("R", "sdmx_metadata.R"))

# Read configured country, period, and value field names before diagnostics begin
cfg <- READ_PROJECT_CONFIG()

# Load the normalized Current well-being snapshot that contains all candidate series
cwb <- readRDS(
  here::here(
    "data",
    "processed",
    "current_wellbeing.rds"
  )
)

# Load its precomputed SDMX dictionary so coded dimension values can be displayed
cwb_labels <- readRDS(
  here::here(
    "data",
    "processed",
    "current_wellbeing-labels.rds"
  )
)


# ////////////////////////////////////////////////////
#
#
# 2. Inventory Analytical Series ----
#
#
# ////////////////////////////////////////////////////

# Diagnose every analytical series on country-period coverage, attach readable
# labels, then rank the resulting inventory by completeness and time span for review
panel_inventory <- INVENTORY_PANEL_SERIES(
  data = cwb,
  unit = cfg$analysis$panel$unit,
  time = cfg$analysis$panel$time,
  value = cfg$analysis$panel$value
) |>
  LABEL_PANEL_INVENTORY(
    labels = cwb_labels
  ) |>
  dplyr::arrange(
    dplyr::desc(completion_rate),
    dplyr::desc(n_periods),
    SERIES_ID
  )

# Persist the complete inventory for later feasibility and Quarto reporting stages
saveRDS(
  panel_inventory,
  here::here(
    "data",
    "processed",
    "panel_inventory.rds"
  )
)

# Export the same diagnostics as a tabular artifact for direct inspection outside R
readr::write_csv(
  panel_inventory,
  here::here(
    "outputs",
    "diagnostics",
    "panel-inventory.csv"
  )
)
# FINAL OUTPUT LINE
