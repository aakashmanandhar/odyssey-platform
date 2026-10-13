-- Odyssey bronze pipeline: Overture places landed per release/country/destination -> governed streaming table.
-- Auto Loader processes each landing file exactly once; expectations count (and where marked, drop) bad rows.
CREATE OR REFRESH STREAMING TABLE overture_places (
  CONSTRAINT has_place_id    EXPECT (id IS NOT NULL)           ON VIOLATION DROP ROW,
  CONSTRAINT has_geometry    EXPECT (geometry IS NOT NULL)     ON VIOLATION DROP ROW,
  CONSTRAINT has_lineage     EXPECT (_destination_key <> ''),
  CONSTRAINT confidence_0_1  EXPECT (confidence IS NULL OR confidence BETWEEN 0 AND 1)
)
COMMENT "Overture places, raw columns as delivered plus ingestion lineage (release, country, destination, file)."
AS SELECT
  *,
  regexp_extract(_metadata.file_path, 'release=([^/]+)', 1)     AS _source_release,
  regexp_extract(_metadata.file_path, 'country=([^/]+)', 1)     AS _country_iso3,
  regexp_extract(_metadata.file_path, 'destination=([^/]+)', 1) AS _destination_key,
  _metadata.file_path                                           AS _source_file,
  current_timestamp()                                           AS _ingested_at
FROM STREAM read_files('${landing_path}/overture_places/', format => 'parquet')
WHERE _metadata.file_path LIKE '%/country=%/destination=%';
