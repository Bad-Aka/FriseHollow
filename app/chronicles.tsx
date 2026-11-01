"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clover, Cloud, Download, Eye, Flag, Gem, GripVertical, Layers3, List, LoaderCircle, LockKeyhole, Minus, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, Undo2, Upload, Waypoints, TentTree, Unlink, X } from "lucide-react";
import { INITIAL_BOARD } from "../lib/seed";
import { FACTIONS, factionOf, type Faction } from "../lib/factions";
import { Companion, HollowLogo, HollowClover, LauncherCharacter, StatusMascot } from "./brand-art";
import { cloudTransport, type TimelineTransport } from "../lib/timeline-transport";
import { boardSchema, playerBoardSchema, dateText, eventSchema, fold, inView, insertAfter, normalizeEvents, ordered, PHASE_LABELS, PHASES, REALM_NAMES, type Board, type LoreEvent, type View } from "../lib/timeline";

const VIEWS = {
  general: { label: "Vue générale", title: "Les chroniques de Hollow", description: "Un monde façonné par la magie, les royaumes et leurs choix. Explore les traces de son histoire.", icon: Waypoints },
  diamond: { label: "Diamond", title: "Les chroniques de Diamond", description: "Le prix de la survie. Des terres appauvries à l’unification du royaume.", icon: Gem },
  clover: { label: "Clover", title: "Les chroniques de Clover", description: "L’héritage du pouvoir. Des premières alliances aux héritages de la guerre.", icon: Clover },
  neutre: { label: "Zone neutre", title: "Les terres libres, les liens brisés.", description: "La mémoire des villages libres et des premiers secours.", icon: TentTree },
};
type Toast = { text: string; kind: "success" | "error"; undo?: boolean };
type Editor = { event: LoreEvent; isNew: boolean; afterId: string };
const iconSize = 17;

function Tip({ text, children }: { text: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<{left: number; top: number; below: boolean} | null>(null);
  const show = (element: HTMLElement) => {
    if (window.matchMedia("(hover: none)").matches) return;
    const r = element.getBoundingClientRect();
    setAnchor({ left: Math.min(window.innerWidth - 127, Math.max(127, r.left + r.width / 2)), top: r.top < 55 ? r.bottom + 10 : r.top - 9, below: r.top < 55 });
  };
  return <span className="tip-wrap" onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setAnchor(null)} onFocus={e => show(e.currentTarget)} onBlur={() => setAnchor(null)}>{children}{anchor && createPortal(<span className="button-tip" role="tooltip" style={{ left: anchor.left, top: anchor.top, transform: `translate(-50%, ${anchor.below ? "0" : "-100%"})` }}>{text}</span>, document.body)}</span>;
}
function Modal({ title, eyebrow, children, onClose, className = "" }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; if (node && !node.open) { node.showModal(); node.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="file"])')?.focus(); } return () => { if (node?.open) node.close(); }; }, []);
  return <dialog ref={dialog} aria-label={title} className={`modal ${className}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner"><header className="modal-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer la fenêtre"><X size={20}/></button></header>{children}</div>
  </dialog>;
}
function FactionMark({ faction }: { faction: Faction }) { const Icon = faction === "diamond" ? Gem : faction === "clover" ? Clover : faction === "neutre" ? TentTree : faction === "deliees" ? Unlink : Layers3; return <Icon size={14}/>; }
function Badge({ event }: { event: LoreEvent }) { const faction = factionOf(event); return <div className="badge-row"><span className={`realm-badge faction-${faction}`}><FactionMark faction={faction}/>{FACTIONS[faction].label}</span>{faction !== event.realm && <span className="scope-badge">{REALM_NAMES[event.realm]}</span>}</div>; }

export default function Chronicles({ transport = cloudTransport, embedded = false }: { transport?: TimelineTransport; embedded?: boolean } = {}) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const boardRef = useRef(board);
  const revision = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("general");
  const [compact, setCompact] = useState(embedded);
  const direction = useRef(1);
  const transition = useRef<{ skipTransition(): void } | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [layout, setLayout] = useState<"timeline" | "list">("timeline");
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteEvent, setDeleteEvent] = useState<LoreEvent | null>(null);
  const [importBoard, setImportBoard] = useState<Board | null>(null);
  const [past, setPast] = useState<Board[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ event: LoreEvent; left: number; top: number; below: boolean } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pan = useRef<{ x: number; scroll: number } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollMax, setScrollMax] = useState(0);
  const all = useMemo(() => ordered(board.events), [board]);
  const events = useMemo(() => all.filter(e => inView(e, view) && (status === "all" || e.certainty === status) && (!query || fold(`${e.title} ${e.summary} ${e.dateLabel} ${e.sourceTitle}`).includes(fold(query)))), [all, view, status, query]);
  const selected = all.find(e => e.id === selectedId);
  const counts = useMemo(() => ({ general: all.filter(e => e.major).length, diamond: all.filter(e => inView(e, "diamond")).length, clover: all.filter(e => inView(e, "clover")).length, neutre: all.filter(e => inView(e, "neutre")).length }), [all]);
  const info = VIEWS[view];
  const step = 190 * zoom;
  const canvasWidth = Math.max(820, 350 + Math.max(0, events.length - 1) * step + 180);
  const selectedIndex = events.findIndex(event => event.id === selectedId);
  const progress = scrollMax > 0 ? scrollProgress / scrollMax : 0;
  const currentStop = Math.round(progress * Math.max(0, events.length - 1));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") === "1") setCompact(true);
    const initial = params.get("view");
    if (initial && Object.hasOwn(VIEWS, initial)) setView(initial as View);
    return () => transition.current?.skipTransition();
  }, []);

  const load = useCallback(async () => {
    setLoadError(""); setReady(false);
    try {
      const payload = await transport.load();
      const validated = playerBoardSchema.parse(payload.board);
      if (typeof payload.revision !== "number") throw new Error("La connexion doit être actualisée.");
      revision.current = payload.revision; boardRef.current = validated; setBoard(validated); setReady(true);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Connexion indisponible."); }
  }, [transport]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 10000 : 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setHover(null); setSelectedId(null); if (scroller.current) scroller.current.scrollLeft = 0; }, [view, query, status]);
  useEffect(() => {
    const node = scroller.current; if (!node) return;
    const update = () => { setScrollProgress(node.scrollLeft); setScrollMax(Math.max(0, node.scrollWidth - node.clientWidth)); };
    const observer = new ResizeObserver(update); observer.observe(node); node.addEventListener("scroll", update); update();
    return () => { observer.disconnect(); node.removeEventListener("scroll", update); };
  }, [canvasWidth, layout, selectedId, events.length]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelectedId(null); setMenu(false); setHover(null); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  useEffect(() => { const node = scroller.current; if (!node) return; const clear = () => setHover(null); node.addEventListener("scroll", clear); window.addEventListener("resize", clear); return () => { node.removeEventListener("scroll", clear); window.removeEventListener("resize", clear); }; }, []);

  const commit = async (next: Board, message: string, remember = true): Promise<boolean> => {
    if (!transport.canEdit || !ready || busy) return false;
    setBusy(true); const previous = boardRef.current;
    try {
      const valid = playerBoardSchema.parse(next);
      revision.current = await transport.save(valid, revision.current); boardRef.current = valid; setBoard(valid);
      if (remember) setPast(history => [...history.slice(-19), previous]);
      setToast({ text: message, kind: "success", undo: remember }); return true;
    } catch (error) { setToast({ text: error instanceof Error ? error.message : "Impossible d’enregistrer.", kind: "error" }); return false; }
    finally { setBusy(false); }
  };
  const undo = async () => { const previous = past.at(-1); if (!previous) return; if (await commit(previous, "Dernière modification annulée.", false)) { setPast(history => history.slice(0, -1)); setSelectedId(null); } };
  const focusEvent = (id: string) => { setTimeout(() => document.querySelector(`[data-event-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }), 80); };
  const openEditor = (event?: LoreEvent) => {
    if (!editing) return;
    setHover(null); setMenu(false);
    if (event) { const i = all.findIndex(e => e.id === event.id); setEditor({ event: { ...event }, isNew: false, afterId: all[i - 1]?.id || "__start__" }); }
    else {
      const last = all.filter(e => inView(e, view)).at(-1) || all.at(-1);
      const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      setEditor({ isNew: true, afterId: last?.id || "__start__", event: { id, title: "", summary: "", realm: view === "general" ? "commun" : view, phase: "indéterminée", order: (last?.order || 0) + 1, dateLabel: "Date à préciser", major: view === "general", certainty: "À situer", timeMode: "relative", year: null, preciseDate: null, sourceTitle: "", sourceUrl: "", placementNote: "", secret: false, playerSafe: true, neutral: view === "neutre" } });
    }
  };
  const saveEditor = async (event: LoreEvent, afterId: string) => {
    const next = { ...board, events: insertAfter(board.events, event, afterId) };
    if (await commit(next, editor?.isNew ? "L’événement a rejoint la chronologie." : "Événement mis à jour.")) { setEditor(null); setSelectedId(event.id); focusEvent(event.id); }
  };
  const moveEvent = async (event: LoreEvent, offset: number) => {
    const current = all.findIndex(e => e.id === event.id); const target = current + offset; if (target < 0 || target >= all.length) return;
    const copy = [...all]; copy.splice(current, 1); copy.splice(target, 0, event);
    if (await commit({ ...board, events: normalizeEvents(copy.map((e, i) => ({ ...e, order: (i + 1) * 10 }))) }, "Position mise à jour.")) focusEvent(event.id);
  };
  const dropEvent = async (target: LoreEvent) => {
    setOverId(null); const id = dragId; setDragId(null); if (!id || id === target.id) return;
    const event = all.find(e => e.id === id); if (!event) return;
    const without = all.filter(e => e.id !== id); const targetIndex = without.findIndex(e => e.id === target.id);
    const after = without[targetIndex - 1]?.id || "__start__";
    await commit({ ...board, events: insertAfter(board.events, event, after) }, "Événement déplacé.");
  };
  const exportData = async () => {
    const contents = JSON.stringify({ ...board, exportedAt: new Date().toISOString(), title: "Hollow — Chroniques" }, null, 2);
    const filename = `hollow-chroniques-${new Date().toISOString().slice(0, 10)}.json`;
    if (transport.exportBackup) {
      try { await transport.exportBackup(contents, filename); setToast({ text: "Sauvegarde exportée.", kind: "success" }); }
      catch { setToast({ text: "La sauvegarde n’a pas pu être exportée.", kind: "error" }); }
      setMenu(false); return;
    }
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMenu(false); setToast({ text: "Sauvegarde téléchargée.", kind: "success" });
  };
  const importData = async (file?: File) => {
    if (!file) return; setMenu(false);
    try {
      if (file.size > 2000000) throw new Error("Le fichier est trop volumineux.");
      const raw = boardSchema.parse(JSON.parse(await file.text()));
      setImportBoard(playerBoardSchema.parse(await transport.prepareImport(raw)));
    }
    catch { setToast({ text: "Ce fichier n’est pas une sauvegarde Hollow valide. Ta frise est conservée.", kind: "error" }); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const chooseImport = async () => {
    if (!transport.chooseImport) { fileInput.current?.click(); return; }
    setMenu(false);
    try {
      const raw = await transport.chooseImport();
      if (raw !== null) setImportBoard(playerBoardSchema.parse(await transport.prepareImport(boardSchema.parse(raw))));
    } catch { setToast({ text: "Ce fichier n’est pas une sauvegarde Hollow valide.", kind: "error" }); }
  };
  const showHover = (event: LoreEvent, element: HTMLElement) => {
    if (window.matchMedia("(hover: none)").matches || dragId || selectedId === event.id) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const rect = element.getBoundingClientRect(); const below = rect.top < 300;
      setHover({ event, left: Math.min(window.innerWidth - 358, Math.max(12, rect.left + rect.width / 2 - 170)), top: below ? rect.bottom + 12 : Math.max(12, rect.top - 225), below });
    }, 380);
  };
  const clearHover = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHover(null); };
  const toggleView = (next: View) => {
    if (next === view) return;
    const keys = Object.keys(VIEWS);
    direction.current = keys.indexOf(next) > keys.indexOf(view) ? 1 : -1;
    clearHover(); transition.current?.skipTransition();
    const update = () => { setView(next); setSelectedId(null); setQuery(""); setStatus("all"); };
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      transition.current = document.startViewTransition(() => flushSync(update));
    } else update();
  };
  const select = (event: LoreEvent) => { clearHover(); setSelectedId(event.id); };
  const navigateStory = (offset: number) => {
    const event = events[selectedIndex + offset];
    if (event) { select(event); focusEvent(event.id); }
  };
  const jumpTo = (index: number) => {
    const event = events[index];
    if (event) focusEvent(event.id);
  };

  return <div className={`app-shell view-${view} ${editing ? "editing-mode" : "reading-mode"} ${compact ? "launcher-embedded" : ""}`} style={{ "--travel-direction": direction.current } as CSSProperties}>
    <aside className="sidebar">
      <button className="brand" onClick={() => toggleView("general")} aria-label="Hollow, accueil"><HollowLogo/><span className="brand-caption">LES CHRONIQUES</span></button>
      <div className="workspace-label">ARCHIVES DU MONDE <span>BC</span></div>
      <nav className="main-nav" aria-label="Choisir une chronologie">
        <p className="nav-caption">VUE D’ENSEMBLE</p>
        <button className={`nav-item general ${view === "general" ? "active" : ""}`} onClick={() => toggleView("general")} aria-current={view === "general" ? "page" : undefined}><Waypoints size={19}/><span>Frise générale</span><small>{counts.general}</small></button>
        <p className="nav-caption realms-caption">LES ROYAUMES</p>
        {(["diamond", "clover"] as const).map(key => { const Icon = VIEWS[key].icon; return <button key={key} className={`nav-item ${key} ${view === key ? "active" : ""}`} onClick={() => toggleView(key)} aria-current={view === key ? "page" : undefined}><Icon size={19}/><span>{VIEWS[key].label}</span><small>{counts[key]}</small></button>; })}
        <p className="nav-caption realms-caption">LES TERRES LIBRES</p>
        <button className={`nav-item neutre ${view === "neutre" ? "active" : ""}`} onClick={() => toggleView("neutre")} aria-current={view === "neutre" ? "page" : undefined}><TentTree size={19}/><span>Zone neutre</span><small>{counts.neutre}</small></button>
      </nav>
      <div className="sidebar-note"><StatusMascot className="sidebar-sentinel"/><p>Chaque histoire laisse une trace.<br/>À vous d’en retrouver les liens.</p></div>
      <div className="sidebar-bottom"><button className="utility-link" onClick={() => setHelpOpen(true)}><BookOpen size={17}/>Lire les chroniques<ArrowUpRight size={14}/></button><div className="profile"><span className="avatar"><HollowClover className="avatar-clover"/></span><span>Hollow<small>Chroniques du passé</small></span><LockKeyhole size={14}/></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>Les chroniques</span><ChevronRight size={14}/><strong>{info.label}</strong></div><div className="top-actions">{compact && <button className="icon-button launcher-help" aria-label="Guide des chroniques" onClick={() => setHelpOpen(true)}><BookOpen size={17}/></button>}{transport.canEdit && <button className="reading-toggle" aria-pressed={editing} onClick={() => { setEditing(!editing); setMenu(false); setEditor(null); }}>{editing ? <Eye size={15}/> : <Pencil size={15}/>}<span>{editing ? "Mode lecture" : "Modifier la frise"}</span></button>}{editing && <><span className={`sync-state ${loadError ? "problem" : ""}`}>{busy || (!ready && !loadError) ? <LoaderCircle size={14} className="spin"/> : loadError ? <Cloud size={15}/> : <Check size={15}/>}<span>{busy ? "Enregistrement…" : loadError ? "Hors connexion" : ready ? transport.kind === "device" ? "Sur cet appareil" : "Enregistré" : "Connexion…"}</span></span><div className="menu-container"><Tip text="Sauvegardes et options"><button className="icon-button more-button" aria-label="Sauvegardes et options" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20}/></button></Tip>{menu && <><button className="menu-dismiss" aria-label="Fermer les options" onClick={() => setMenu(false)}/><div className="dropdown-menu"><button onClick={exportData}><Download size={16}/>Exporter une sauvegarde</button><button disabled={!ready || busy} onClick={chooseImport}><Upload size={16}/>Importer une sauvegarde</button><div className="menu-divider"/><button disabled={!past.length || busy} onClick={() => { undo(); setMenu(false); }}><Undo2 size={16}/>Annuler le changement</button><button onClick={() => { load(); setMenu(false); }}><Cloud size={16}/>Actualiser les données</button></div></>}</div></>}</div></header>

      <main>
        <section className="page-heading"><span className="realm-orbit" aria-hidden="true"/><div key={`art-${view}`} className="hero-art"><LauncherCharacter view={view}/></div><div key={`copy-${view}`} className="hero-copy"><p className="eyebrow"><span className={`realm-dot ${view}`}/>HOLLOW · CHRONIQUES <span className="hero-chapter">{String(Object.keys(VIEWS).indexOf(view) + 1).padStart(2, "0")} / 04</span></p><h1>{info.title}</h1><p className="page-description">{info.description}</p><span className="hero-footnote"><BookOpen size={12}/>{counts[view]} traces du passé<span className="hero-footnote-dot"/>{view === "general" ? "Les grands tournants" : info.label}</span></div>{editing && <button className="primary-button add-button" onClick={() => openEditor()} disabled={!ready || busy}><Plus size={18}/>Ajouter un fait passé</button>}</section>
        {loadError && <div className="connection-error" role="alert"><Cloud size={18}/><span>{loadError}</span><button onClick={load}>Réessayer</button>{transport.kind === "cloud" && <button onClick={() => { window.top?.location.assign("/signin-with-chatgpt?return_to=/"); }}>Se connecter</button>}</div>}

        <div className="view-tabs" role="tablist" aria-label="Les quatre frises">{(["general", "diamond", "clover", "neutre"] as const).map(key => { const Icon = VIEWS[key].icon; return <button key={key} role="tab" id={`tab-${key}`} aria-controls="chronology-panel" tabIndex={view === key ? 0 : -1} onKeyDown={e => { const keys = ["general", "diamond", "clover", "neutre"] as const; const index = keys.indexOf(key); const target = e.key === "ArrowRight" ? keys[(index + 1) % 4] : e.key === "ArrowLeft" ? keys[(index + 3) % 4] : e.key === "Home" ? keys[0] : e.key === "End" ? keys[3] : null; if (target) { e.preventDefault(); toggleView(target); document.getElementById(`tab-${target}`)?.focus(); } }} aria-selected={view === key} className={`tab-${key} ${view === key ? "selected" : ""}`} onClick={() => toggleView(key)}><span className="region-symbol"><Icon size={20}/></span><span className="region-label"><strong>{key === "general" ? "Vue générale" : VIEWS[key].label}</strong><span className="region-count">{counts[key]} événements</span></span><ArrowUpRight className="region-arrow" size={15}/></button>; })}</div>

        <section className="chronology" id="chronology-panel" role="tabpanel" aria-labelledby={`tab-${view}`}>
          <div className="timeline-toolbar"><div className="search-box"><Search size={17}/><input aria-label="Rechercher un événement" placeholder="Rechercher dans cette frise…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="clear-search" aria-label="Effacer la recherche" onClick={() => setQuery("")}><X size={14}/></button>}</div><div className="toolbar-right"><label className="status-filter"><span className="sr-only">Filtrer les événements</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tous les événements</option><option>Établi</option><option>À situer</option></select><ChevronDown size={13}/></label><div className="toolbar-separator"/><div className="layout-switch" aria-label="Présentation"><Tip text="Vue frise"><button aria-label="Vue frise" aria-pressed={layout === "timeline"} className={layout === "timeline" ? "selected" : ""} onClick={() => setLayout("timeline")}><Waypoints size={17}/></button></Tip><Tip text="Vue liste"><button aria-label="Vue liste" aria-pressed={layout === "list"} className={layout === "list" ? "selected" : ""} onClick={() => setLayout("list")}><List size={18}/></button></Tip></div></div></div>
          <div className="timeline-caption"><span><span className="live-dot"/><span>{events.length} événement{events.length > 1 ? "s" : ""}</span><i/><span>Ordre chronologique relatif</span></span><div className="zoom-controls"><Tip text="Réduire l’espacement"><button className="icon-button" aria-label="Réduire l’espacement" disabled={zoom <= .8} onClick={() => setZoom(z => Math.max(.8, +(z - .1).toFixed(1)))}><Minus size={15}/></button></Tip><span>{Math.round(zoom * 100)} %</span><Tip text="Augmenter l’espacement"><button className="icon-button" aria-label="Augmenter l’espacement" disabled={zoom >= 1.6} onClick={() => setZoom(z => Math.min(1.6, +(z + .1).toFixed(1)))}><Plus size={15}/></button></Tip></div></div>

          {!events.length ? <div className="empty-state"><Companion mood="sleep"/><h2>{query || status !== "all" ? "Aucun événement trouvé." : "Les archives sont silencieuses."}</h2><p>{query || status !== "all" ? "Essaie une autre recherche ou retire le filtre." : "Aucun événement passé n’est référencé dans cette frise."}</p><button className="secondary-button" disabled={!transport.canEdit && !query && status === "all"} onClick={() => query || status !== "all" ? (setQuery(""), setStatus("all")) : editing ? openEditor() : transport.canEdit && setEditing(true)}>{query || status !== "all" ? "Réinitialiser les filtres" : editing ? "Ajouter un fait passé" : "Modifier la frise"}</button></div>
          : <div ref={scroller} tabIndex={0} aria-label="Parcourir la frise avec les flèches du clavier" onKeyDown={e => { if (e.target !== e.currentTarget || layout !== "timeline") return; if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.currentTarget.scrollBy({ left: e.key === "ArrowLeft" ? -step * 2 : step * 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } }} className={`timeline-scroll ${layout === "list" ? "list-mode" : ""}`} onPointerDown={e => { if (e.button !== 0 || (e.target as HTMLElement).closest("button,a,input")) return; pan.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft }; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add("panning"); clearHover(); }} onPointerMove={e => { if (pan.current) e.currentTarget.scrollLeft = pan.current.scroll - (e.clientX - pan.current.x); }} onPointerUp={e => { pan.current = null; e.currentTarget.classList.remove("panning"); }} onPointerCancel={() => { pan.current = null; }}>
            <div key={`${view}-${layout}`} className="timeline-canvas" style={{ "--canvas-width": `${canvasWidth}px` } as CSSProperties}>
              <div className="axis-line" aria-hidden="true"/><span className="axis-origin" aria-hidden="true">LES ORIGINES</span>
              {events.map((event, index) => <div key={event.id} className={`event-position ${index % 2 ? "lower" : "upper"} faction-${factionOf(event)}`} style={{ "--event-x": `${160 + index * step}px`, "--entry-delay": `${Math.min(index, 7) * 32}ms` } as CSSProperties}>
                <span className="event-stem" aria-hidden="true"/><span className={`axis-node ${event.major ? "major-node" : ""}`} aria-hidden="true"><span/></span><span className="event-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <button data-event-id={event.id} className={`event-card ${selectedId === event.id ? "chosen" : ""} ${dragId === event.id ? "dragging" : ""} ${overId === event.id ? "drop-target" : ""}`} draggable={editing && ready && !busy} onDragStart={e => { setDragId(event.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", event.id); clearHover(); }} onDragEnd={() => { setDragId(null); setOverId(null); }} onDragOver={e => { if (dragId && dragId !== event.id) { e.preventDefault(); setOverId(event.id); } }} onDrop={e => { e.preventDefault(); dropEvent(event); }} onClick={() => select(event)} onMouseEnter={e => showHover(event, e.currentTarget)} onMouseLeave={clearHover} onFocus={e => showHover(event, e.currentTarget)} onBlur={clearHover} aria-label={`${event.title}. ${dateText(event)}. ${event.certainty}. Voir le détail.`} aria-expanded={selectedId === event.id}>
                  <span className="event-topline"><span><FactionMark faction={factionOf(event)}/>{FACTIONS[factionOf(event)].label.toUpperCase()}</span><GripVertical size={14} className="grip"/></span>
                  <span className="event-date">{dateText(event)}</span><strong className="event-title">{event.title}</strong><span className="event-excerpt">{event.summary}</span><span className="event-bottom"><span className="certainty">{event.certainty === "À situer" ? <CalendarDays size={11}/> : <span className="certainty-dot"/>}{event.certainty}</span><ArrowUpRight size={14}/></span>
                </button>
              </div>)}
              {editing && <button className="timeline-add" style={{ "--event-x": `${160 + events.length * step}px` } as CSSProperties} onClick={() => openEditor()} disabled={!ready || busy}><span><Plus size={21}/></span>Ajouter un fait passé</button>}
            </div>
          </div>}
          {!!events.length && layout === "timeline" && <div className="journey-map" aria-label="Navigation rapide dans le passé"><div className="journey-label"><Waypoints size={15}/><span>Parcourir l’histoire</span><strong>{String(currentStop + 1).padStart(2, "0")}<i> / {String(events.length).padStart(2, "0")}</i></strong></div><div className="journey-track"><span className="journey-progress" style={{ width: `${progress * 100}%` }}/>{events.map((event, index) => <button key={event.id} className={`journey-stop faction-${factionOf(event)} ${index <= currentStop ? "visited" : ""}`} aria-label={`Aller à ${event.title}`} title={event.title} onClick={() => jumpTo(index)}><span/></button>)}</div><span className="journey-end">LES DERNIÈRES TRACES</span></div>}
          <div className="timeline-footer"><div className="legend" aria-label="Couleurs des factions">{(Object.entries(FACTIONS) as [Faction, typeof FACTIONS[Faction]][]).map(([key, value]) => <span key={key} className={`faction-${key}`}><i className="legend-dot"/>{value.label}</span>)}</div><div className="timeline-navigation"><span className="navigation-hint">Survole pour découvrir, clique pour explorer.</span><button className="icon-button" aria-label="Événements précédents" disabled={scrollProgress < 2 || layout === "list"} onClick={() => scroller.current?.scrollBy({ left: -570, behavior: "smooth" })}><ChevronLeft size={18}/></button><button className="icon-button" aria-label="Événements suivants" disabled={scrollProgress >= scrollMax - 2 || layout === "list"} onClick={() => scroller.current?.scrollBy({ left: 570, behavior: "smooth" })}><ChevronRight size={18}/></button></div></div>
        </section>

        <div className="below-timeline"><div><CalendarDays size={15}/><p><strong>{view === "neutre" ? "Des récits parallèles, des dates incertaines." : "Un ordre, pas un calendrier inventé."}</strong> {view === "neutre" ? "Ces événements ont eu lieu ; leur place exacte entre les récits reste parfois incertaine." : "Les événements mal datés sont signalés « À situer »."}</p></div><button onClick={() => setHelpOpen(true)}>Comprendre les repères<ArrowUpRight size={14}/></button></div>
        <footer className="page-footer"><span>HOLLOW <i/> ARCHIVES DU LORE</span><span>Des traces du passé, des histoires à découvrir.</span></footer>
      </main>
    </div>

    {selected && <aside className={`detail-drawer faction-${factionOf(selected)}`} aria-label="Détail de l’événement"><header><span className="eyebrow">DANS LES CHRONIQUES</span><button className="icon-button" aria-label="Fermer le détail" onClick={() => setSelectedId(null)}><X size={20}/></button></header><div key={selected.id} className="drawer-scroll"><Badge event={selected}/><div className="drawer-meta"><CalendarDays size={15}/>{dateText(selected)}</div><h2>{selected.title}</h2><div className="detail-tags"><span>{selected.certainty}</span><span>{PHASE_LABELS[selected.phase]}</span>{selected.realm !== "neutre" && selected.neutral && <span><TentTree size={11}/>Zone neutre</span>}{selected.major && <span><Flag size={11}/>Événement majeur</span>}</div><p className="detail-description">{selected.summary || "Cet événement attend encore son histoire."}</p>{selected.placementNote && <div className="placement-note"><CalendarDays size={16}/><div><strong>Repère de chronologie</strong><p>{selected.placementNote}</p></div></div>}{editing && <div className="detail-position"><span>Déplacer dans le récit</span><div><Tip text="Un événement plus tôt"><button className="icon-button" aria-label="Déplacer plus tôt" onClick={() => moveEvent(selected, -1)} disabled={!ready || busy || all[0]?.id === selected.id}><ArrowLeft size={17}/></button></Tip><Tip text="Un événement plus tard"><button className="icon-button" aria-label="Déplacer plus tard" onClick={() => moveEvent(selected, 1)} disabled={!ready || busy || all.at(-1)?.id === selected.id}><ArrowRight size={17}/></button></Tip></div></div>}</div><div className="detail-pagination"><button className="secondary-button" aria-label="Récit précédent" disabled={selectedIndex <= 0} onClick={() => navigateStory(-1)}><ChevronLeft size={17}/>Précédent</button><span>{selectedIndex + 1} / {events.length}</span><button className="secondary-button" aria-label="Récit suivant" disabled={selectedIndex < 0 || selectedIndex >= events.length - 1} onClick={() => navigateStory(1)}>Suivant<ChevronRight size={17}/></button></div>{editing && <footer><button className="primary-button" onClick={() => openEditor(selected)} disabled={!ready || busy}><Pencil size={16}/>Modifier cet événement</button><Tip text="Supprimer cet événement"><button className="icon-button delete-button" aria-label="Supprimer cet événement" disabled={!ready || busy} onClick={() => setDeleteEvent(selected)}><Trash2 size={17}/></button></Tip></footer>}</aside>}

    {hover && typeof document !== "undefined" && createPortal(<div className={`event-popover faction-${factionOf(hover.event)}`} style={{ left: hover.left, top: hover.top }} role="tooltip"><span className="eyebrow">{dateText(hover.event)}</span><h3>{hover.event.title}</h3><p>{hover.event.summary}</p><span className="popover-help">Cliquer pour lire le récit<ArrowUpRight size={13}/></span></div>, document.body)}

    {editor && <EventEditor value={editor} events={all} busy={busy} onClose={() => { if (!busy) setEditor(null); }} onSave={saveEditor}/>}
    {deleteEvent && <Modal title="Retirer cet événement ?" eyebrow="VOTRE CHRONOLOGIE" onClose={() => setDeleteEvent(null)} className="compact-modal"><div className="modal-body"><p>« {deleteEvent.title} » sera retiré de toutes les frises où il apparaît. Tu pourras annuler ce changement.</p></div><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteEvent(null)}>Conserver</button><button className="danger-button" disabled={busy} onClick={async () => { if (await commit({ ...board, events: board.events.filter(e => e.id !== deleteEvent.id) }, "Événement retiré des frises.")) { setDeleteEvent(null); setSelectedId(null); } }}><Trash2 size={16}/>Supprimer</button></div></Modal>}
    {importBoard && <Modal title="Restaurer cette sauvegarde ?" eyebrow="IMPORTER UNE CHRONOLOGIE" onClose={() => setImportBoard(null)} className="compact-modal"><div className="modal-body"><p>La version destinée aux joueurs de cette sauvegarde contient <strong>{importBoard.events.length} événements</strong>. Elle remplacera les {board.events.length} événements actuels dans les quatre frises.</p><p className="muted">Les entrées à venir et les anciennes informations internes sont écartées avant la restauration. Le dernier changement pourra être annulé.</p><button className="text-button" onClick={exportData}><Download size={15}/>Exporter la version actuelle</button></div><div className="modal-actions"><button className="secondary-button" onClick={() => setImportBoard(null)}>Annuler</button><button className="primary-button" disabled={busy} onClick={async () => { if (await commit(importBoard, "Sauvegarde restaurée.")) { setImportBoard(null); setSelectedId(null); setQuery(""); setStatus("all"); } }}><Upload size={16}/>Restaurer</button></div></Modal>}
    {helpOpen && <Modal title="Lire les traces du passé." eyebrow="LES CHRONIQUES DE HOLLOW" onClose={() => setHelpOpen(false)} className="help-modal"><div className="modal-body help-steps"><section className="help-welcome"><img src="./hollow/mascot-candidatures.png" alt="" aria-hidden="true" width="846" height="1264"/><div><h3>Remonte le fil de l’histoire.</h3><p>Royaumes, villages et destins croisés : les chroniques rassemblent les traces du monde de Hollow.</p></div></section><div><span>01</span><section><h3>Une histoire déjà vécue</h3><p>Ces frises racontent les faits survenus à Clover, à Diamond et dans les terres neutres. La vue générale rassemble les grands tournants.</p></section></div><div><span>02</span><section><h3>Des dates parfois incertaines</h3><p>« À situer » désigne un événement passé dont la date ou la place exacte reste mal connue. Les récits parallèles ne sont pas tous synchronisés.</p></section></div><div><span>03</span><section><h3>Des récits qui gardent leurs silences</h3><p>Survole une carte pour un aperçu, puis ouvre-la pour lire. Les chroniques conservent ce qui a laissé une trace ; elles ne donnent pas une réponse à chaque mystère.</p></section></div>{transport.canEdit && <div><span>04</span><section><h3>Compléter les archives</h3><p>Le bouton « Modifier la frise » ouvre l’édition. Ajoute uniquement des faits déjà survenus et des informations qui peuvent être présentées aux joueurs. Les couleurs de faction restent identiques entre les frises.</p></section></div>}</div></Modal>}
    <input ref={fileInput} tabIndex={-1} type="file" accept=".json,application/json" className="sr-only" aria-label="Importer une sauvegarde JSON" onChange={e => importData(e.target.files?.[0])}/>
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}><Companion mood={toast.kind}/><span>{toast.text}</span>{toast.undo && !!past.length && <button onClick={undo} disabled={busy}>Annuler</button>}<button className="toast-close" aria-label="Fermer le message" onClick={() => setToast(null)}><X size={15}/></button></div>}
  </div>;
}

function EventEditor({ value, events, busy, onClose, onSave }: { value: Editor; events: LoreEvent[]; busy: boolean; onClose: () => void; onSave: (event: LoreEvent, afterId: string) => Promise<void> }) {
  const [event, setEvent] = useState<LoreEvent>({ ...value.event });
  const [afterId, setAfterId] = useState(value.afterId);
  const [error, setError] = useState("");
  const patch = <K extends keyof LoreEvent>(key: K, val: LoreEvent[K]) => setEvent(previous => ({ ...previous, [key]: val }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (event.timeMode === "year" && event.year === null) { setError("Ajoute une année pour placer cet événement."); return; }
    if (event.timeMode === "date" && !event.preciseDate) { setError("Choisis une date complète."); return; }
    const parsed = eventSchema.safeParse({ ...event, secret: false, playerSafe: true, sourceTitle: "", sourceUrl: "", dateLabel: event.timeMode === "relative" ? event.dateLabel : dateText(event) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Vérifie les champs du formulaire."); return; }
    await onSave(parsed.data, afterId);
  };
  return <Modal title={value.isNew ? "Un nouvel événement." : "Réécrire cet événement."} eyebrow="DANS LES CHRONIQUES" onClose={onClose} className="editor-modal"><form onSubmit={submit}><div className="modal-body editor-fields">
    <label className="field full"><span>Titre de l’événement <i>*</i></span><input autoFocus required maxLength={140} placeholder="Un fait qui a marqué le passé…" value={event.title} onChange={e => patch("title", e.target.value)}/></label>
    <div className="two-fields"><label className="field"><span>Dans quelle histoire ?</span><select value={event.realm} onChange={e => patch("realm", e.target.value as LoreEvent["realm"])}><option value="diamond">Diamond</option><option value="clover">Clover</option><option value="commun">Les deux royaumes</option><option value="neutre">Zone neutre — villages et Déliées</option></select></label><label className="field"><span>Repère chronologique</span><select value={event.certainty} onChange={e => patch("certainty", e.target.value as LoreEvent["certainty"])}><option>Établi</option><option>À situer</option></select></label></div>
    <div className="form-divider"><CalendarDays size={15}/>QUAND CELA SE PASSE-T-IL ?</div>
    <div className="two-fields"><label className="field"><span>Précision de la date</span><select value={event.timeMode} onChange={e => patch("timeMode", e.target.value as LoreEvent["timeMode"])}><option value="relative">Repère de l’histoire</option><option value="year">Année du lore</option><option value="date">Date complète</option></select></label><label className="field"><span>{event.timeMode === "relative" ? "Date ou repère" : event.timeMode === "year" ? "Année" : "Date"} <i>*</i></span>{event.timeMode === "relative" ? <input required maxLength={140} value={event.dateLabel} placeholder="Ex. Après la guerre" onChange={e => patch("dateLabel", e.target.value)}/> : event.timeMode === "year" ? <input required type="number" min={-100000} max={100000} value={event.year ?? ""} placeholder="Ex. -50, 0, 24…" onChange={e => patch("year", e.target.value === "" ? null : Number(e.target.value))}/> : <input required type="date" value={event.preciseDate || ""} onChange={e => patch("preciseDate", e.target.value || null)}/>}</label></div>
    <div className="two-fields"><label className="field"><span>Placer après</span><select value={afterId} onChange={e => setAfterId(e.target.value)}><option value="__start__">Au début de l’histoire</option>{events.filter(e => e.id !== event.id).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label><label className="field"><span>Période du récit</span><select value={event.phase} onChange={e => patch("phase", e.target.value as LoreEvent["phase"])}>{PHASES.filter(p => p !== "à-jouer" && p !== "présent").map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}</select></label></div>
    <p className="field-hint">{event.timeMode === "relative" ? "Choisis sa place sans inventer de date précise. Les quatre frises partagent le même ordre." : "Les dates chiffrées sont triées entre elles. Les repères sans date gardent leur place dans le récit."}</p>
    <label className="field"><span>L’histoire de cet événement</span><textarea rows={5} maxLength={8000} placeholder="Les faits connus des habitants, en gardant les mystères à découvrir…" value={event.summary} onChange={e => patch("summary", e.target.value)}/></label>
    <div className="faction-choice"><label className="field"><span>Faction représentée</span><select value={event.faction || "auto"} onChange={e => patch("faction", e.target.value === "auto" ? undefined : e.target.value as Faction)}><option value="auto">Automatique — {FACTIONS[factionOf({ ...event, faction: undefined })].label}</option>{(Object.entries(FACTIONS) as [Faction, typeof FACTIONS[Faction]][]).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><span className={`faction-chip faction-${factionOf(event)}`}><FactionMark faction={factionOf(event)}/>{FACTIONS[factionOf(event)].label}</span><p className="field-hint">La couleur suit cet événement dans toutes les frises et doit représenter un lien connu des joueurs.</p></div><div className="editor-checkboxes">{event.realm !== "neutre" && <label><input type="checkbox" checked={event.neutral} onChange={e => patch("neutral", e.target.checked)}/><span><strong>Aussi dans la Zone neutre</strong><small>Partage cet événement avec les villages et les Déliées.</small></span><TentTree size={17}/></label>}<label><input type="checkbox" checked={event.major} onChange={e => patch("major", e.target.checked)}/><span><strong>Événement majeur</strong><small>Apparaît aussi dans la frise générale.</small></span><Flag size={17}/></label></div>
    <p className="field-hint">Cette frise présente le passé aux joueurs. Conserve les causes inconnues et les responsabilités cachées dans les zones d’ombre du récit.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Annuler</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {busy ? "Enregistrement…" : value.isNew ? "Ajouter à la frise" : "Enregistrer"}</button></div></form></Modal>;
}
