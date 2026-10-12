output "catalogs" {
  value = { for env, c in data.databricks_catalog.this : env => c.name }
}

output "landing_volume_paths" {
  value = { for env, v in databricks_volume.landing : env => "/Volumes/${v.catalog_name}/${v.schema_name}/${v.name}" }
}
