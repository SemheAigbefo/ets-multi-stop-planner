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
const { StringDecoder } = require('string_decoder');

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

/*
 * Iterates a CSV file without retaining its complete text or parsed rows.
 *
 * The parser keeps CSV state across chunks, so quoted commas, escaped quotes,
 * CRLF input, UTF-8 characters split across chunks, and quoted newlines remain
 * valid. Only one decoded chunk and one row object are temporary at a time.
 */
function forEachCsvRow(filePath, onRow, { chunkSize = 64 * 1024 } = {}) {
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(chunkSize);
  const decoder = new StringDecoder('utf8');
  let headers = null;
  let row = [];
  let field = '';
  let inQuotes = false;
  let quotePending = false;

  function emitRow() {
    row.push(field);
    field = '';
    if (row.length === 1 && row[0] === '') { row = []; return; }

    if (!headers) {
      headers = row.map((value, index) =>
        (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim()
      );
    } else if (row.length === headers.length) {
      const record = {};
      for (let index = 0; index < headers.length; index++) {
        record[headers[index]] = row[index];
      }
      onRow(record);
    }
    row = [];
  }

  function consume(text) {
    for (let index = 0; index < text.length; index++) {
      const character = text[index];

      if (inQuotes) {
        if (!quotePending) {
          if (character === '"') quotePending = true;
          else field += character;
          continue;
        }

        if (character === '"') {
          field += '"';
          quotePending = false;
          continue;
        }

        inQuotes = false;
        quotePending = false;
        // The current character belongs to the unquoted state below.
      }

      if (character === '"') inQuotes = true;
      else if (character === ',') { row.push(field); field = ''; }
      else if (character === '\n') emitRow();
      else if (character !== '\r') field += character;
    }
  }

  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) consume(decoder.write(buffer.subarray(0, bytesRead)));
    } while (bytesRead > 0);
    consume(decoder.end());

    if (quotePending) {
      inQuotes = false;
      quotePending = false;
    }
    if (field !== '' || row.length) emitRow();
    if (inQuotes) throw new Error(`Unclosed quoted field in ${filePath}`);
  } finally {
    fs.closeSync(descriptor);
  }
}

function forEachGtfsRow(filename, onRow, options) {
  return forEachCsvRow(path.join(RAW_DIR, filename), onRow, options);
}

// --- the actual join ----------------------------------------------------
function buildStopsRouteJoin() {
  const stops = readGtfsFile('stops.txt');
  const routes = readGtfsFile('routes.txt');
  const trips = readGtfsFile('trips.txt');
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
  forEachGtfsRow('stop_times.txt', st => {
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
    readGtfsFile,
    forEachCsvRow,
    forEachGtfsRow
}; // to allow us resuse the parser for other modules
