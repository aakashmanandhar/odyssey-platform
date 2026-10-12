variable "databricks_profile" {
  description = "Databricks CLI profile in ~/.databrickscfg"
  type        = string
  default     = "odyssey"
}

variable "catalogs" {
  description = "Environment name => Unity Catalog catalog name"
  type        = map(string)
  default = {
    dev  = "odyssey_dev"
    prod = "odyssey"
  }
}

variable "schemas" {
  description = "Schemas created in every catalog"
  type        = list(string)
  default     = ["bronze", "silver", "gold", "ml", "ops"]
}
