# Infrastructure

Local services are defined in the root `docker-compose.yml`. Hosted AWS
infrastructure is managed from `terraform/`; see its README for environment
isolation and deployment commands. Prometheus and Grafana provisioning lives
in `observability/`.
