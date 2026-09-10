const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { forEachCsvRow } = require("../src/data/loadGtfs");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gtfs-stream-test-"));
const file = path.join(directory, "sample.txt");

try {
    fs.writeFileSync(file,
        "id,name,note\r\n" +
        "1,Plain,Value\r\n" +
        "2,\"Comma, Name\",\"Said \"\"hello\"\"\"\r\n" +
        "3,\"ÉTS stop\",\"first line\r\nsecond line\"\r\n"
    );

    const rows = [];
    forEachCsvRow(file, row => rows.push(row), { chunkSize: 3 });

    assert.deepEqual(rows, [
        { id: "1", name: "Plain", note: "Value" },
        { id: "2", name: "Comma, Name", note: "Said \"hello\"" },
        { id: "3", name: "ÉTS stop", note: "first line\r\nsecond line" }
    ]);
    console.log("Streaming GTFS parser tests passed.");
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}
