# ==============================================================================
# INPUTS
# ==============================================================================
# - data/metadata/<dataflow>-structure.xml: Cached OECD SDMX structure metadata.
#
# OUTPUTS
# ==============================================================================
# - data/processed/<dataflow>-labels.rds: Reusable SDMX dimension-label dictionary.
# ==============================================================================

# ////////////////////////////////////////////////////
#
#
# SDMX Metadata Helpers
#
# Purpose:
# - Parse OECD SDMX structure metadata into reusable dimension-label dictionaries
# - Persist human-readable labels for processed How's Life? datasets
#
# Requirements:
# - SDMX structure XML files created by scripts/01-download-structures.R
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Parse Dimension Labels ----
#
#
# ////////////////////////////////////////////////////

READ_SDMX_DIMENSION_LABELS <- function(
  path,
  language = "en"
) {
  if (!file.exists(path)) {
    # Require the cached SDMX structure because label extraction depends on
    # metadata downloaded independently of the corresponding observations
    stop(
      "SDMX structure metadata not found: ",
      path,
      ". Run scripts/01-download-structures.R first."
    )
  }

  # Parse the XML document once, then locate dimension and codelist nodes that
  # describe the machine-readable codes in the downloaded OECD data
  document <- xml2::read_xml(path)

  dimension_nodes <- xml2::xml_find_all(
    document,
    ".//*[local-name()='DataStructureComponents']/*[local-name()='DimensionList']/*[@id]"
  )

  codelist_nodes <- xml2::xml_find_all(
    document,
    ".//*[local-name()='Codelists']/*[local-name()='Codelist']"
  )

  # Visit each declared dimension and assemble a reusable code-to-label table
  # for dimensions that are represented by a referenced codelist
  purrr::map_dfr(
    dimension_nodes,
    function(dimension_node) {
      dimension <- xml2::xml_attr(
        dimension_node,
        "id"
      )

      enumeration_ref <- xml2::xml_find_first(
        dimension_node,
        ".//*[local-name()='LocalRepresentation']/*[local-name()='Enumeration']/*[local-name()='Ref']"
      )

      # Time and other free-form dimensions may not reference a codelist, so
      # omit them rather than fabricating labels unavailable in the structure
      if (inherits(enumeration_ref, "xml_missing")) {
        return(
          tibble::tibble()
        )
      }

      codelist_id <- xml2::xml_attr(
        enumeration_ref,
        "id"
      )
      codelist_agency <- xml2::xml_attr(
        enumeration_ref,
        "agencyID"
      )
      codelist_version <- xml2::xml_attr(
        enumeration_ref,
        "version"
      )

      matches <-
        xml2::xml_attr(codelist_nodes, "id") == codelist_id &
        xml2::xml_attr(codelist_nodes, "agencyID") == codelist_agency &
        xml2::xml_attr(codelist_nodes, "version") == codelist_version

      codelist <- codelist_nodes[matches]

      if (length(codelist) != 1L) {
        # A dimension must resolve to one unambiguous codelist before labels
        # can be safely joined to downstream series inventories
        stop(
          "Expected exactly one codelist for dimension ",
          dimension,
          "; found ",
          length(codelist),
          "."
        )
      }

      code_nodes <- xml2::xml_find_all(
        codelist[[1]],
        "./*[local-name()='Code']"
      )

      # Convert every code in the resolved codelist into one dictionary row
      purrr::map_dfr(
        code_nodes,
        function(code_node) {
          label_node <- xml2::xml_find_first(
            code_node,
            paste0(
              "./*[local-name()='Name'][@*[local-name()='lang'] = '",
              language,
              "']"
            )
          )

          # Prefer the requested language but retain the first supplied label
          # when that translation is absent from the source structure
          if (inherits(label_node, "xml_missing")) {
            label_node <- xml2::xml_find_first(
              code_node,
              "./*[local-name()='Name']"
            )
          }

          tibble::tibble(
            DIMENSION = dimension,
            CODE = xml2::xml_attr(code_node, "id"),
            LABEL = if (
              inherits(label_node, "xml_missing")
            ) {
              NA_character_
            } else {
              xml2::xml_text(label_node)
            },
            CODELIST = codelist_id
          )
        }
      )
    }
  ) |>
    # Keep one stable label for each dimension-code pair before persisting the
    # dictionary in a deterministic order for downstream joins
    dplyr::distinct(
      DIMENSION,
      CODE,
      .keep_all = TRUE
    ) |>
    dplyr::arrange(
      DIMENSION,
      CODE
    )
}


# ////////////////////////////////////////////////////
#
#
# 2. Persist Label Dictionaries ----
#
#
# ////////////////////////////////////////////////////

PROCESS_REGISTERED_STRUCTURE_LABELS <- function(
  flow,
  language = "en"
) {
  # Follow the shared filename convention used by the structure-download stage
  structure_path <- here::here(
    "data",
    "metadata",
    paste0(flow$key, "-structure.xml")
  )

  # Build the dictionary that makes coded series definitions readable in later
  # inventories and browser-facing assets
  labels <- READ_SDMX_DIMENSION_LABELS(
    path = structure_path,
    language = language
  )

  processed_path <- here::here(
    "data",
    "processed",
    paste0(flow$key, "-labels.rds")
  )

  # Persist the dictionary beside the processed observation snapshot so later
  # scripts can attach labels without reparsing the SDMX XML document
  saveRDS(
    labels,
    processed_path
  )

  invisible(processed_path)
}

# ////////////////////////////////////////////////////
#
#
# 3. Add Human-Readable Labels to Series Inventories ----
#
#
# ////////////////////////////////////////////////////

LABEL_PANEL_INVENTORY <- function(
  inventory,
  labels,
  dimensions = c(
    "MEASURE",
    "UNIT_MEASURE",
    "AGE",
    "SEX",
    "EDUCATION_LEV",
    "DOMAIN"
  )
) {
  # Join labels only for series dimensions represented in this inventory; this
  # lets the helper work with dataflows that expose different dimension sets
  available_dimensions <- intersect(
    dimensions,
    names(inventory)
  )

  # Add one human-readable label column at a time while preserving all source
  # codes that remain necessary for identifiers, joins, and reproducibility
  purrr::reduce(
    available_dimensions,
    function(result, dimension) {
      label_column <- paste0(
        dimension,
        "_LABEL"
      )

      dimension_labels <- labels |>
        dplyr::filter(
          DIMENSION == dimension
        ) |>
        dplyr::select(
          CODE,
          LABEL
        ) |>
        dplyr::rename(
          !!dimension := CODE,
          !!label_column := LABEL
        )

      result |>
        dplyr::left_join(
          dimension_labels,
          by = dimension
        )
    },
    .init = inventory
  )
}
