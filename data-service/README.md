# Beta than nothing Data Service

Private FastAPI market-data service for the Beta than nothing dashboard.

Deploy this directory on Railway with root directory `data-service`. Keep it
private: the Next.js dashboard calls it over Railway private networking.

Required variables:

```text
PORT=8000
DATA_SERVICE_TOKEN=<same shared random secret used by the dashboard>
```

Optional variables:

```text
ALPHA_VANTAGE_KEY
FRED_API_KEY
```

Configure Railway's health-check path as `/health`.
