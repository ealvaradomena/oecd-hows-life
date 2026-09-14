# ==============================================================================
# INPUTS
# ==============================================================================
# - config/*.yml and existing cached project artifacts consumed by scripts/01 through 10.
# - OECD SDMX REST API and CRAN only when invoked pipeline stages require them.
#
# OUTPUTS
# ==============================================================================
# - data/, outputs/, and assets/ artifacts produced by scripts/01 through 10.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Run the Complete Project Pipeline
#
# Purpose:
# - Execute the project scripts in dependency order
#
# Requirements:
# - Run from the project root after dependencies are available
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Define Dependency-Ordered Stages ----
#
#
# ////////////////////////////////////////////////////

# List each standalone stage in the order that turns API resources into
# processed data, diagnostics, estimation artifacts, and website-facing assets
scripts <- c(
  "01-download-structures.R",
  "02-download-data.R",
  "03-clean-data.R",
  "04-panel-diagnostics.R",
  "05-compare-dataflows.R",
  "06-build-summary-assets.R",
  "07-twfe-feasibility.R",
  "08-build-estimation-sample.R",
  "09-fit-twfe-models.R",
  "10-build-twfe-transformation.R"
)

# Source each stage in the current R session so objects and configuration follow
# the project pipeline's declared dependency order from downloads through models
purrr::walk(
  scripts,
  ~ source(
    here::here(
      "scripts",
      .x
    )
  )
)
# FINAL OUTPUT LINE
