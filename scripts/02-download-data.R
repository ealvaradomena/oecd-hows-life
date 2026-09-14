# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: Registered OECD dataflows and API settings.
# - OECD SDMX REST API or existing cached data responses.
#
# OUTPUTS
# ==============================================================================
# - data/raw/<dataflow>.csv: Cached labelled OECD data responses.
# - data/retrieval-manifest.csv: Retrieval provenance.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Download OECD Data
#
# Purpose:
# - Download and cache all six registered How's Life? dataflows from the OECD SDMX API
#
# Requirements:
# - Internet access to https://sdmx.oecd.org
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
# 1. Load Project Functions ----
#
#
# ////////////////////////////////////////////////////

# Load the registry and API helpers used to make reproducible cached data requests
source(here::here("R", "config.R"))
source(here::here("R", "oecd_api.R"))

# Read registered dataflows once so each request uses its configured SDMX version
cfg <- READ_PROJECT_CONFIG()
registry <- DATAFLOW_REGISTRY(cfg)


# ////////////////////////////////////////////////////
#
#
# 2. Download Registered Dataflows ----
#
#
# ////////////////////////////////////////////////////

# Iterate through registered dataflows, caching each full response for the
# normalization stage rather than making page rendering depend on live API calls
purrr::pwalk(
  registry,
  function(key, title, agency, dataflow, version, comparison_dimension) {
    # Recreate the registry entry in the format consumed by the download helper
    flow <- list(
      key = key,
      title = title,
      agency = agency,
      dataflow = dataflow,
      version = version,
      comparison_dimension = comparison_dimension
    )

    # Download or reuse this response under its stable data/raw/ filename
    DOWNLOAD_OECD_DATAFLOW( # See: data/raw/
      flow = flow,
      refresh = FALSE, # Reuse an existing local data file rather than downloading it again
      cfg = cfg
    )
  }
)
# FINAL OUTPUT LINE
