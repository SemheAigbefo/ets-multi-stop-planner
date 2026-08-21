// src/data/loadGtfs.js
//
// Reads raw GTFS files and builds a joined stop -> routes lookup.
// Expects these files in data/raw/ (from ETS's published GTFS feed):
//   stops.txt       (stop_id, stop_name, stop_lat, stop_lon)
//   routes.txt      (route_id, route_short_name, route_long_name)
//   trips.txt       (trip_id, route_id)
//   stop_times.txt  (trip_id, stop_id)
//
// Writes data/processed/stopsRouteJoin.json
//
// Run with: node src/data/loadGtfs.js
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '../../data/raw');
const OUT_FILE = path.join(__dirname, '../../data/processed/stopsRouteJoin.json');

// --- minimal CSV parser -----------------------------------------------
// GTFS files are plain CSV, but some fields (like route_long_name) can
// contain commas inside quotes, so a simple split(',') isn't safe.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      } else field += char;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const header = rows[0];
  return rows.slice(1)
    .filter(r => r.length === header.length)
    .map(r => {
      const obj = {};
      header.forEach((h, i) => { obj[h.trim()] = r[i]; });
      return obj;
    });
}

function readGtfsFile(filename) {
  const filePath = path.join(RAW_DIR, filename);
  const text = fs.readFileSync(filePath, 'utf-8');
  return parseCsv(text);
}

// --- the actual join ----------------------------------------------------
function buildStopsRouteJoin() {
  const stops = readGtfsFile('stops.txt');
  const routes = readGtfsFile('routes.txt');
  const trips = readGtfsFile('trips.txt');
  const stopTimes = readGtfsFile('stop_times.txt');
  const calendarDates = readGtfsFile('calendar_dates.txt');

  // trip_id -> route_id
  const tripToRoute = {};
  trips.forEach(t => { tripToRoute[t.trip_id] = t.route_id; });

  // route_id -> route info
  const routeById = {};
  routes.forEach(r => {
    routeById[r.route_id] = {
      routeId: r.route_id,
      shortName: r.route_short_name,
      longName: r.route_long_name
    };
  });

  // stop_id -> set of route_ids that serve it
  const stopRouteIds = {};
  stopTimes.forEach(st => {
    const routeId = tripToRoute[st.trip_id];
    if (!routeId) return;
    if (!stopRouteIds[st.stop_id]) stopRouteIds[st.stop_id] = new Set();
    stopRouteIds[st.stop_id].add(routeId);
  });

  // final joined structure: one entry per stop, with the routes serving it
  return stops.map(stop => {
    const routeIds = stopRouteIds[stop.stop_id] ? [...stopRouteIds[stop.stop_id]] : [];
    return {
      stopId: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lon: parseFloat(stop.stop_lon),
      routes: routeIds.map(id => routeById[id]).filter(Boolean)
    };
  });
}

function main() {
  const joined = buildStopsRouteJoin();
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(joined, null, 2));
  console.log(`Wrote ${joined.length} stops to ${OUT_FILE}`);
}

//main();
if (require.main === module) {
    main();
}

module.exports = {
    readGtfsFile
}; // to allow us resuse the parser for other modules