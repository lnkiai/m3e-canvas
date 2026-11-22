import { Doc, uid } from "./tokens";
import { isProject } from "./project";

/* The projects this browser holds. Each one is a document with a little bookkeeping
 * beside it, kept in IndexedDB so several designs, pictures included, fit where one
 * localStorage entry did not. Nothing leaves the browser.
 *
 * The functions below work on a `Backend`, so the rules (which project opens, when an
 * arriving design gets a project of its own, what counts as edited) are tested without
 * a browser; the IndexedDB and Storage backends only move the records. */

export type ProjectMeta = {
  id: string;
  /** the app's name as the document carries it; empty until the author names it */
  title: string;
  createdAt: number;
  updatedAt: number;
  /** false until the author changes something: an arriving design may take an untouched project over */
  edited: boolean;
  /** how many screens the document has, for the list */
  screens: number;
  /** the fingerprint of the legacy entry this project was made from, on the one that was */
  legacy?: string;
  /** not a project at all: a note the store keeps for itself, never listed or opened */
  hidden?: true;
};

export type Project = {
  meta: ProjectMeta;
  /** null for a project that has not been opened yet: the editor starts it from its seed */
  doc: Doc | null;
  /** the design an AI draft replaced, until the author keeps or undoes the draft */
  before: Doc | null;
};

/** what a write changes besides the bookkeeping; a part left out stays as it is */
export type ProjectParts = { doc?: Doc | null; before?: Doc | null };

export interface Backend {
  /** Where the records live. `memory` is the last resort: nothing outlives the tab, and the
   *  interface has to say so. */
  readonly kind: "idb" | "storage" | "memory";
  metas(): Promise<ProjectMeta[]>;
  meta(id: string): Promise<ProjectMeta | null>;
  doc(id: string): Promise<Doc | null>;
  before(id: string): Promise<Doc | null>;
  write(meta: ProjectMeta, parts?: ProjectParts): Promise<void>;
  remove(id: string): Promise<void>;
}

/** the part of `Storage` the helpers need, so tests can hand in a plain map */
export type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** the project the editor opened last, so the next visit starts there */
export const LAST_KEY = "m3e:last";
/** where the single document lived before projects; left in place as a backup once moved */
export const LEGACY_DOC_KEY = "m3e:doc";
export const LEGACY_BEFORE_KEY = "m3e:doc:before";
/** the id of the project the legacy document became, so it is moved only once */
export const MOVED_KEY = "m3e:doc:moved";
/** the fingerprint of the legacy entry as it was moved: an entry that has changed since is new work */
export const MOVED_SIG_KEY = "m3e:doc:moved:sig";

/** the Web Lock one editor holds on a project; a second tab on the same project is read-only */
export const lockName = (id: string) => `m3e:doc:editor:${id}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isMeta = (v: unknown): v is ProjectMeta =>
  isRecord(v) && typeof v.id === "string" && typeof v.title === "string" && Number.isFinite(v.createdAt) && Number.isFinite(v.updatedAt) && typeof v.edited === "boolean" && Number.isFinite(v.screens);

/** the bookkeeping a document implies: its name and its screen count */
export const describeDoc = (meta: ProjectMeta, doc: Doc | null): ProjectMeta =>
  doc ? { ...meta, title: typeof doc.title === "string" ? doc.title.trim() : "", screens: Array.isArray(doc.frames) ? doc.frames.length : 0 } : meta;

/* ---------- backends ---------- */

const copy = <T>(v: T): T => (v === null || v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Holds everything in memory: the tests' backend, and the last resort where the browser
 *  offers no storage at all, so the editor still works for the length of the visit. */
export function memoryBackend(): Backend {
  const metas = new Map<string, ProjectMeta>();
  const docs = new Map<string, Doc | null>();
  const befores = new Map<string, Doc | null>();
  return {
    kind: "memory",
    metas: async () => [...metas.values()].map(copy),
    meta: async (id) => copy(metas.get(id) ?? null),
    doc: async (id) => copy(docs.get(id) ?? null),
    before: async (id) => copy(befores.get(id) ?? null),
    write: async (meta, parts) => {
      metas.set(meta.id, copy(meta));
      if (parts && "doc" in parts) docs.set(meta.id, copy(parts.doc ?? null));
      if (parts && "before" in parts) befores.set(meta.id, copy(parts.before ?? null));
    },
    remove: async (id) => {
      metas.delete(id);
      docs.delete(id);
      befores.delete(id);
    },
  };
}

const INDEX_KEY = "m3e:projects";
const docKey = (id: string) => `m3e:project:${id}`;
const beforeKey = (id: string) => `m3e:project:${id}:before`;

/** Keeps projects in a `Storage`, for browsers where IndexedDB will not open. The quota is
 *  small there; a write that does not fit rejects, and the editor says so. */
export function storageBackend(storage: KeyValue): Backend {
  const index = (): ProjectMeta[] => {
    try {
      const v: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter(isMeta) : [];
    } catch {
      return [];
    }
  };
  const read = (key: string): Doc | null => {
    try {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as Doc) : null;
    } catch {
      return null;
    }
  };
  const put = (key: string, value: Doc | null) => {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  };
  return {
    kind: "storage",
    metas: async () => index(),
    meta: async (id) => index().find((m) => m.id === id) ?? null,
    doc: async (id) => read(docKey(id)),
    before: async (id) => read(beforeKey(id)),
    write: async (meta, parts) => {
      /* the document first: an index entry must never point at a document that did not fit */
      if (parts && "doc" in parts) put(docKey(meta.id), parts.doc ?? null);
      if (parts && "before" in parts) put(beforeKey(meta.id), parts.before ?? null);
      storage.setItem(INDEX_KEY, JSON.stringify([...index().filter((m) => m.id !== meta.id), meta]));
    },
    remove: async (id) => {
      storage.setItem(INDEX_KEY, JSON.stringify(index().filter((m) => m.id !== id)));
      storage.removeItem(docKey(id));
      storage.removeItem(beforeKey(id));
    },
  };
}

const DB_NAME = "m3e";
const DB_VERSION = 1;
const META = "meta";
const DOCS = "doc";
const BEFORES = "before";

/** how long the database may take to open before the browser's Storage is tried instead */
const OPEN_MS = 5000;

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    /* some browsers leave an open unanswered (a private window, a database held elsewhere) */
    let gaveUp = false;
    const late = setTimeout(() => {
      gaveUp = true;
      reject(new Error("timeout"));
    }, OPEN_MS);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
      if (!db.objectStoreNames.contains(BEFORES)) db.createObjectStore(BEFORES);
    };
    req.onsuccess = () => {
      clearTimeout(late);
      /* answered after all, with nobody waiting: a connection left open would hold up an upgrade */
      if (gaveUp) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(late);
      reject(req.error);
    };
    /* blocked only means another tab has to let go first; the open goes on, or times out */
  });
}

/** Keeps the bookkeeping, the documents and the replaced drafts in three object stores,
 *  so the list reads the small records without loading a single document. `connect` opens
 *  the database: it is asked again whenever the connection has gone away, which a browser may
 *  do under a tab that stays open for days. */
export function idbBackend(connect: () => Promise<IDBDatabase>): Backend {
  let held: Promise<IDBDatabase> | null = null;
  const open = () =>
    (held ??= connect().then(
      (db) => {
        const mine = held;
        const drop = () => {
          if (held === mine) held = null;
        };
        db.onclose = drop;
        /* a newer version of the app in another tab may upgrade the database; step out of its way */
        db.onversionchange = () => {
          db.close();
          drop();
        };
        return db;
      },
      (error) => {
        held = null;
        throw error;
      },
    ));
  const once = <T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let out: T | undefined;
      const req = work(tx);
      if (req) req.onsuccess = () => (out = req.result);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("aborted"));
    });
  const run = async <T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
    const used = open();
    try {
      return await once(await used, stores, mode, work);
    } catch (error) {
      /* the connection was closed under us: open it again and try the once */
      if ((error as { name?: string } | null)?.name !== "InvalidStateError") throw error;
      /* unless someone else has reconnected already: theirs is the one to use */
      if (held === used) held = null;
      return once(await open(), stores, mode, work);
    }
  };
  return {
    kind: "idb",
    metas: async () => ((await run<ProjectMeta[]>([META], "readonly", (tx) => tx.objectStore(META).getAll())) ?? []).filter(isMeta),
    meta: async (id) => {
      const v = await run<unknown>([META], "readonly", (tx) => tx.objectStore(META).get(id));
      return isMeta(v) ? v : null;
    },
    doc: async (id) => ((await run<Doc | null>([DOCS], "readonly", (tx) => tx.objectStore(DOCS).get(id))) ?? null),
    before: async (id) => ((await run<Doc | null>([BEFORES], "readonly", (tx) => tx.objectStore(BEFORES).get(id))) ?? null),
    write: async (meta, parts) => {
      await run([META, DOCS, BEFORES], "readwrite", (tx) => {
        tx.objectStore(META).put(meta);
        if (parts && "doc" in parts) {
          if (parts.doc) tx.objectStore(DOCS).put(parts.doc, meta.id);
          else tx.objectStore(DOCS).delete(meta.id);
        }
        if (parts && "before" in parts) {
          if (parts.before) tx.objectStore(BEFORES).put(parts.before, meta.id);
          else tx.objectStore(BEFORES).delete(meta.id);
        }
      });
    },
    remove: async (id) => {
      await run([META, DOCS, BEFORES], "readwrite", (tx) => {
        tx.objectStore(META).delete(id);
        tx.objectStore(DOCS).delete(id);
        tx.objectStore(BEFORES).delete(id);
      });
    },
  };
}

let opened: Promise<Backend> | null = null;

/** The backend this browser gets: IndexedDB; its Storage where there is no IndexedDB at all;
 *  memory where neither works. A database that exists but did not open this once (slow, or a
 *  passing error) gets memory too, not the Storage: work written there would be missing from
 *  the list on the next visit, when the database opens again. Memory says it keeps nothing. */
export function openProjects(): Promise<Backend> {
  opened ??= (async () => {
    if (typeof indexedDB !== "undefined") {
      try {
        /* the first connection proves the database opens; later ones are made the same way */
        let first: IDBDatabase | null = await openDb(indexedDB);
        return idbBackend(() => {
          const db = first;
          first = null;
          return db ? Promise.resolve(db) : openDb(indexedDB);
        });
      } catch {
        return memoryBackend();
      }
    }
    try {
      const probe = "m3e:probe";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return storageBackend(localStorage);
    } catch {}
    return memoryBackend();
  })();
  return opened;
}

/** the browser's own storage for the small keys beside the projects, or a stand-in where it is closed */
export function smallStorage(): KeyValue {
  try {
    localStorage.getItem(LAST_KEY);
    return localStorage;
  } catch {
    const map = new Map<string, string>();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  }
}

/* ---------- rules ---------- */

/** every project, the one worked on last first */
export async function listProjects(b: Backend): Promise<ProjectMeta[]> {
  return (await b.metas()).filter((m) => !m.hidden).sort((x, y) => y.updatedAt - x.updatedAt || y.createdAt - x.createdAt);
}

/** A new project. Without a document it is untouched: the editor seeds it on first open.
 *  With one (a link, a file, a copy) it already holds the author's work. */
export async function createProject(b: Backend, doc: Doc | null, now = Date.now()): Promise<ProjectMeta> {
  const meta = describeDoc({ id: uid() + uid(), title: "", createdAt: now, updatedAt: now, edited: doc !== null, screens: 0 }, doc);
  await b.write(meta, { doc, before: null });
  return meta;
}

export async function loadProject(b: Backend, id: string): Promise<Project | null> {
  const meta = await b.meta(id);
  if (!meta || meta.hidden) {
    /* gone from storage: whatever an editor still held for it goes with it */
    parked.delete(id);
    return null;
  }
  const [doc, before] = await Promise.all([b.doc(id), b.before(id)]);
  /* What an editor of this page could not get into storage before it was left is newer than
     what storage holds. The next editor shows it, and its saver takes the writing over. */
  const left = parked.get(id);
  if (!left) return { meta, doc, before };
  return { meta: left.meta, doc: "doc" in left.parts ? (left.parts.doc ?? null) : doc, before: "before" in left.parts ? (left.parts.before ?? null) : before };
}

/** Work an editor could not write before it was left, by project. It waits here for the next
 *  editor of that project; nothing retries it in between, so it cannot land on top of newer
 *  work or bring back a project that was deleted meanwhile. */
const parked = new Map<string, { meta: ProjectMeta; parts: ProjectParts }>();
/** whether this page still holds work that has not reached storage */
export const hasUnwritten = () => parked.size > 0;
/** drops what was held for a project: it has been deleted */
export const forgetUnwritten = (id: string) => void parked.delete(id);

/** a copy of a project under `title`, with nothing left under review */
export async function duplicateProject(b: Backend, id: string, title: string, now = Date.now()): Promise<ProjectMeta | null> {
  const from = await loadProject(b, id);
  if (!from) return null;
  const meta = await createProject(b, from.doc ? { ...from.doc, title } : null, now);
  if (from.doc) return meta;
  /* a project never opened has no document to carry the name yet; the copy was asked for
     by name, so it is no longer one a new design may take over */
  const named = { ...meta, title, edited: true };
  await b.write(named);
  return named;
}

/** names a project: the name is the document's title, so the editor and the prompt follow */
export async function renameProject(b: Backend, id: string, title: string, now = Date.now()): Promise<ProjectMeta | null> {
  const from = await loadProject(b, id);
  if (!from) return null;
  const name = title.trim();
  if (name === from.meta.title) return from.meta;
  const meta = { ...from.meta, title: name, updatedAt: now, edited: true };
  await b.write(meta, from.doc ? { doc: { ...from.doc, title: name } } : undefined);
  return meta;
}

/** a short fingerprint of a stored entry: its length and a hash of its text */
const fingerprint = (raw: string) => {
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `${raw.length}:${h >>> 0}`;
};

/** writes a small key, and says whether it was kept; a storage that is full or closed must not
 *  undo what was just saved */
const note = (storage: KeyValue, key: string, value: string) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/** a `Storage` that is only read: for a visit whose projects live in memory, which must not
 *  leave notes behind saying work was moved or opened when nothing was kept */
export const readOnly = (storage: KeyValue): KeyValue => ({ getItem: (key) => storage.getItem(key), setItem: () => {}, removeItem: () => {} });

/** Runs `work` alone across this browser's tabs, where the browser can promise that. Where it
 *  refuses to (some embedded views), the work is still done, just without the promise. */
const alone = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
  if (typeof navigator === "undefined" || !navigator.locks) return work();
  let started = false;
  try {
    return (await navigator.locks.request(name, () => {
      started = true;
      return work();
    })) as T;
  } catch (error) {
    if (started) throw error;
    return work();
  }
};

/** the store's own note of a legacy entry it has moved, for a browser whose Storage could not keep the flag */
const movedNote = (sig: string, now: number): ProjectMeta => ({ id: `legacy:${sig}`, title: "", createdAt: now, updatedAt: now, edited: true, screens: 0, legacy: sig, hidden: true });

/** Moves the document an earlier version kept in localStorage into a project. The old entry
 *  stays where it is: a backup, and what an older tab still reads and writes. It is moved
 *  once; if an older tab changes it afterwards, that work is moved too, as a project of its
 *  own. `exclusive` keeps two tabs from moving it at the same moment. */
export async function adoptLegacy(b: Backend, storage: KeyValue, now = Date.now(), exclusive: <T>(work: () => Promise<T>) => Promise<T> = (work) => alone("m3e:doc:adopt", work)): Promise<ProjectMeta | null> {
  return exclusive(async () => {
    let raw: string | null = null;
    let movedAs: string | null = null;
    try {
      raw = storage.getItem(LEGACY_DOC_KEY);
      movedAs = storage.getItem(MOVED_KEY) ? (storage.getItem(MOVED_SIG_KEY) ?? "") : null;
    } catch {}
    if (!raw) return null;
    const sig = fingerprint(raw);
    if (movedAs !== null) {
      /* moved before fingerprints were kept: what is there now is taken to be what was moved */
      if (movedAs === "") note(storage, MOVED_SIG_KEY, sig);
      if (movedAs === "" || movedAs === sig) return null;
    }
    let doc: Doc | null = null;
    let before: Doc | null = null;
    try {
      const value: unknown = JSON.parse(raw);
      /* the editor has always read this entry leniently, so an older shape is taken as it is
         and brought up to date by the editor's own migrations on first open */
      if (isRecord(value) && Array.isArray(value.groups) && Array.isArray(value.frames)) doc = value as unknown as Doc;
      const held: unknown = doc ? JSON.parse(storage.getItem(LEGACY_BEFORE_KEY) ?? "null") : null;
      if (isProject(held)) before = held;
    } catch {}
    if (!doc) return null;
    /* The flags are kept in a storage that may be full. A project made from this very entry
       says so itself, and so does the note below, so a visit that could not write the flags
       does not move the entry again, even after its project has been deleted. */
    const twin = (await b.metas()).find((m) => m.legacy === sig);
    const meta = twin ?? describeDoc({ id: uid() + uid(), title: "", createdAt: now, updatedAt: now, edited: true, screens: 0, legacy: sig }, doc);
    if (!twin) await b.write(meta, { doc, before });
    const flagged = note(storage, MOVED_KEY, meta.id) && note(storage, MOVED_SIG_KEY, sig);
    if (!flagged && !twin?.hidden) await b.write(movedNote(sig, now)).catch(() => {});
    if (!twin) note(storage, LAST_KEY, meta.id);
    return twin ? null : meta;
  });
}

/** The project a visit opens: the one the address names, else the one opened last, else
 *  the most recent, else a new one. `missing` says the address named a project that is gone. */
export async function resolveProject(b: Backend, storage: KeyValue, wanted: string | null, now = Date.now()): Promise<{ project: Project; missing: boolean }> {
  await adoptLegacy(b, storage, now);
  const tries = [wanted, storage.getItem(LAST_KEY), (await listProjects(b))[0]?.id ?? null];
  let project: Project | null = null;
  for (const id of tries) {
    project = id ? await loadProject(b, id) : null;
    if (project) break;
  }
  if (!project) project = { meta: await createProject(b, null, now), doc: null, before: null };
  note(storage, LAST_KEY, project.meta.id);
  return { project, missing: !!wanted && project.meta.id !== wanted };
}

/** Where an arriving design (a link, a file) goes: into `current` when the author has not
 *  touched it, so opening a link on a fresh visit leaves no empty project behind; otherwise
 *  into a project of its own, so nothing the author made is replaced. */
export async function receiveDesign(b: Backend, current: ProjectMeta | null, doc: Doc, now = Date.now()): Promise<ProjectMeta> {
  if (!current || current.edited) return createProject(b, doc, now);
  const meta = describeDoc({ ...current, updatedAt: now, edited: true }, doc);
  await b.write(meta, { doc, before: null });
  return meta;
}

/* ---------- saving from the editor ---------- */

export type Saver = {
  /** the bookkeeping as of the last push */
  meta(): ProjectMeta;
  /** the document as it stands; the same content twice in a row is written once */
  push(doc: Doc): void;
  /** the design under review beside the document, or null once it is kept or undone */
  hold(before: Doc | null): void;
  /** settles once no write is under way; after a failed write there may still be work waiting */
  idle(): Promise<void>;
  /** whether something pushed is not in storage yet: being written, or waiting after a failure */
  pending(): boolean;
  /** tries again what a failed write left waiting; settles like `idle` */
  retry(): Promise<void>;
  /** The editor is on screen (again): the saver writes, and takes back anything it handed on. */
  attach(): void;
  /** The editor has been left. Nothing more is written on its own: a write under way
   *  finishes, and what still waits is handed on to the next editor of the project. */
  dispose(): void;
};

/** the writes under way in this page, whichever editor started them */
const writing = new Set<Promise<void>>();

/** Settles once every editor of this page has finished writing. A project is read only after
 *  this, so an editor that has just been left cannot overwrite what its successor reads. */
export async function writesSettled(): Promise<void> {
  while (writing.size) await Promise.all([...writing]);
}

/** how long after a failed write it is tried again on its own */
const RETRY_MS = 4000;

/** Writes the editor's document as it changes. Writes never overlap: while one is under
 *  way the newest state waits, and replaces any state that was waiting before it. A write
 *  that fails keeps what it carried and is tried again, on the next change or after a moment.
 *
 *  The first push is the document as it was opened, so it does not count as an edit; any
 *  later push that differs does. Where the project already had a document (`stored`), that
 *  first push is not written at all: storage holds it already, and writing it back could
 *  only replace something newer. */
export function createSaver(
  b: Backend,
  initial: ProjectMeta,
  options: {
    now?: () => number;
    onError?: (error: unknown) => void;
    /** writes are landing again after having failed */
    onSaved?: () => void;
    /** a write has landed, every time one does */
    onWritten?: () => void;
    stored?: boolean;
    retryMs?: number | null;
  } = {},
): Saver {
  const now = options.now ?? Date.now;
  const retryMs = options.retryMs === undefined ? RETRY_MS : options.retryMs;
  let meta = initial;
  let last: string | null = null;
  let waiting: ProjectParts | null = null;
  let running: Promise<void> | null = null;
  let failing = false;
  let again: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  /* what an earlier editor of this project could not write is this one's to write now */
  const take = () => {
    const left = parked.get(meta.id);
    if (!left) return false;
    parked.delete(meta.id);
    meta = left.meta;
    waiting = { ...left.parts, ...(waiting ?? {}) };
    failing = true;
    return true;
  };
  const hand = () => {
    if (!waiting) return;
    parked.set(meta.id, { meta, parts: waiting });
    waiting = null;
  };
  const pump = (): Promise<void> => {
    if (again !== null) {
      clearTimeout(again);
      again = null;
    }
    if (running) return running;
    if (disposed) return Promise.resolve();
    const run: Promise<void> = (async () => {
      /* always finish on a later tick, so `running` is assigned before it is cleared */
      await Promise.resolve();
      while (waiting) {
        const parts = waiting;
        waiting = null;
        try {
          await b.write(meta, parts);
          /* a listener's own trouble is not a failed write */
          try {
            options.onWritten?.();
          } catch {}
          if (failing) {
            failing = false;
            options.onSaved?.();
          }
        } catch (error) {
          /* nothing is dropped: what this write carried waits again, under anything newer */
          waiting = { ...parts, ...(waiting ?? {}) };
          failing = true;
          options.onError?.(error);
          if (retryMs !== null && !disposed) again = setTimeout(() => void pump(), retryMs);
          break;
        }
      }
      running = null;
      if (disposed) hand();
    })().finally(() => writing.delete(run));
    running = run;
    writing.add(run);
    return run;
  };
  if (take()) void pump();
  return {
    meta: () => meta,
    push(doc) {
      const json = JSON.stringify(doc);
      if (json === last) return;
      const first = last === null;
      if (!first) meta = { ...meta, edited: true, updatedAt: now() };
      last = json;
      meta = describeDoc(meta, doc);
      if (first && options.stored) return;
      waiting = { ...waiting, doc };
      void pump();
    },
    hold(before) {
      waiting = { ...waiting, before };
      void pump();
    },
    idle: () => running ?? Promise.resolve(),
    pending: () => running !== null || waiting !== null,
    retry: () => (waiting ? pump() : (running ?? Promise.resolve())),
    attach() {
      disposed = false;
      if (take()) void pump();
    },
    dispose() {
      disposed = true;
      if (again !== null) {
        clearTimeout(again);
        again = null;
      }
      if (!running) hand();
    },
  };
}

export const PERSIST_ASKED_KEY = "m3e:persist:asked";
/** how long a browser that said no is left alone before it is asked again */
const PERSIST_ASK_EVERY = 30 * 24 * 60 * 60 * 1000;

/** Asks the browser to hold on to this site's storage. Left to itself a browser may clear it
 *  when the disk runs short, and the projects with it; storage marked persistent is cleared
 *  only by the person. Chrome decides on its own and says nothing, Firefox asks the person, so
 *  a refusal is not asked about again for a month. Settles true when the storage is kept. */
export async function keepStored(
  storage: KeyValue,
  now = Date.now(),
  manager: Pick<StorageManager, "persist" | "persisted"> | undefined = typeof navigator !== "undefined" ? navigator.storage : undefined,
): Promise<boolean> {
  try {
    if (!manager || typeof manager.persist !== "function" || typeof manager.persisted !== "function") return false;
    if (await manager.persisted()) return true;
    const asked = Number(storage.getItem(PERSIST_ASKED_KEY));
    if (Number.isFinite(asked) && asked > 0 && now - asked < PERSIST_ASK_EVERY) return false;
    storage.setItem(PERSIST_ASKED_KEY, String(now));
    return await manager.persist();
  } catch {
    return false;
  }
}

/** Whether another tab has this project open for editing; false where the browser has no
 *  locks. The lock is looked at, never taken: an editor starting at that very moment must
 *  still get it. */
export async function openElsewhere(id: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks) return false;
  try {
    if (typeof navigator.locks.query === "function") return ((await navigator.locks.query()).held ?? []).some((lock) => lock.name === lockName(id));
    return await navigator.locks.request(lockName(id), { ifAvailable: true }, async (lock) => !lock);
  } catch {
    return false;
  }
}
