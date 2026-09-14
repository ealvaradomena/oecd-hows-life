# ==============================================================================
# INPUTS
# ==============================================================================
# - Installed R package state and CRAN repositories: Dependency availability.
# - renv.lock: Existing dependency lockfile, when present.
#
# OUTPUTS
# ==============================================================================
# - Project R library: Missing packages installed by R/renv.
# - renv.lock: Initialized or refreshed dependency snapshot.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Project Setup
#
# Purpose:
# - Install project dependencies when missing
# - Initialize renv for reproducible package management
#
# Requirements:
# - R 4.3 or later
# - Internet access to CRAN
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Define Required Packages ----
#
#
# ////////////////////////////////////////////////////

required_packages <- c(
  "dplyr",
  "fixest",
  "ggplot2",
  "here",
  "httr2",
  "janitor",
  "jsonlite",
  "knitr",
  "panelView",
  "purrr",
  "quarto",
  "readr",
  "renv",
  "rlang",
  "stringr",
  "tibble",
  "tidyr",
  "xml2",
  "yaml"
)


# ////////////////////////////////////////////////////
#
#
# 2. Install Missing Packages ----
#
#
# ////////////////////////////////////////////////////

# Inspect the active R library before installing only dependencies that are absent
installed <- rownames(
  utils::installed.packages()
)

# Keep package installation idempotent so repeated setup runs do not reinstall
# dependencies that are already available to the project
missing <- setdiff(
  required_packages,
  installed
)

if (length(missing)) {
  # Install every missing package together from the configured CRAN repository
  utils::install.packages(missing)
}


# ////////////////////////////////////////////////////
#
#
# 3. Initialize renv ----
#
#
# ////////////////////////////////////////////////////

# Create project-local dependency management only on first setup so the lockfile
# becomes the reproducible record of the packages required by this pipeline
if (!file.exists(here::here("renv.lock"))) {
  renv::init(
    bare = TRUE,
    restart = FALSE
  )
}

# Capture the current project dependency state after required packages are available
renv::snapshot(
  prompt = FALSE
)
# FINAL OUTPUT LINE
