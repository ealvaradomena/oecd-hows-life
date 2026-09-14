# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: OECD API endpoint and registered dataflow settings.
# - config/analysis.yml: Panel and analytical settings.
#
# OUTPUTS
# ==============================================================================
# - None.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Configuration Helpers
#
# Purpose:
# - Read and validate project configuration
# - Expose registered OECD How's Life? dataflows as a tidy table
#
# Requirements:
# - Run from the oecd-hows-life project root
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Read Configuration ----
#
#
# ////////////////////////////////////////////////////

READ_PROJECT_CONFIG <- function() {
  # Read the two canonical configuration files together so every caller uses
  # one consistent set of API, dataflow, panel, and analytical settings
  list(
    dataflows = yaml::read_yaml(
      here::here("config", "dataflows.yml")
    ),
    analysis = yaml::read_yaml(
      here::here("config", "analysis.yml")
    )
  )
}


# ////////////////////////////////////////////////////
#
#
# 2. Build Dataflow Registry ----
#
#
# ////////////////////////////////////////////////////

DATAFLOW_REGISTRY <- function(cfg = READ_PROJECT_CONFIG()) {
  # Flatten the named YAML entries into a compact registry used by download
  # and processing scripts to iterate over every registered OECD dataflow
  purrr::imap_dfr(
    cfg$dataflows$dataflows,
    function(flow, key) {
      tibble::tibble(
        key = key,
        title = flow$title,
        agency = cfg$dataflows$agency,
        dataflow = flow$id,
        version = cfg$dataflows$version,
        comparison_dimension = flow$comparison_dimension %||% NA_character_
      )
    }
  )
}

`%||%` <- function(x, y) {
  # Preserve optional configuration fields while supplying an explicit missing value
  if (is.null(x)) y else x
}
