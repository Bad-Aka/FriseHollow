import { createRoot } from "react-dom/client";
import { PALETTE_CSS_VARIABLES } from "../lib/factions";
import Chronicles from "../app/chronicles";
import { deviceTransport, hostTransport, type HollowChroniclesHost } from "./storage";
import "../app/globals.css";
import "../app/launcher.css";
import "../app/visuals.css";
import "../app/motion.css";

declare global { interface Window { hollowChroniclesHost?: HollowChroniclesHost } }

for (const [key, value] of Object.entries(PALETTE_CSS_VARIABLES)) document.documentElement.style.setProperty(key, value);
document.documentElement.style.setProperty("--hollow-world", `url("${new URL("./hollow/bg-launcher-v3.1.png", location.href).href}")`);
const embedded = new URLSearchParams(location.search).get("embed") === "1";
const transport = window.hollowChroniclesHost ? hostTransport(window.hollowChroniclesHost) : deviceTransport();
createRoot(document.getElementById("root")!).render(<Chronicles embedded={embedded} transport={transport}/>);
