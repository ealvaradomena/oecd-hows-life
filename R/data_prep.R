# ==============================================================================
# INPUTS
# ==============================================================================
# - data/raw/<dataflow>.csv: Cached OECD dataflow response supplied by the caller.
#
# OUTPUTS
# ==============================================================================
# - data/processed/<dataflow>.rds: Normalized dataflow snapshot.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Data Preparation Helpers
#
# Purpose:
# - Read OECD CSV snapshots
# - Normalize column names and panel variables
# - Create processed RDS artifacts
#
# Requirements:
# - Raw CSV snapshots created by scripts/02-download-data.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Read and Normalize Data ----
#
#
# ////////////////////////////////////////////////////

READ_OECD_CSV <- function(path) {
  # Read one cached OECD response and normalize its field names before any
  # downstream helpers use the snapshot as a panel-ready data source
  data <- readr::read_csv(
    path,
    show_col_types = FALSE,
    progress = FALSE,
    na = c("", "..", "...")
  ) |>
    janitor::clean_names(case = "screaming_snake")

  # Convert the central measurement field only when present, retaining source
  # rows whose non-numeric OECD value markers were already treated as missing
  if ("OBS_VALUE" %in% names(data)) {
    data <- data |>
      dplyr::mutate(
        OBS_VALUE = suppressWarnings(
          as.numeric(OBS_VALUE)
        )
      )
  }

  # Add a numeric companion to the original period code for annual operations
  # without replacing nonannual values that must remain available to callers
  if ("TIME_PERIOD" %in% names(data)) {
    data <- data |>
      dplyr::mutate(
        TIME_PERIOD_NUMERIC = suppressWarnings(
          as.integer(TIME_PERIOD)
        )
      )
  }

  data
}


# ////////////////////////////////////////////////////
#
#
# 2. Persist Processed Snapshots ----
#
#
# ////////////////////////////////////////////////////

PROCESS_REGISTERED_DATAFLOW <- function(flow) {
  # Reconstruct the raw-cache location from the registered dataflow key so
  # processing stays aligned with the download script's naming convention
  raw_path <- here::here(
    "data",
    "raw",
    paste0(flow$key, ".csv")
  )

  if (!file.exists(raw_path)) {
    # Stop before producing a partial processed artifact when the prerequisite
    # API snapshot is absent from the local cache
    stop(
      "Raw OECD snapshot not found: ",
      raw_path,
      ". Run scripts/02-download-data.R first."
    )
  }

  # Normalize the cached response into the in-memory snapshot shared by the
  # analysis, diagnostics, and website-asset stages
  data <- READ_OECD_CSV(raw_path)

  # Persist the normalized snapshot as the R-native input consumed by later
  # analytical helpers instead of repeatedly parsing the raw CSV response
  processed_path <- here::here(
    "data",
    "processed",
    paste0(flow$key, ".rds")
  )

  saveRDS(
    data,
    processed_path
  )

  # Return a lightweight processing record for the caller's run-level inventory
  tibble::tibble(
    key = flow$key,
    title = flow$title,
    observations = nrow(data),
    columns = ncol(data),
    processed_path = processed_path
  )
}
