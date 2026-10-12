provider "databricks" {
  profile = var.databricks_profile
}

locals {
  # Every (environment, schema) pair, keyed like "dev.bronze"
  catalog_schemas = {
    for pair in setproduct(keys(var.catalogs), var.schemas) :
    "${pair[0]}.${pair[1]}" => { env = pair[0], schema = pair[1] }
  }
}

# Catalogs are created once in the UI: the Databricks provider cannot create
# catalogs on Default Storage (Free Edition). Terraform reads them and manages
# everything inside them.
data "databricks_catalog" "this" {
  for_each = var.catalogs
  name     = each.value
}

resource "databricks_schema" "this" {
  for_each     = local.catalog_schemas
  catalog_name = data.databricks_catalog.this[each.value.env].name
  name         = each.value.schema
  comment      = "Odyssey ${each.value.schema} layer (${each.value.env}). Managed by Terraform."
}

resource "databricks_volume" "landing" {
  for_each     = var.catalogs
  name         = "landing"
  catalog_name = data.databricks_catalog.this[each.key].name
  schema_name  = databricks_schema.this["${each.key}.bronze"].name
  volume_type  = "MANAGED"
  comment      = "Raw file drop zone for extracts before bronze ingestion."
}
