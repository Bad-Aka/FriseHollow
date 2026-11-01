"use client";

import type { View } from "../lib/timeline";
import { VIEW_VISUALS } from "../lib/visuals";

// Original user-supplied assets, with their existing transparency untouched.
export function HollowLogo() {
  return <svg className="hollow-wordmark" viewBox="60 230 1740 470" role="img" aria-label="Hollow"><image href="./hollow/logo-hollow-monochrome.png" width="1831" height="859"/></svg>;
}

export function HollowClover({ className = "" }: { className?: string }) {
  return <img className={className} src="./hollow/nav-home-v3.png" alt="" aria-hidden="true" width="932" height="904" loading="lazy" decoding="async"/>;
}

export function LauncherCharacter({ view }: { view: View }) {
  const visual = VIEW_VISUALS[view];
  return <figure className="hero-illustration"><img key={view} className="hero-character" src={`./hollow/${visual.file}`} alt="" aria-hidden="true" width={visual.width} height={visual.height} decoding="async"/></figure>;
}

export function StatusMascot({ className = "" }: { className?: string }) {
  return <span className={`status-mascot ${className}`} aria-hidden="true"><img className="eyes-open" src="./hollow/mascot-status.png" alt="" width="1004" height="1464" loading="lazy" decoding="async"/><img className="eyes-closed" src="./hollow/mascot-status-blink-v2.png" alt="" width="1004" height="1464" loading="lazy" decoding="async"/></span>;
}

export function Companion({ mood, className = "" }: { mood: "sleep" | "success" | "error"; className?: string }) {
  const file = mood === "sleep" ? "bird-3.png" : mood === "success" ? "bird-2.png" : "bird-1.png";
  return <img className={`bird-companion ${className}`} src={`./hollow/${file}`} alt="" aria-hidden="true" width="703" height="678" decoding="async"/>;
}
