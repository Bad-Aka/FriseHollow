import type { View } from "./timeline";

// Fixed decorative artwork for each timeline; never a character identity in lore.
export const VIEW_VISUALS: Record<View, { file: string; width: number; height: number }> = {
  general: { file: "mascot.png", width: 988, height: 1220 },
  clover: { file: "lore-mascot.png", width: 1098, height: 1194 },
  diamond: { file: "mascot-status.png", width: 1004, height: 1464 },
  neutre: { file: "mascot-candidatures.png", width: 846, height: 1264 },
};
