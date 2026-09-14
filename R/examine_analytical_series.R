# ////////////////////////////////////////////////////
#
#
# Examine Analytical-Series Counts
#
# Purpose:
# - Reproduce selected OECD Data Explorer counts from the cached Current well-being response
# - Compare labelled and SDMX-code definitions of project analytical series
#
# Requirements:
# - data/raw/current_wellbeing.csv created by scripts/02-download-data.R
# - readr and dplyr available in the project R environment
#
# AI Disclosure:
# - Code documentation and formatting assisted by ChatGPT
# - Prompt used: https://github.com/ealvaradomena/my-prompts/blob/main/prompts/pretty-r-scripts.md
#
# ////////////////////////////////////////////////////

# ////////////////////////////////////////////////////
#
#
# 1. Read the Cached Current Well-Being Response ----
#
#
# ////////////////////////////////////////////////////

# Load raw data
data <- readr::read_csv("data/raw/current_wellbeing.csv")

N_measures <- data |>
  dplyr::pull(Measure)|>
  unique() |>
  sort() |>
  length()

# ////////////////////////////////////////////////////
#
#
# 2. Reproduce the OECD Data Explorer Example ----
#
#
# ////////////////////////////////////////////////////

# Reproduce the active OECD Data Explorer example for Australia from 2010 onward
## See: https://data-explorer.oecd.org/vis?tm=current%20well-being&pg=0&snb=230&vw=tb&df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_HSL%40DF_HSL_CWB&df[ag]=OECD.WISE.WDP&df[vs]=1.1&dq=AUS.11_2%2B11_1%2B9_3%2B9_2%2B8_2%2B8_1_DEP%2B7_2%2B7_1_DEP%2B6_2%2B5_3%2B5_1%2B4_3%2B4_1%2B3_2%2B3_1%2B2_7%2B2_2%2B2_1%2B1_3%2B1_2%2B1_1.._T._T._T.&pd=2010,&to[TIME_PERIOD]=false&lb=bt
measures <- c(
  '1_1', '1_2', '1_3',
  '2_1', '2_2', '2_7',
  '3_2', 
  '5_1', '5_3',
  '6_2',
  '7_1',
  '8_1', '8_2',
  '9_2', '9_3',
  '11_1', '11_2'
)

data |>
  dplyr::filter(REF_AREA == 'AUS') |>
  dplyr::filter(TIME_PERIOD >= 2010) |>
  dplyr::filter(MEASURE %in% measures) |>
  dplyr::filter(
    AGE == '_T' & SEX == '_T' & EDUCATION_LEV == '_T'
  ) |>
  nrow() # Expected count for the referenced example: 187 observation rows

# ////////////////////////////////////////////////////
#
#
# 3. Count Labelled Analytical-Series Definitions ----
#
#
# ////////////////////////////////////////////////////

# Count distinct labelled combinations used to describe analytical series
df_txt <- data |>
  dplyr::select(
    Domain,
    Measure,
    `Unit of measure`,
    Age,
    Sex,
    `Education level`
  )

dplyr::distinct(df_txt) |>
  nrow() # Expected distinct analytical-series count: 302

# ////////////////////////////////////////////////////
#
#
# 4. Count SDMX-Code Analytical-Series Definitions ----
#
#
# ////////////////////////////////////////////////////

# Repeat the same distinct-series count using the compact SDMX code columns
df <- data |>
  dplyr::select(
    DOMAIN,
    MEASURE,
    UNIT_MEASURE,
    AGE,
    SEX,
    EDUCATION_LEV
  )

N_series <- dplyr::distinct(df) |>
  nrow() # Expected distinct analytical-series count: 302
# FINAL OUTPUT LINE

