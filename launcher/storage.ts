import { INITIAL_BOARD } from "../lib/seed";
import { playerBoardSchema, type Board } from "../lib/timeline";
import type { TimelineSnapshot, TimelineTransport } from "../lib/timeline-transport";

/** Native binding injected by the launcher before main.tsx. No remote message listener. */
export interface HollowChroniclesHost {
  version: 1;
  canEdit: boolean;
  loadTimeline(): Promise<TimelineSnapshot>;
  saveTimeline?(snapshot: TimelineSnapshot): Promise<{ revision: number }>;
  chooseBackup?(): Promise<unknown | null>;
  saveBackup?(contents: string, filename: string): Promise<void>;
}

export function hostTransport(host: HollowChroniclesHost): TimelineTransport {
  if (host.version !== 1) throw new Error("Version de connexion au launcher incompatible.");
  return {
    kind: "launcher", canEdit: host.canEdit && !!host.saveTimeline,
    async load() {
      const snapshot = await host.loadTimeline();
      if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("Révision du launcher invalide.");
      return { board: playerBoardSchema.parse(snapshot.board), revision: snapshot.revision };
    },
    async save(board, revision) {
      if (!host.canEdit || !host.saveTimeline) throw new Error("Ton compte peut uniquement lire les archives.");
      const result = await host.saveTimeline({ board: playerBoardSchema.parse(board), revision });
      if (!Number.isInteger(result.revision) || result.revision <= revision) throw new Error("Le launcher n’a pas confirmé l’enregistrement.");
      return result.revision;
    },
    async prepareImport(value) { return playerBoardSchema.parse(value); },
    ...(host.chooseBackup ? { chooseImport: () => host.chooseBackup!() } : {}),
    ...(host.saveBackup ? { exportBackup: (contents: string, filename: string) => host.saveBackup!(contents, filename) } : {}),
  };
}

/** One durable board per WebView origin/profile. IndexedDB transactions enforce revisions. */
export function deviceTransport(databaseName = "hollow-chronicles-v1"): TimelineTransport {
  let connection: Promise<IDBDatabase> | undefined;
  const database = () => connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("timelines");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(new Error("Le stockage de cet appareil est indisponible.")); };
    request.onblocked = () => { connection = undefined; reject(new Error("Ferme les anciennes fenêtres des archives puis réessaie.")); };
  });
  const transaction = async (board?: Board, revision?: number): Promise<TimelineSnapshot> => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("timelines", "readwrite");
      const store = tx.objectStore("timelines");
      const get = store.get("public-chronicles");
      let next: TimelineSnapshot;
      let failure: Error | undefined;
      get.onsuccess = () => {
        try {
          const current: TimelineSnapshot = get.result ?? { board: INITIAL_BOARD, revision: 0 };
          playerBoardSchema.parse(current.board);
          if (!Number.isSafeInteger(current.revision) || current.revision < 0) throw new Error("Révision de sauvegarde invalide.");
          if (board && current.revision !== revision) throw new Error("Les archives ont changé dans une autre fenêtre. Actualise avant d’enregistrer.");
          next = board ? { board: playerBoardSchema.parse(board), revision: current.revision + 1 } : current;
          if (board || !get.result) store.put(next, "public-chronicles");
        } catch (error) { failure = error instanceof Error ? error : new Error("Sauvegarde invalide."); tx.abort(); }
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(failure ?? new Error("L’enregistrement sur cet appareil a échoué."));
    });
  };
  return {
    kind: "device", canEdit: true,
    load: () => transaction(),
    async save(board, revision) { return (await transaction(board, revision)).revision; },
    async prepareImport(value) { return playerBoardSchema.parse(value); },
  };
}
