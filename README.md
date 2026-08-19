# ets-multi-stop-planner
Multi-stop trip planner for Edmonton Transit Service (ETS) . Users can reorders stops, sets per-stop departure times, and returns route options using live GTFS/GTFS-RT data and the Google Maps Directions API.


relay/
├── data/
│   ├── raw/
│   │   └── GTFS .txt files
│   └── processed/
│       └── stopsRouteJoin.json
│
├── src/
│   ├── data/
│   │   ├── loadGtfs.js      #converts raw to processed and creates stopsRouteJoin.json
│   │   └── buildIndexes.js  #load the processed JSON and build your in-memory indexes
│   │
│   ├── geocode/
│   │   └── coordFun.js      #geocoding , hash map input for nin stop inputs 
│   │
│   ├── spatial/
│   │   └── nearestStop.js #takes lat and long from coordFunc,returns the nearest stops, KD tree
│   │
│   ├── routes/
│   │   └── getRouteByStop.js|nearest stop->stopID->stopsRouteJoin.json->routes servingthat stop
│   │
│   ├── map/
│   │   ├── initMap.js
│   │   ├── renderStops.js
│   │   └── renderRoute.js
│   │
│   └── index.js
│
└── index.html