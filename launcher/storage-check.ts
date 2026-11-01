import { INITIAL_BOARD } from "../lib/seed";
import { playerBoardSchema } from "../lib/timeline";
import { deviceTransport, hostTransport } from "./storage";

const output = document.getElementById("results")!;
let failures = 0;
const check = async (name: string, run: () => unknown | Promise<unknown>) => {
  const line = document.createElement("li");
  try { await run(); line.textContent = `PASS — ${name}`; }
  catch (error) { failures++; line.textContent = `FAIL — ${name} : ${error instanceof Error ? error.message : error}`; }
  output.appendChild(line);
};
const assert = (value: unknown) => { if (!value) throw new Error("Résultat inattendu"); };
const rejects = async (run: () => unknown | Promise<unknown>) => {
  let rejected = false; try { await run(); } catch { rejected = true; } assert(rejected);
};
const name = `hollow-storage-check-${Date.now()}`;
const first = deviceTransport(name);
const second = deviceTransport(name);
const seed = structuredClone(INITIAL_BOARD);

await check("Catalogue public chargé depuis IndexedDB", async () => { const saved = await first.load(); assert(saved.board.events.length === 38 && saved.revision === 0); });
await check("Écriture persistante et relecture par une nouvelle connexion", async () => {
  seed.events[0].title = "Contrôle de persistance";
  assert(await first.save(seed, 0) === 1);
  const saved = await second.load(); assert(saved.revision === 1 && saved.board.events[0].title === seed.events[0].title);
});
await check("Deux écritures concurrentes : une seule acceptée", async () => {
  const results = await Promise.allSettled([first.save(seed, 1), second.save(seed, 1)]);
  assert(results.filter(result => result.status === "fulfilled").length === 1);
  assert(results.filter(result => result.status === "rejected").length === 1);
});
await check("Sauvegarde JSON publique validée sans changer les données", async () => {
  const board = await first.prepareImport(JSON.parse(JSON.stringify(INITIAL_BOARD))); assert(board.events.length === 38);
});
await check("Imports futurs, secrets et liens internes refusés", async () => {
  for (const change of [{ phase: "à-jouer" }, { secret: true }, { sourceUrl: "https://example.com/internal" }, { playerSafe: false }]) {
    const board = structuredClone(INITIAL_BOARD); Object.assign(board.events[0], change);
    await rejects(() => first.prepareImport(board));
  }
});
let nativeExport = "";
const native = hostTransport({
  version: 1, canEdit: true,
  async loadTimeline() { return { board: INITIAL_BOARD, revision: 7 }; },
  async saveTimeline(snapshot) { playerBoardSchema.parse(snapshot.board); assert(snapshot.revision === 7); return { revision: 8 }; },
  async chooseBackup() { return structuredClone(INITIAL_BOARD); },
  async saveBackup(contents, filename) { nativeExport = `${filename}:${JSON.parse(contents).events.length}`; },
});
await check("Lecture et sauvegarde par le pont natif du launcher", async () => { assert((await native.load()).revision === 7); assert(await native.save(INITIAL_BOARD, 7) === 8); });
await check("Import et export natifs sans téléchargement WebView", async () => {
  assert(playerBoardSchema.parse(await native.chooseImport!()).events.length === 38);
  await native.exportBackup!(JSON.stringify(INITIAL_BOARD), "controle.json"); assert(nativeExport === "controle.json:38");
});
await check("Compte joueur du launcher limité à la lecture", async () => {
  const reader = hostTransport({ version: 1, canEdit: false, async loadTimeline() { return { board: INITIAL_BOARD, revision: 0 }; } });
  assert(!reader.canEdit); await rejects(() => reader.save(INITIAL_BOARD, 0));
});
await check("Le pont natif doit confirmer une nouvelle révision", async () => {
  const invalid = hostTransport({ version: 1, canEdit: true, async loadTimeline() { return { board: INITIAL_BOARD, revision: 0 }; }, async saveTimeline() { return { revision: 0 }; } });
  await rejects(() => invalid.save(INITIAL_BOARD, 0));
});
document.getElementById("summary")!.textContent = failures ? `${failures} échec(s)` : "9 contrôles réussis";
document.title = failures ? "FAIL — Stockage Hollow" : "PASS — Stockage Hollow";
