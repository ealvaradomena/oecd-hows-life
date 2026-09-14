# ==============================================================================
# INPUTS
# ==============================================================================
# - None; helper functions operate on in-memory data supplied by callers.
#
# OUTPUTS
# ==============================================================================
# - None.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# Dataflow Comparison Helpers
#
# Purpose:
# - Harmonize related How's Life? dataflows
# - Test whether demographic dataflows reproduce observations in Current well-being
# - Classify exact matches, value disagreements, and dataflow-only records
#
# Requirements:
# - Processed Current well-being and demographic RDS snapshots
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaromena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Harmonize Parent Scope ----
#
#
# ////////////////////////////////////////////////////

HARMONIZE_PARENT_SCOPE <- function(
  parent,
  child,
  total_codes = list(
    AGE = "_T",
    SEX = "_T",
    EDUCATION_LEV = "_T"
  )
) {
  # Identify demographic dimensions present only in the broader parent cube;
  # they must be restricted to totals for an like-for-like comparison
  demographic_dimensions <- names(total_codes)

  omitted_from_child <- setdiff(
    intersect(
      demographic_dimensions,
      names(parent)
    ),
    names(child)
  )

  # Restrict each omitted dimension to its OECD total code before comparison,
  # matching the scope implicitly represented by the specialized child dataflow
  for (dimension in omitted_from_child) {
    parent <- parent |>
      dplyr::filter(
        .data[[dimension]] == total_codes[[dimension]]
      )
  }

  parent
}

COMPARISON_KEYS <- function(parent, child) {
  # Build record identity from canonical dimensions shared by both dissemination
  # views, avoiding non-comparable fields such as values and annotations
  canonical_dimensions <- c(
    "REF_AREA",
    "MEASURE",
    "UNIT_MEASURE",
    "AGE",
    "SEX",
    "EDUCATION_LEV",
    "DOMAIN",
    "TIME_PERIOD"
  )

  intersect(
    canonical_dimensions,
    intersect(
      names(parent),
      names(child)
    )
  )
}


# ////////////////////////////////////////////////////
#
#
# 2. Validate Comparison Keys ----
#
#
# ////////////////////////////////////////////////////

ASSERT_UNIQUE_COMPARISON_KEYS <- function(
  data,
  keys,
  dataset_name
) {
  # Count records on the proposed identity before joining; duplicate keys would
  # turn a one-to-one dataflow comparison into an ambiguous many-to-many match
  duplicates <- data |>
    dplyr::count(
      dplyr::across(
        dplyr::all_of(keys)
      ),
      name = "n"
    ) |>
    dplyr::filter(n > 1L)

  if (nrow(duplicates)) {
    # Halt before reporting overlap statistics based on non-unique records
    stop(
      dataset_name,
      " contains duplicate records on the comparison keys. ",
      "Inspect the dataflow dimensions before interpreting the comparison."
    )
  }

  invisible(TRUE)
}


# ////////////////////////////////////////////////////
#
#
# 3. Compare Parent and Child Dataflows ----
#
#
# ////////////////////////////////////////////////////

COMPARE_DATAFLOWS <- function(
  parent,
  child,
  value = "OBS_VALUE",
  tolerance = 1.0e-10,
  total_codes = list(
    AGE = "_T",
    SEX = "_T",
    EDUCATION_LEV = "_T"
  )
) {
  # Align the broader cube to the specialized dataflow's demographic scope
  parent_scoped <- HARMONIZE_PARENT_SCOPE(
    parent = parent,
    child = child,
    total_codes = total_codes
  )

  keys <- COMPARISON_KEYS(
    parent = parent_scoped,
    child = child
  )

  if (!length(keys)) {
    # No shared canonical identity means records cannot be compared safely
    stop("No shared canonical comparison keys were detected.")
  }

  # Retain the join keys and one separately named value from each dissemination
  # view, producing compact inputs for an auditable record-level comparison
  parent_small <- parent_scoped |>
    dplyr::select(
      dplyr::all_of(c(keys, value))
    ) |>
    dplyr::rename(
      parent_value = dplyr::all_of(value)
    ) |>
    dplyr::distinct()

  child_small <- child |>
    dplyr::select(
      dplyr::all_of(c(keys, value))
    ) |>
    dplyr::rename(
      child_value = dplyr::all_of(value)
    ) |>
    dplyr::distinct()

  # Verify that each compact input has exactly one observation per join key
  ASSERT_UNIQUE_COMPARISON_KEYS(
    data = parent_small,
    keys = keys,
    dataset_name = "Current well-being"
  )

  ASSERT_UNIQUE_COMPARISON_KEYS(
    data = child_small,
    keys = keys,
    dataset_name = "Specialized dataflow"
  )

  # Use a full join to retain shared records and records published by only one
  # view, rather than limiting the audit to their observed intersection
  joined <- dplyr::full_join(
    parent_small,
    child_small,
    by = keys
  )

  # Classify publication coverage and numeric agreement for downstream summary
  # tables and record-level audit samples
  joined |>
    dplyr::mutate(
      match_status = dplyr::case_when(
        is.na(parent_value) & !is.na(child_value) ~ "Child only",
        !is.na(parent_value) & is.na(child_value) ~ "Parent only",
        is.na(parent_value) & is.na(child_value) ~ "Both missing",
        abs(parent_value - child_value) <= tolerance ~ "Exact match",
        TRUE ~ "Different value"
      )
    )
}


# ////////////////////////////////////////////////////
#
#
# 4. Summarize Comparisons ----
#
#
# ////////////////////////////////////////////////////

COMPARISON_SUMMARY <- function(comparison) {
  # Define a stable reporting order so absent comparison outcomes still appear
  # as explicit zero-count categories in analytical tables
  status_order <- tibble::tibble(
    match_status = c(
      "Exact match",
      "Different value",
      "Parent only",
      "Child only",
      "Both missing"
    )
  )

  # Count the classified records and join to the full category template
  counts <- comparison |>
    dplyr::count(
      match_status,
      name = "observations"
    )

  status_order |>
    dplyr::left_join(
      counts,
      by = "match_status"
    ) |>
    dplyr::mutate(
      observations = dplyr::coalesce(
        observations,
        0L
      ),
      share = observations / nrow(comparison)
    )
}

COMPARISON_OVERVIEW <- function(comparison) {
  # Derive compact headline counts used by narrative reporting without making
  # callers reproduce the status-filtering logic
  summary <- COMPARISON_SUMMARY(comparison)

  COUNT_STATUS <- function(status) {
    # Retrieve a known category after the summary template guaranteed its row
    summary |>
      dplyr::filter(match_status == status) |>
      dplyr::pull(observations)
  }

  tibble::tibble(
    total_records = nrow(comparison),
    exact_match = COUNT_STATUS("Exact match"),
    different_value = COUNT_STATUS("Different value"),
    parent_only = COUNT_STATUS("Parent only"),
    child_only = COUNT_STATUS("Child only"),
    both_missing = COUNT_STATUS("Both missing")
  )
}

COMPARISON_RECORDS <- function(
  comparison,
  status,
  n = 20L
) {
  # Isolate a bounded audit sample for one outcome so pages can show examples
  # without serializing the full comparison result
  records <- comparison |>
    dplyr::filter(match_status == status)

  if (identical(status, "Different value")) {
    # Add the magnitude only where values disagree, keeping other samples compact
    records <- records |>
      dplyr::mutate(
        absolute_difference = abs(parent_value - child_value)
      )
  }

  # Draw a deterministic audit sample so examples are reproducible across renders.
  if (nrow(records) <= n) {
    return(records)
  }

  set.seed(1701L + sum(utf8ToInt(status)))
  records |>
    dplyr::slice_sample(n = n)
}
