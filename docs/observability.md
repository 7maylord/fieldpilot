# Observability

FieldPilot exposes Prometheus metrics at `GET /api/v1/metrics`. The endpoint is
public so a private-network scraper can reach it; it must not be exposed by the
public ingress in hosted environments. Authenticated clients report bounded
failure categories to `POST /api/v1/metrics/client-failures`.

## Local stack

Start the API, then run:

```sh
docker compose up -d prometheus grafana
```

- Prometheus: <http://localhost:9090>
- Grafana: <http://localhost:3002> (local default `admin` / `admin`)
- Dashboard: **FieldPilot Operations**

The provisioned dashboard covers HTTP traffic and latency, PostgreSQL and
Redis readiness, queue depth, sync outcomes, conflicts, media, reports, SSE
connections, and client failures. Ten matching alert rules live in
`infrastructure/observability/alerts.yml`.

## Verification

```sh
docker compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec -T prometheus promtool check rules /etc/prometheus/alerts.yml
curl --fail http://localhost:9090/-/ready
curl --fail http://localhost:3002/api/health
```

An API scrape target is healthy only while FieldPilot is listening on port
3001. Alert delivery is deployment-specific: production must connect
Prometheus to the platform's paging receiver and route warnings separately
from pages.
