import { z } from "zod";

export const PHASES = ["avant-royaumes", "fondation", "guerre", "après-guerre", "présent", "à-jouer", "indéterminée"] as const;
export const PHASE_LABELS: Record<string, string> = {
  "avant-royaumes": "Avant les royaumes", fondation: "Fondations", guerre: "La guerre", "après-guerre": "Après-guerre", présent: "Le présent", "à-jouer": "À jouer", indéterminée: "Période à préciser",
};
export const eventSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1, "Donne un titre à cet événement.").max(140),
  realm: z.enum(["diamond", "clover", "commun", "neutre"]),
  faction: z.enum(["diamond", "clover", "neutre", "deliees", "commun"]).optional(),
  neutral: z.boolean().default(false),
  phase: z.enum(PHASES),
  order: z.number().finite().min(-1000000).max(1000000),
  dateLabel: z.string().trim().min(1).max(140),
  summary: z.string().trim().max(8000),
  major: z.boolean(),
  certainty: z.enum(["Établi", "À situer", "À jouer"]),
  timeMode: z.enum(["relative", "year", "date"]).default("relative"),
  year: z.number().int().min(-100000).max(100000).nullable().default(null),
  preciseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Cette date n’existe pas.").nullable().default(null),
  sourceTitle: z.string().max(200).default(""),
  sourceUrl: z.string().max(1000).refine(v => !v || /^https?:\/\//i.test(v), "Le lien doit commencer par https://.").default(""),
  placementNote: z.string().max(2000).default(""),
  secret: z.boolean().default(false),
  playerSafe: z.boolean().default(false),
}).superRefine((event, ctx) => {
  if (event.timeMode === "year" && event.year === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["year"], message: "Ajoute une année." });
  if (event.timeMode === "date" && !event.preciseDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["preciseDate"], message: "Choisis une date." });
});
export type LoreEvent = z.infer<typeof eventSchema>;
export type Realm = LoreEvent["realm"];
export type View = "general" | "diamond" | "clover" | "neutre";
export const boardSchema = z.object({
  schemaVersion: z.literal(1),
  appliedUpdates: z.array(z.string().max(100)).max(50).default([]),
  events: z.array(eventSchema).max(500).refine(events => new Set(events.map(e => e.id)).size === events.length, "Deux événements portent le même identifiant."),
});
export type Board = z.infer<typeof boardSchema>;
export const PLAYER_EDITION_ID = "players-chronicles-2026-11-01";
export function isPastEvent(event: LoreEvent) { return event.certainty !== "À jouer" && event.phase !== "à-jouer"; }
export const playerBoardSchema = boardSchema.superRefine((board, ctx) => {
  if (board.events.some(event => !isPastEvent(event) || event.secret || !event.playerSafe || event.sourceUrl || event.sourceTitle)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["events"], message: "La frise accueille uniquement des faits passés et des récits destinés aux joueurs." });
  }
});
export const REALM_NAMES = { diamond: "Diamond", clover: "Clover", commun: "Les deux royaumes", neutre: "Zone neutre" };
export function ordered(events: LoreEvent[]) { return [...events].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)); }
export function inView(event: LoreEvent, view: View) {
  if (view === "general") return event.major;
  if (view === "neutre") return event.realm === "neutre" || event.neutral;
  return event.realm === view || event.realm === "commun";
}
export function fold(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
export function dateKey(event: LoreEvent): number | null {
  if (event.timeMode === "year" && event.year !== null) return event.year * 372;
  if (event.timeMode === "date" && event.preciseDate) {
    const [year, month, day] = event.preciseDate.split("-").map(Number);
    return year * 372 + month * 31 + day;
  }
  return null;
}
export function dateText(event: LoreEvent) {
  if (event.timeMode === "year" && event.year !== null) return `Année ${event.year}`;
  if (event.timeMode === "date" && event.preciseDate) {
    const [year, month, day] = event.preciseDate.split("-");
    return `${day}/${month}/${year}`;
  }
  return event.dateLabel;
}
// Dated events are ordered within their slots. Undated narrative anchors stay
// where the editor placed them: an unknown chronology must not become a date.
export function normalizeEvents(events: LoreEvent[]): LoreEvent[] {
  const all = ordered(events);
  const dated = all.filter(e => dateKey(e) !== null).sort((a, b) => dateKey(a)! - dateKey(b)! || a.order - b.order);
  let cursor = 0;
  return all.map((event, index) => ({ ...(dateKey(event) !== null ? dated[cursor++] : event), order: (index + 1) * 10 }));
}
export function insertAfter(events: LoreEvent[], event: LoreEvent, afterId: string): LoreEvent[] {
  const all = ordered(events.filter(e => e.id !== event.id));
  const index = afterId === "__start__" ? 0 : Math.max(0, all.findIndex(e => e.id === afterId) + 1);
  all.splice(index, 0, event);
  return normalizeEvents(all.map((item, i) => ({ ...item, order: (i + 1) * 10 })));
}
export function readImport(value: unknown): Board { return boardSchema.parse(value); }

// Add a new story once without replacing edited events or resurrecting older
// seed events the owner has removed. Afterward normal edits/deletions remain final.
export function applyTimelineUpdate(board: Board, updateId: string, additions: { event: LoreEvent; afterId: string }[], neutralIds: string[]): Board {
  if (board.appliedUpdates.includes(updateId)) return board;
  const shared = new Set(neutralIds);
  const events = ordered(board.events.map(event => shared.has(event.id) ? { ...event, neutral: true } : event));
  for (const addition of additions) {
    if (events.some(event => event.id === addition.event.id)) continue;
    const anchor = events.findIndex(event => event.id === addition.afterId);
    const index = addition.afterId === "__start__" ? 0 : anchor < 0 ? events.length : anchor + 1;
    events.splice(index, 0, addition.event);
  }
  return boardSchema.parse({
    ...board,
    appliedUpdates: [...board.appliedUpdates, updateId],
    events: events.map((event, index) => ({ ...event, order: (index + 1) * 10 })),
  });
}

// The catalogue and legacy identifiers are supplied only by the server.
// Original GM content is never a field of the returned player board.
export function preparePlayerBoard(board: Board, catalogue: LoreEvent[], aliases: Record<string, string>, legacyIds: string[]): Board {
  const profiles = new Map(catalogue.map(event => [event.id, event]));
  const legacy = new Set(legacyIds);
  const reviewed = board.appliedUpdates.includes(PLAYER_EDITION_ID);
  const events = new Map<string, LoreEvent>();
  for (const event of ordered(board.events)) {
    if (!isPastEvent(event)) continue;
    const id = aliases[event.id] || event.id;
    const profile = profiles.get(id);
    if (legacy.has(event.id) && !profile) continue;
    let safe: LoreEvent;
    if (profile && (!reviewed || !event.playerSafe || event.secret || id !== event.id)) {
      safe = { ...event, ...profile, order: event.order, timeMode: event.timeMode, year: event.year, preciseDate: event.preciseDate, major: event.major };
    } else {
      if (event.secret || !event.playerSafe) continue;
      safe = { ...event, sourceTitle: "", sourceUrl: "", secret: false };
    }
    // Keep an already-reviewed public record when both an old and new ID occur.
    if (!events.has(id) || (event.id === id && event.playerSafe)) events.set(id, safe);
  }
  const next = playerBoardSchema.parse({
    ...board,
    appliedUpdates: ["neutral-timeline-2026-11-01", PLAYER_EDITION_ID],
    events: [...events.values()],
  });
  return JSON.stringify(next) === JSON.stringify(board) ? board : next;
}
