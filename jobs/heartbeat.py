# Databricks notebook source
# Odyssey platform heartbeat: proves a deployed job can reach its catalog and write to ops.
dbutils.widgets.text("catalog", "odyssey_dev")
catalog = dbutils.widgets.get("catalog")

expected = {"bronze", "silver", "gold", "ml", "ops"}
found = {row.databaseName for row in spark.sql(f"SHOW SCHEMAS IN {catalog}").collect()}
missing = expected - found
if missing:
    raise Exception(f"Missing schemas in {catalog}: {sorted(missing)}")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.ops.platform_heartbeat (
        run_at TIMESTAMP, catalog STRING, schemas_ok BOOLEAN, note STRING
    )
""")
spark.sql(f"""
    INSERT INTO {catalog}.ops.platform_heartbeat
    VALUES (current_timestamp(), '{catalog}', true, 'bundle heartbeat')
""")
print(f"Heartbeat OK: {catalog} has all {len(expected)} schemas; row written to ops.platform_heartbeat")
