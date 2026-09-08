# ETS Multi-Stop Planner

A time-dependent, multi-stop journey planner for Edmonton Transit Service.
It combines local GTFS schedules, Oli Original for local transfers, RAPTOR for
transit-wide recovery, verified walking routes, GTFS shapes, and ETS real-time
vehicle positions.

## Run locally

```bash
npm install
node server.js
```

Open `http://127.0.0.1:3000/ets-app.html`.

For temporary phone testing on a trusted local network:

```bash
HOST=0.0.0.0 node server.js
```

## Project structure

```text
data/
  raw/                 ETS GTFS source files
  processed/           generated stop/route data
  cache/               persistent local cache files
  config/              transit-centre configuration data
src/
  api/                  Express endpoint registration
  config/               application and environment configuration
  data/                 GTFS loading and in-memory indexes
  geocode/              address geocoding
  routes/               stop/route lookup helpers
  spatial/              KD-tree and endpoint selection
  routing/
    cache/              routing-service cache adapters
    google/             Google walking verification
    graph/              Oli Original graph search
    ors/                ORS matrix filtering
    raptor/             transit-wide RAPTOR search
    transfers/          local directional transfer search
    transitCentres/     transit-centre graph and recovery
test/                    automated routing and integration tests
ets-app.html             current browser application
server.js                composition root and server startup
```

`server.js` is the composition root: it loads configuration and data, connects
modules, registers API endpoints, and starts the process. Routing rules belong
under `src/routing`; HTTP request/response logic belongs under `src/api`.

## Configuration

Copy `.env.example` to `.env` and provide the required service credentials.
Walking limits, endpoint radius, transfer time, RAPTOR limits, server binding,
and real-time refresh settings are centralized in `src/config/appConfig.js`.

Never put API keys in `ets-app.html` or commit `.env`.

## Routing modes

- **Normal mode:** preserves the order entered by the user.
- **Oli Original:** searches efficient local direct/transfer connections.
- **RAPTOR:** recovers transit-wide journeys when the local search cannot find
  a suitable connection.
- **Optimize mode (planned):** will reorder intermediate destinations while
  respecting fixed endpoints, dwell times, and time-dependent transit costs.

## Tests

```bash
npm test
```

Run the full suite after changing routing, walking, GTFS indexing, API modules,
or multi-stop time handling.
