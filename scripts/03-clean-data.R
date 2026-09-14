# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: Registered dataflow definitions.
# - data/raw/<dataflow>.csv: Cached OECD data responses.
# - data/metadata/<dataflow>-structure.xml: Cached SDMX structure metadata.
#
# OUTPUTS
# ==============================================================================
# - data/processed/<dataflow>.rds: Normalized dataflow snapshots.
# - data/processed/<dataflow>-labels.rds: SDMX label dictionaries.
# - outputs/tables/dataflow-inventory.csv: Local dataflow inventory.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Clean OECD Data
#
# Purpose:
# - Normalize raw OECD CSV snapshots
# - Write processed RDS artifacts and reusable SDMX label dictionaries
# - Create a reproducible dataset inventory
#
# Requirements:
# - Structure metadata created by scripts/01-download-structures.R
# - Raw snapshots created by scripts/02-download-data.R
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

# Load the registry plus helpers that normalize observations and decode SDMX labels
source(here::here("R", "config.R"))
source(here::here("R", "data_prep.R"))
source(here::here("R", "sdmx_metadata.R"))

# Build the canonical work list so every downloaded dataflow receives identical processing
registry <- DATAFLOW_REGISTRY()


# ////////////////////////////////////////////////////
#
#
# 2. Process Registered Dataflows ----
#
#
# ////////////////////////////////////////////////////

# Process every registered dataflow and bind one returned processing record per flow;
# the resulting inventory documents the normalized snapshots created in this run
inventory <- purrr::pmap_dfr(
  registry,
  function(key, title, agency, dataflow, version, comparison_dimension) {
    # Recreate the flow metadata shared by the data and structure processing helpers
    flow <- list(
      key = key,
      title = title,
      agency = agency,
      dataflow = dataflow,
      version = version,
      comparison_dimension = comparison_dimension
    )

    # Normalize the cached CSV and receive a compact observation/column summary
    summary <- PROCESS_REGISTERED_DATAFLOW(flow)

    # Parse the matching SDMX structure into a reusable code-label dictionary
    PROCESS_REGISTERED_STRUCTURE_LABELS(
      flow = flow,
      language = "en"
    )

    summary
  }
)

# Write the run-level inventory for inspection without reopening every processed RDS
readr::write_csv(
  inventory,
  here::here("outputs", "tables", "dataflow-inventory.csv")
)
# FINAL OUTPUT LINE
