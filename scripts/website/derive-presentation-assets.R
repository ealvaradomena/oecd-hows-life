# ==============================================================================
# INPUTS
# ==============================================================================
# - data/raw/current_wellbeing.csv: Optional frozen OECD observation snapshot.
# - data/metadata/current_wellbeing-structure.xml: Optional OBS_STATUS labels.
# - outputs/diagnostics/twfe-employment-life-satisfaction-sample.csv: Optional matched sample.
# - outputs/diagnostics/twfe-employment-life-satisfaction-by-area.csv: Optional area labels.
# - data/retrieval-manifest.csv: Optional retrieval provenance.
#
# OUTPUTS (ordinary Quarto rendering only)
# ==============================================================================
# - <Quarto output>/assets/series-status.json: Browser-facing observation-status data.
# - <Quarto output>/assets/twfe-audit.json: Browser-facing TWFE status and sample audit.
# - <Quarto output>/assets/retrieval-manifest.json: Browser-facing retrieval provenance.
# ==============================================================================

# ////////////////////////////////////////////////////
#
# Derive Presentation-Only Website Assets
#
# Purpose:
# - Build browser JSON used by the rendered Quarto site from existing local files
# - Surface OECD OBS_STATUS metadata for analytical-series views and the TWFE page
# - Surface retrieval provenance when a retrieval manifest exists
#
# Requirements:
# - Run within the project tree with jsonlite, readr, and xml2 available
# - Existing local artifacts are optional; unavailable inputs produce explicit unavailable states
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# Boundaries:
# - No OECD/API calls
# - No analytical recomputation
# - No model fitting
# - No writes outside the active, noncanonical Quarto output directory
#
# This script is invoked automatically by the project-level Quarto post-render hook.
#
# Direct invocation intentionally requires QUARTO_PROJECT_OUTPUT_DIR so it cannot
# accidentally overwrite tracked canonical presentation assets. Preview disables
# input watching/navigation, so its single startup pass can safely derive the same
# local assets as an ordinary render.
#
# ////////////////////////////////////////////////////

required_packages <- c("jsonlite", "readr", "xml2")
# Confirm the narrow asset-generation dependency set before reading local inputs
missing_packages <- required_packages[
  !vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)
]

if (length(missing_packages) > 0L) {
  # Rendering cannot create the promised browser assets without these local packages
  stop(
    "Presentation-asset derivation requires installed package(s): ",
    paste(missing_packages, collapse = ", "),
    ". Restore the project renv environment before rendering."
  )
}

script_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
# Resolve this script's physical location so all asset paths stay project-relative
if (length(script_arg) != 1L) {
  stop("Could not determine the presentation-asset script path.")
}

script_path <- normalizePath(
  sub("^--file=", "", script_arg[[1]]),
  winslash = "/",
  mustWork = TRUE
)
project_root <- normalizePath(
  file.path(dirname(script_path), "..", ".."),
  winslash = "/",
  mustWork = TRUE
)

output_setting <- trimws(Sys.getenv("QUARTO_PROJECT_OUTPUT_DIR"))
if (!nzchar(output_setting)) {
  stop("QUARTO_PROJECT_OUTPUT_DIR is required; refusing to write presentation assets without an explicit local output root.")
}
output_candidate <- if (grepl("^[A-Za-z]:[/\\\\]|^/", output_setting)) {
  output_setting
} else {
  file.path(project_root, output_setting)
}
output_root <- normalizePath(output_candidate, winslash = "/", mustWork = TRUE)
project_prefix <- paste0(tolower(project_root), "/")
if (!startsWith(tolower(output_root), project_prefix)) {
  stop("Quarto output directory must remain inside the project tree.")
}
if (identical(tolower(output_root), tolower(file.path(project_root, "docs")))) {
  stop("Ordinary render hooks may not write to canonical docs/.")
}

PROJECT_PATH <- function(...) file.path(project_root, ...)
# Centralize project-relative paths and create the only directory this script writes to
assets_dir <- file.path(output_root, "assets")
dir.create(assets_dir, recursive = TRUE, showWarnings = FALSE)

WRITE_JSON <- function(value, filename) {
  # Apply one stable browser-JSON serialization policy to every generated asset
  jsonlite::write_json(
    value,
    path = file.path(assets_dir, filename),
    pretty = TRUE,
    auto_unbox = TRUE,
    na = "null",
    null = "null"
  )
}

CLEAN_CHARACTER <- function(x) {
  # Normalize absent and padded source fields before building comparable browser keys
  x <- as.character(x)
  x[is.na(x)] <- ""
  trimws(x)
}

READ_CSV_IF_PRESENT <- function(path) {
  # Treat optional frozen inputs as unavailable rather than failing the render
  if (!file.exists(path)) {
    return(NULL)
  }

  readr::read_csv(
    path,
    show_col_types = FALSE,
    progress = FALSE,
    name_repair = "minimal"
  )
}

SERIES_ID <- function(data) {
  # Require the six dimensions that uniquely identify a Current well-being series
  required <- c(
    "MEASURE",
    "UNIT_MEASURE",
    "AGE",
    "SEX",
    "EDUCATION_LEV",
    "DOMAIN"
  )

  missing <- setdiff(required, names(data))
  if (length(missing) > 0L) {
    # Avoid producing ambiguous browser groupings from a changed raw-file schema
    stop(
      "Current well-being snapshot is missing series dimension(s): ",
      paste(missing, collapse = ", ")
    )
  }

  # Combine normalized codes in the same fixed order used by analytical series IDs
  do.call(
    paste,
    c(
      lapply(data[required], CLEAN_CHARACTER),
      sep = "|"
    )
  )
}

OBS_STATUS_LABELS <- function(path) {
  # Read optional structure labels only when the frozen SDMX metadata file exists
  if (!file.exists(path)) {
    return(character())
  }

  document <- xml2::read_xml(path)
  codes <- xml2::xml_find_all(
    document,
    ".//*[local-name()='Codelist' and @id='CL_OBS_STATUS']/*[local-name()='Code']"
  )

  if (length(codes) == 0L) {
    # The structure may not include observation-status definitions
    return(character())
  }

  ids <- xml2::xml_attr(codes, "id")
  # Prefer English labels while retaining a source-provided fallback label
  labels <- vapply(
    codes,
    function(code) {
      english <- xml2::xml_find_first(
        code,
        "./*[local-name()='Name' and @*[local-name()='lang']='en']"
      )
      if (inherits(english, "xml_missing")) {
        english <- xml2::xml_find_first(code, "./*[local-name()='Name']")
      }
      if (inherits(english, "xml_missing")) "" else trimws(xml2::xml_text(english))
    },
    character(1)
  )

  stats::setNames(labels, ids)
}

# ////////////////////////////////////////////////////
# 1. Load Existing Local Inputs ----
# ////////////////////////////////////////////////////

raw_path <- PROJECT_PATH("data", "raw", "current_wellbeing.csv")
# Locate the frozen observations and matching structure without making network requests
structure_path <- PROJECT_PATH(
  "data",
  "metadata",
  "current_wellbeing-structure.xml"
)

# Read optional local inputs used by the status asset and later TWFE audit
raw <- READ_CSV_IF_PRESENT(raw_path)
status_labels <- OBS_STATUS_LABELS(structure_path)

# ////////////////////////////////////////////////////
# 2. Analytical-Series Observation Status ----
# ////////////////////////////////////////////////////

series_status <- list()

if (!is.null(raw) && "OBS_STATUS" %in% names(raw)) {
  # Retain only observations with source status codes, then group them by the
  # same analytical-series identifier used by the browser explorer
  statuses <- CLEAN_CHARACTER(raw$OBS_STATUS)
  keep <- nzchar(statuses)

  if (any(keep)) {
    # Build a compact per-observation browser schema and attach optional labels
    ids <- SERIES_ID(raw)
    rows <- data.frame(
      series_id = ids[keep],
      area_code = CLEAN_CHARACTER(raw$REF_AREA[keep]),
      time = CLEAN_CHARACTER(raw$TIME_PERIOD[keep]),
      status = statuses[keep],
      stringsAsFactors = FALSE
    )
    rows$status_label <- unname(status_labels[rows$status])
    rows$status_label[is.na(rows$status_label) | !nzchar(rows$status_label)] <- NA_character_

    # Serialize a named list so client-side code can load one series' statuses directly
    split_rows <- split(rows, rows$series_id)
    series_status <- lapply(
      split_rows,
      function(x) {
        unname(
          lapply(
            seq_len(nrow(x)),
            function(i) {
              list(
                area_code = x$area_code[[i]],
                time = x$time[[i]],
                status = x$status[[i]],
                status_label = x$status_label[[i]]
              )
            }
          )
        )
      }
    )
  }
}

WRITE_JSON(series_status, "series-status.json")
# The empty list remains a valid asset when optional status inputs are unavailable

# ////////////////////////////////////////////////////
# 3. TWFE Observation-Status Audit and Sample Areas ----
# ////////////////////////////////////////////////////

sample_path <- PROJECT_PATH(
  "outputs",
  "diagnostics",
  "twfe-employment-life-satisfaction-sample.csv"
)
area_path <- PROJECT_PATH(
  "outputs",
  "diagnostics",
  "twfe-employment-life-satisfaction-by-area.csv"
)

sample <- READ_CSV_IF_PRESENT(sample_path)
# Read optional existing model artifacts; this stage never reconstructs them
area_rows <- READ_CSV_IF_PRESENT(area_path)

if (
  is.null(raw) ||
  is.null(sample) ||
  is.null(area_rows) ||
  !all(c("REF_AREA", "TIME_PERIOD") %in% names(sample)) ||
  !"OBS_STATUS" %in% names(raw)
) {
  # State why the audit is unavailable while documenting that no analysis ran here
  twfe_audit <- list(
    available = FALSE,
    message = paste(
      "The observation-status audit requires the existing local Current",
      "well-being raw snapshot and TWFE sample diagnostics. No analysis",
      "or OECD download was run during this render."
    )
  )
} else {
  # Align raw source rows to the already saved matched sample using country-period keys
  raw_ids <- SERIES_ID(raw)
  sample_keys <- paste(
    CLEAN_CHARACTER(sample$REF_AREA),
    CLEAN_CHARACTER(sample$TIME_PERIOD),
    sep = "|"
  )
  raw_keys <- paste(
    CLEAN_CHARACTER(raw$REF_AREA),
    CLEAN_CHARACTER(raw$TIME_PERIOD),
    sep = "|"
  )

  # Identify the two configured analytical series represented in the saved TWFE sample
  targets <- c(
    "11_1|0_TO_10|_T|_T|_T|HSL_11" = "Life satisfaction",
    "2_1|PT_POP_Y25T64|_T|_T|_T|HSL_2" = "Employment rate"
  )

  keep <- raw_ids %in% names(targets) & raw_keys %in% sample_keys
  # Retain status codes only for matched observations in the two selected series
  audit_rows <- data.frame(
    variable = unname(targets[raw_ids[keep]]),
    status = CLEAN_CHARACTER(raw$OBS_STATUS[keep]),
    stringsAsFactors = FALSE
  )
  audit_rows$status[!nzchar(audit_rows$status)] <- "(blank)"

  if (nrow(audit_rows) == 0L) {
    # Preserve a valid empty summary when no matched status-coded rows are present
    status_summary <- list()
  } else {
    # Count variable-by-status combinations for compact browser reporting
    summary_table <- as.data.frame(
      xtabs(~ variable + status, data = audit_rows),
      stringsAsFactors = FALSE
    )
    summary_table <- summary_table[summary_table$Freq > 0L, , drop = FALSE]
    summary_table <- summary_table[order(summary_table$variable, summary_table$status), , drop = FALSE]

    # Convert the table to JSON-friendly records and attach human-readable labels
    status_summary <- unname(
      lapply(
        seq_len(nrow(summary_table)),
        function(i) {
          status <- as.character(summary_table$status[[i]])
          label <- if (identical(status, "(blank)")) {
            "No status code supplied"
          } else {
            unname(status_labels[status])
          }
          if (is.na(label) || !nzchar(label)) {
            label <- "Label unavailable"
          }

          list(
            variable = as.character(summary_table$variable[[i]]),
            status = status,
            status_label = label,
            observations = as.integer(summary_table$Freq[[i]])
          )
        }
      )
    )
  }

  # Accommodate the known area-summary column spellings before listing sample areas
  code_column <- intersect(
    c("REF_AREA", "ref_area", "CODE", "code"),
    names(area_rows)
  )
  label_column <- intersect(
    c("UNIT_LABEL", "unit_label", "REF_AREA_LABEL", "ref_area_label", "LABEL", "label"),
    names(area_rows)
  )

  codes <- if (length(code_column) > 0L) {
    CLEAN_CHARACTER(area_rows[[code_column[[1]]]])
  } else {
    rep("", nrow(area_rows))
  }
  labels <- if (length(label_column) > 0L) {
    CLEAN_CHARACTER(area_rows[[label_column[[1]]]])
  } else {
    rep("", nrow(area_rows))
  }

  # Order areas by label when available to give the browser a stable readable list
  area_order <- order(ifelse(nzchar(labels), labels, codes), codes)
  areas <- unname(
    lapply(
      area_order,
      function(i) list(code = codes[[i]], label = labels[[i]])
    )
  )

  # Package the status summary and areas as presentation-only audit information
  twfe_audit <- list(
    available = TRUE,
    note = paste(
      "Status codes are counted on the frozen full matched sample used by the",
      "TWFE workflow. No observations are automatically excluded because of",
      "their status code."
    ),
    status_summary = status_summary,
    areas = areas
  )
}

WRITE_JSON(twfe_audit, "twfe-audit.json")

# ////////////////////////////////////////////////////
# 4. Retrieval Provenance ----
# ////////////////////////////////////////////////////

manifest_path <- PROJECT_PATH("data", "retrieval-manifest.csv")
# Load local provenance when available; a missing manifest is meaningful for frozen caches
manifest <- READ_CSV_IF_PRESENT(manifest_path)

if (is.null(manifest) && file.exists(PROJECT_PATH("assets", "retrieval-manifest.json"))) {
  retrieval_manifest <- jsonlite::read_json(PROJECT_PATH("assets", "retrieval-manifest.json"), simplifyVector = FALSE)
} else if (is.null(manifest)) {
  # Explain the known limitation without inferring unavailable historic provenance
  retrieval_manifest <- list(
    available = FALSE,
    message = paste(
      "This frozen snapshot predates retrieval-manifest logging. Its exact",
      "original retrieval timestamp is unavailable and is not inferred from",
      "file modification times."
    )
  )
} else {
  # Select a stable public subset of provenance fields for the browser-facing record
  fields <- c(
    "resource_type",
    "key",
    "title",
    "agency",
    "dataflow",
    "version",
    "url",
    "retrieved_at_utc",
    "sha256",
    "http_status",
    "etag",
    "last_modified",
    "content_type",
    "cache_reused",
    "retrieval_timestamp_status"
  )

  for (field in setdiff(fields, names(manifest))) {
    # Supply typed missing columns so historical manifests serialize to one schema
    manifest[[field]] <- NA_character_
  }

  manifest <- manifest[fields]
  manifest[] <- lapply(manifest, CLEAN_CHARACTER)

  # Convert the selected, normalized manifest rows into JSON-friendly records
  rows <- unname(
    lapply(
      seq_len(nrow(manifest)),
      function(i) as.list(manifest[i, , drop = FALSE])
    )
  )

  retrieval_manifest <- list(available = TRUE, rows = rows)
}

WRITE_JSON(retrieval_manifest, "retrieval-manifest.json")

message(
  "Derived presentation-only assets: ",
  file.path(assets_dir, "series-status.json"), ", ",
  file.path(assets_dir, "twfe-audit.json"), ", ",
  file.path(assets_dir, "retrieval-manifest.json")
)
# FINAL OUTPUT LINE
