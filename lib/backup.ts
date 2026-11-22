import { isProject } from "./project";
import { describeDoc, listProjects, type Backend, type ProjectMeta } from "./projects";
import { uid, type Doc } from "./tokens";

/* Every project in one file, and that file back into projects.
 *
 * The projects live in the browser's own storage, which the browser may clear: when the disk
 * runs short, when site data is wiped, when the profile goes. A project saved to a file is
 * safe from that, but nobody saves twenty projects one by one. So the list can be written out
 * whole, and the file it makes opens the way a project file does, from the same button. */

export const BACKUP_KIND = "m3e-canvas-projects";

/** one project as a backup carries it: the design and when it was made and last changed */
export type BackupEntry = { title: string; createdAt: number; updatedAt: number; doc: Doc };

export type Backup = { kind: typeof BACKUP_KIND; version: 1; exportedAt: number; projects: BackupEntry[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every project that holds a design, newest first. One the author has not opened yet has no
 *  design of its own to keep. */
export async function collectBackup(b: Backend, now = Date.now()): Promise<Backup> {
  const projects: BackupEntry[] = [];
  for (const meta of await listProjects(b)) {
    const doc = await b.doc(meta.id);
    if (doc) projects.push({ title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt, doc });
  }
  return { kind: BACKUP_KIND, version: 1, exportedAt: now, projects };
}

/** `m3e-canvas projects 2026-11-23.json`, by the day in the author's own time zone */
export const backupFileName = (now = new Date()) => {
  const two = (n: number) => String(n).padStart(2, "0");
  return `m3e-canvas projects ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`;
};

/** hands the backup to the browser as a JSON download */
export function saveBackup(backup: Backup, now = new Date()) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(now);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** What a file holds, read as JSON: the projects of a backup, the one design of a project file,
 *  or null when it is neither. A backup's entries that are no design the app can open are left
 *  out rather than failing the rest; a time that is missing or absurd becomes `now`. */
export function designsIn(value: unknown, now = Date.now()): { backup: boolean; entries: BackupEntry[] } | null {
  if (isRecord(value) && value.kind === BACKUP_KIND && Array.isArray(value.projects)) {
    const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= now ? v : now);
    const entries: BackupEntry[] = [];
    for (const p of value.projects) {
      if (!isRecord(p) || !isProject(p.doc)) continue;
      const updatedAt = time(p.updatedAt);
      entries.push({ title: typeof p.title === "string" ? p.title : "", createdAt: Math.min(time(p.createdAt), updatedAt), updatedAt, doc: p.doc });
    }
    return { backup: true, entries };
  }
  if (isProject(value)) return { backup: false, entries: [{ title: typeof value.title === "string" ? value.title : "", createdAt: now, updatedAt: now, doc: value }] };
  return null;
}

/** reads a chosen file: see `designsIn` */
export async function readDesigns(file: Pick<File, "text">, now = Date.now()): Promise<{ backup: boolean; entries: BackupEntry[] } | null> {
  try {
    return designsIn(JSON.parse(await file.text()), now);
  } catch {
    return null;
  }
}

/** how a project is told from another without reading every design: its name and its two times */
const mark = (m: { title: string; createdAt: number; updatedAt: number }) => `${m.createdAt}/${m.updatedAt}/${m.title.trim()}`;

/** Puts a backup's projects into the store, each under a new id and with the times it had, so
 *  the list comes back in the order it was in. A project the store already holds unchanged
 *  (the same name, made and last changed at the same moments) is not added a second time:
 *  opening the same backup twice does not double the list. Returns how many were added and
 *  how many were already there. */
export async function restoreBackup(b: Backend, entries: BackupEntry[]): Promise<{ added: number; present: number }> {
  const held = new Set((await b.metas()).filter((m) => !m.hidden).map(mark));
  let added = 0;
  let present = 0;
  for (const entry of entries) {
    const meta: ProjectMeta = describeDoc({ id: uid() + uid(), title: "", createdAt: entry.createdAt, updatedAt: entry.updatedAt, edited: true, screens: 0 }, entry.doc);
    if (held.has(mark(meta))) {
      present++;
      continue;
    }
    await b.write(meta, { doc: entry.doc, before: null });
    held.add(mark(meta));
    added++;
  }
  return { added, present };
}
