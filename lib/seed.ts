import research from "./player-events.json";
import { playerBoardSchema, PLAYER_EDITION_ID } from "./timeline";

export const INITIAL_BOARD = playerBoardSchema.parse({
  schemaVersion: 1,
  appliedUpdates: ["neutral-timeline-2026-11-01", PLAYER_EDITION_ID],
  events: research,
});
