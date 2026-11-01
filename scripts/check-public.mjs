import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const events = JSON.parse(await readFile(new URL("../lib/player-events.json", import.meta.url), "utf8"));
assert(events.length > 0);
assert.equal(new Set(events.map(e => e.id)).size, events.length);
for (const event of events) {
  assert(event.playerSafe && !event.secret, event.id);
  assert(!event.sourceUrl && !event.sourceTitle, event.id);
  assert(!["à-jouer", "présent"].includes(event.phase) && event.certainty !== "À jouer", event.id);
}
assert(!/docs\.google\.com/.test(JSON.stringify(events)));
console.log(`PASS — ${events.length} récits publics du passé, sans liens internes.`);
