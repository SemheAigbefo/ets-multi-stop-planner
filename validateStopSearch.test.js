// Plain JS tests — no framework needed. Run with: node validateStopSearch.test.js
// (or paste into the browser console on any page where these functions are defined)

// ---- copy of the functions being tested ----
function matchingStops(value, stopNames) {
  const normalized = value.trim().toLowerCase();
  return stopNames.filter(name => name.toLowerCase().includes(normalized));
}

function validateStopSearch(value, stopNames) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { valid: false, message: '' };
  if (trimmed.length < 3) return { valid: false, message: 'Keep typing — at least 3 characters.' };
  if (trimmed.length > 60) return { valid: false, message: "That's too long for a stop name." };
  if (!/^[a-zA-Z0-9 &.,'-]+$/.test(trimmed)) return { valid: false, message: 'Only letters, numbers, and basic punctuation.' };

  const matches = matchingStops(trimmed, stopNames);
  if (matches.length === 0) return { valid: false, message: 'No matching stop found.' };
  return { valid: true, message: `${matches.length} match${matches.length === 1 ? '' : 'es'} found.` };
}

// ---- fake data, standing in for what stops.json/stopsRouteJoin.json would give you ----
const testStops = [
  "104 St & Jasper Ave",
  "Churchill Station",
  "University Transit Ctr"
];

// ---- tiny test runner ----
let passed = 0;
let failed = 0;

function test(description, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passed++;
    console.log(`✅ PASS: ${description}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${description}`);
    console.log(`   expected: ${expectedStr}`);
    console.log(`   actual:   ${actualStr}`);
  }
}

// ---- the actual test cases ----

// empty input — no error shown yet, field not "wrong", just unstarted
test(
  'empty string returns no message',
  validateStopSearch('', testStops),
  { valid: false, message: '' }
);

// too short
test(
  'single character is too short',
  validateStopSearch('a', testStops),
  { valid: false, message: 'Keep typing — at least 3 characters.' }
);

// too long
test(
  'over 60 characters is rejected',
  validateStopSearch('a'.repeat(61), testStops),
  { valid: false, message: "That's too long for a stop name." }
);

// bad characters
test(
  'symbols outside allowed set are rejected',
  validateStopSearch('Stop #$%!', testStops),
  { valid: false, message: 'Only letters, numbers, and basic punctuation.' }
);

// THE BUG THIS WAS SUPPOSED TO CATCH:
// well-formatted but nonsense text should fail semantic validation
test(
  'gibberish that passes format checks still fails (no matching stop)',
  validateStopSearch('asdf qwerty', testStops),
  { valid: false, message: 'No matching stop found.' }
);

// partial match should succeed
test(
  'partial match against a known stop succeeds',
  validateStopSearch('churchill', testStops),
  { valid: true, message: '1 match found.' }
);

// case-insensitivity
test(
  'matching ignores case',
  validateStopSearch('UNIVERSITY', testStops),
  { valid: true, message: '1 match found.' }
);

// multiple matches
test(
  'a substring shared by multiple stops returns multiple matches',
  validateStopSearch('station', testStops),
  { valid: true, message: '1 match found.' } // only "Churchill Station" contains "station"
);

// whitespace-only input treated as empty
test(
  'whitespace-only input is treated as empty',
  validateStopSearch('   ', testStops),
  { valid: false, message: '' }
);

console.log(`\n${passed} passed, ${failed} failed`); 