import type { LoreEvent } from "./timeline";

// Fixed project palette. Keep the same faction identity in every timeline,
// including shared events, imported boards, cards, previews and detail drawers.
export const FACTIONS = {
  clover: { label: "Clover", color: "#46E6A5" },
  diamond: { label: "Diamond", color: "#65B6FF" },
  neutre: { label: "Villages neutres", color: "#FFC861" },
  deliees: { label: "Les Déliées", color: "#FF6483" },
  commun: { label: "Histoire commune", color: "#B69AFF" },
} as const;
export type Faction = keyof typeof FACTIONS;
export const PALETTE_CSS_VARIABLES = Object.fromEntries(
  Object.entries(FACTIONS).map(([key, value]) => [`--${key}`, value.color]),
);

export function factionOf(event: LoreEvent): Faction {
  return event.faction ?? event.realm;
}
