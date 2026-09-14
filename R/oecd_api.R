# ==============================================================================
# INPUTS
# ==============================================================================
# - config/dataflows.yml: OECD API endpoint and registered dataflow settings.
# - OECD SDMX REST API: Data and structure responses when cache files are absent.
# - data/raw/*.csv and data/metadata/*-structure.xml: Existing cached responses, when available.
# - data/retrieval-manifest.csv: Existing retrieval records, when available.
#
# OUTPUTS
# ==============================================================================
# - data/raw/<dataflow>.csv: Cached OECD data response.
# - data/metadata/<dataflow>-structure.xml: Cached OECD structure response.
# - data/retrieval-manifest.csv: Retrieval provenance for cached and downloaded resources.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# OECD SDMX API Helpers
#
# Purpose:
# - Construct reproducible OECD SDMX API URLs
# - Download data and structure metadata with local caching
#
# Requirements:
# - Internet access to https://sdmx.oecd.org
# - Registered dataflows in config/dataflows.yml
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Build API URLs ----
#
#
# ////////////////////////////////////////////////////

BUILD_OECD_DATA_URL <- function(
  flow,
  key = "all",
  start_period = NULL,
  end_period = NULL,
  cfg = READ_PROJECT_CONFIG()
) {
  # Build the version-pinned endpoint from registry metadata so requests remain
  # tied to the exact dissemination version recorded in project configuration
  path <- paste0(
    cfg$dataflows$base_url,
    "/data/",
    flow$agency,
    ",",
    flow$dataflow,
    ",",
    flow$version,
    "/",
    key
  )

  query <- list(
    dimensionAtObservation = "AllDimensions",
    format = cfg$dataflows$format
  )

  # Include time bounds only when a caller supplied them, preserving the API's
  # full-dataflow default for standard cached snapshot downloads
  if (!is.null(start_period)) {
    query$startPeriod <- start_period
  }

  if (!is.null(end_period)) {
    query$endPeriod <- end_period
  }

  parsed_url <- httr2::url_parse(path)
  parsed_url$query <- query

  httr2::url_build(parsed_url)
}

BUILD_OECD_STRUCTURE_URL <- function(
  flow,
  cfg = READ_PROJECT_CONFIG()
) {
  # Request the version-pinned structure and all referenced metadata required to
  # translate codes into labels during the later SDMX processing stage
  paste0(
    cfg$dataflows$base_url,
    "/dataflow/",
    flow$agency,
    "/",
    flow$dataflow,
    "/",
    flow$version,
    "?references=all"
  )
}


# ////////////////////////////////////////////////////
#
#
# 2. Download Cached Resources ----
#
#
# ////////////////////////////////////////////////////

OECD_RETRIEVAL_MANIFEST_PATH <- function() {
  # Centralize the provenance log location shared by data and structure downloads
  here::here("data", "retrieval-manifest.csv")
}

SHA256_FILE <- function(path) {
  # Require hashing support because each manifest row records the exact cached
  # file content that subsequent processing scripts will consume
  if (!requireNamespace("digest", quietly = TRUE)) {
    stop("Package 'digest' is required to record OECD retrieval hashes.")
  }
  digest::digest(object = path, algo = "sha256", serialize = FALSE, file = TRUE)
}

RESPONSE_HEADER_OR_NA <- function(response, name) {
  # Cached-file records have no live HTTP response, so return a typed missing
  # value rather than attempting to recover unavailable server metadata
  if (is.null(response)) {
    return(NA_character_)
  }

  value <- httr2::resp_header(response, name)
  if (is.null(value) || !nzchar(value)) NA_character_ else value
}

RECORD_OECD_RETRIEVAL <- function(
  url,
  destination,
  flow,
  resource_type,
  response = NULL,
  retrieved_at_utc = NA_character_,
  cache_reused = FALSE
) {
  # Reconstruct the provenance-log path and ensure its parent exists before the
  # retrieval record is assembled or appended
  manifest_path <- OECD_RETRIEVAL_MANIFEST_PATH()
  dir.create(dirname(manifest_path), recursive = TRUE, showWarnings = FALSE)

  # Capture local file metadata at recording time; it anchors the provenance row
  # to the exact on-disk cache entry instead of relying on transient response data
  file_info <- file.info(destination)
  recorded_at <- format(Sys.time(), tz = "UTC", usetz = TRUE)
  file_mtime <- format(file_info$mtime, tz = "UTC", usetz = TRUE)

  # Build one complete provenance row, retaining URL, registry identity, file
  # fingerprint, HTTP details, and the distinction between download and reuse
  row <- tibble::tibble(
    resource_type = resource_type,
    key = as.character(flow$key),
    title = as.character(flow$title),
    agency = as.character(flow$agency),
    dataflow = as.character(flow$dataflow),
    version = as.character(flow$version),
    url = url,
    destination = sub(
      paste0(normalizePath(here::here(), winslash = "/"), "/"),
      "",
      normalizePath(destination, winslash = "/", mustWork = FALSE),
      fixed = TRUE
    ),
    retrieved_at_utc = retrieved_at_utc,
    manifest_recorded_at_utc = recorded_at,
    file_mtime_utc = file_mtime,
    sha256 = SHA256_FILE(destination),
    http_status = if (is.null(response)) NA_integer_ else httr2::resp_status(response),
    etag = RESPONSE_HEADER_OR_NA(response, "etag"),
    last_modified = RESPONSE_HEADER_OR_NA(response, "last-modified"),
    content_type = RESPONSE_HEADER_OR_NA(response, "content-type"),
    cache_reused = cache_reused,
    retrieval_timestamp_status = if (cache_reused) {
      "Exact original retrieval time unavailable: pre-manifest cached file"
    } else {
      "Recorded at download"
    }
  )

  # Read the earlier manifest with an explicit schema so cached and downloaded
  # records retain stable column types across repeated download-script runs
  existing <- if (file.exists(manifest_path)) {
    readr::read_csv(
      manifest_path,
      col_types = readr::cols(
        resource_type = readr::col_character(),
        key = readr::col_character(),
        title = readr::col_character(),
        agency = readr::col_character(),
        dataflow = readr::col_character(),
        version = readr::col_character(),
        url = readr::col_character(),
        destination = readr::col_character(),
        retrieved_at_utc = readr::col_character(),
        manifest_recorded_at_utc = readr::col_character(),
        file_mtime_utc = readr::col_character(),
        sha256 = readr::col_character(),
        http_status = readr::col_integer(),
        etag = readr::col_character(),
        last_modified = readr::col_character(),
        content_type = readr::col_character(),
        cache_reused = readr::col_logical(),
        retrieval_timestamp_status = readr::col_character()
      ),
      show_col_types = FALSE
    )
  } else {
    tibble::tibble()
  }

  if (nrow(existing) > 0L) {
    # Avoid adding duplicate provenance rows when an unchanged cache is reused
    same_file <- existing |>
      dplyr::filter(
        resource_type == row$resource_type[[1]],
        key == row$key[[1]],
        url == row$url[[1]],
        sha256 == row$sha256[[1]]
      )

    if (nrow(same_file) > 0L && cache_reused) {
      # The existing row already documents this exact local artifact
      return(invisible(manifest_path))
    }
  }

  # Append the new retrieval record and rewrite the manifest as the durable
  # provenance input for reproducibility and website-facing documentation
  readr::write_csv(
    dplyr::bind_rows(existing, row),
    manifest_path
  )

  invisible(manifest_path)
}


DOWNLOAD_OECD_RESOURCE <- function(
  url,
  destination,
  flow,
  resource_type,
  refresh = FALSE
) {
  # Reuse an existing local snapshot unless the caller explicitly requests a
  # refresh; older caches still receive a conservative provenance record
  if (file.exists(destination) && !refresh) {
    RECORD_OECD_RETRIEVAL(
      url = url,
      destination = destination,
      flow = flow,
      resource_type = resource_type,
      cache_reused = TRUE
    )
    return(
      invisible(destination)
    )
  }

  # Create the resource-specific cache directory before writing a new response
  dir.create(
    dirname(destination),
    recursive = TRUE,
    showWarnings = FALSE
  )

  # Issue the API request with compressed transport, a project user agent, and
  # bounded retries so transient failures do not silently create partial caches
  response <- httr2::request(url) |>
    httr2::req_headers(
      `Accept-Encoding` = "gzip, deflate, br"
    ) |>
    httr2::req_user_agent(
      "oecd-hows-life/0.1.0 (https://github.com/ealvaradomena/oecd-hows-life)"
    ) |>
    httr2::req_retry(max_tries = 3) |>
    httr2::req_perform()

  # Write the raw response exactly as returned because CSV and SDMX XML are
  # consumed by separate downstream parsers that expect the original payload
  writeBin(
    httr2::resp_body_raw(response),
    destination
  )

  # Record download-time metadata immediately after a successful cache write
  RECORD_OECD_RETRIEVAL(
    url = url,
    destination = destination,
    flow = flow,
    resource_type = resource_type,
    response = response,
    retrieved_at_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
    cache_reused = FALSE
  )

  invisible(destination)
}


DOWNLOAD_OECD_DATAFLOW <- function(
  flow,
  refresh = FALSE,
  cfg = READ_PROJECT_CONFIG()
) {
  # Derive the stable raw-CSV destination from the registry key so processing
  # helpers and the retrieval manifest can locate the same cached artifact
  destination <- here::here(
    "data",
    "raw",
    paste0(flow$key, ".csv")
  )

  # Delegate caching, request execution, and provenance recording to the shared helper
  DOWNLOAD_OECD_RESOURCE(
    url = BUILD_OECD_DATA_URL(
      flow = flow,
      cfg = cfg
    ),
    destination = destination,
    flow = flow,
    resource_type = "data",
    refresh = refresh
  )
}


DOWNLOAD_OECD_STRUCTURE <- function(
  flow,
  refresh = FALSE,
  cfg = READ_PROJECT_CONFIG()
) {
  # Derive the stable structure-metadata destination used by label extraction
  destination <- here::here(
    "data",
    "metadata",
    paste0(flow$key, "-structure.xml")
  )

  # Reuse the common download path so structure and data resources follow the
  # same refresh, retry, caching, and provenance rules
  DOWNLOAD_OECD_RESOURCE(
    url = BUILD_OECD_STRUCTURE_URL(
      flow = flow,
      cfg = cfg
    ),
    destination = destination,
    flow = flow,
    resource_type = "structure",
    refresh = refresh
  )
}
