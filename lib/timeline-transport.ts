import { playerBoardSchema, type Board } from "./timeline";

export type TimelineSnapshot = { board: Board; revision: number; canEdit?: boolean; authenticated?: boolean };
export type TimelineTransport = {
  kind: "cloud" | "device" | "launcher";
  canEdit: boolean;
  load(): Promise<TimelineSnapshot>;
  save(board: Board, revision: number): Promise<number>;
  prepareImport(value: unknown): Promise<Board>;
  chooseImport?(): Promise<unknown | null>;
  exportBackup?(contents: string, filename: string): Promise<void>;
};

async function request(method: string, body?: unknown) {
  const result = await fetch("/api/timeline", {
    method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const payload = await result.json() as { error?: string; board?: unknown; revision?: number; canEdit?: boolean; authenticated?: boolean };
  if (!result.ok) throw new Error(payload.error || "La chronologie n’est pas disponible.");
  return payload;
}

export const cloudTransport: TimelineTransport = {
  kind: "cloud", canEdit: false,
  async load() {
    const payload = await request("GET");
    if (typeof payload.revision !== "number" || !Number.isInteger(payload.revision)) throw new Error("Actualise la connexion aux archives.");
    return { board: playerBoardSchema.parse(payload.board), revision: payload.revision, canEdit: payload.canEdit === true, authenticated: payload.authenticated === true };
  },
  async save(board, revision) {
    const payload = await request("PUT", { board: playerBoardSchema.parse(board), revision });
    if (!Number.isInteger(payload.revision)) throw new Error("Actualise la connexion aux archives.");
    return payload.revision as number;
  },
  async prepareImport(value) { return playerBoardSchema.parse((await request("POST", value)).board); },
};
