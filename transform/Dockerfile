FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --root-user-action=ignore "dbt-databricks~=1.10"
ENV DBT_PROFILES_DIR=/dbt
WORKDIR /dbt
ENTRYPOINT ["dbt"]
