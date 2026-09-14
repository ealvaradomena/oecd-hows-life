# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: Registered OECD dataflows and API settings.
# - OECD SDMX REST API or existing cached structure responses.
#
# OUTPUTS
# ==============================================================================
# - data/metadata/<dataflow>-structure.xml: Cached structure metadata.
# - data/retrieval-manifest.csv: Retrieval provenance.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Download OECD Structures
#
# Purpose:
# - Download and cache SDMX structure metadata for all registered How's Life? dataflows
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

# Load configuration and API helpers that translate the registry into cached
# SDMX structure requests with shared provenance recording
source(here::here("R", "config.R"))
source(here::here("R", "oecd_api.R"))

# Read the canonical registry once so every structure request uses the same
# endpoint, agency, version, and dataflow definitions
cfg <- READ_PROJECT_CONFIG()
registry <- DATAFLOW_REGISTRY(cfg)


# ////////////////////////////////////////////////////
#
#
# 2. Download Structures ----
#
#
# ////////////////////////////////////////////////////

# Iterate over each registry row to cache the XML structure that later scripts
# need to construct human-readable SDMX code labels; reruns reuse prior files
purrr::pwalk(
  registry,
  function(key, title, agency, dataflow, version, comparison_dimension) {
    # Recreate the flow record expected by the shared download helper
    flow <- list(
      key = key,
      title = title,
      agency = agency,
      dataflow = dataflow,
      version = version,
      comparison_dimension = comparison_dimension
    )

    # Download or reuse this flow's complete SDMX structure in data/metadata/
    DOWNLOAD_OECD_STRUCTURE( # See: data/metadata/
      flow = flow,
      refresh = FALSE, # Reuse an existing local structure file rather than downloading it again
      cfg = cfg
    )
  }
)
# FINAL OUTPUT LINE
