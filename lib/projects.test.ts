import { describe, expect, it } from "vitest";
import {
  LAST_KEY,
  LEGACY_BEFORE_KEY,
  LEGACY_DOC_KEY,
  MOVED_KEY,
  MOVED_SIG_KEY,
  adoptLegacy,
  createProject,
  createSaver,
  duplicateProject,
  forgetUnwritten,
  hasUnwritten,
  listProjects,
  loadProject,
  lockName,
  memoryBackend,
  receiveDesign,
  renameProject,
  resolveProject,
  storageBackend,
  writesSettled,
  type Backend,
  type KeyValue,
} from "./projects";
import { PERSIST_ASKED_KEY, keepStored } from "./projects";
import type { Doc } from "./tokens";

const doc = (title: string, screens = 1): Doc => ({
  title,
  brief: "",
  paletteKey: "purple",
  frame: "phone",
  frames: Array.from({ length: screens }, (_, i) => ({ id: `f${i}`, name: `Screen ${i}`, x: i * 492, y: 0 })),
  groups: [{ id: "g", x: 16, y: 112, axis: "x", items: [{ id: "b", kind: "button", label: "Go", icon: null, variant: "filled" }] }],
});

const fakeStorage = (seed: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seed));
  const storage: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  return { storage, map };
};

const backends: [string, () => Backend][] = [
  ["memory", memoryBackend],
  ["storage", () => storageBackend(fakeStorage().storage)],
];

describe.each(backends)("%s backend", (_name, make) => {
  it("keeps a project's bookkeeping, document and held draft apart", async () => {
    const b = make();
    const meta = await createProject(b, doc("Recipes", 3), 100);
    expect(meta).toMatchObject({ title: "Recipes", screens: 3, edited: true, createdAt: 100, updatedAt: 100 });
    await b.write(meta, { before: doc("Earlier") });
    const loaded = await loadProject(b, meta.id);
    expect(loaded?.doc?.title).toBe("Recipes");
    expect(loaded?.before?.title).toBe("Earlier");
    /* a write that names no part leaves both where they were */
    await b.write({ ...meta, updatedAt: 200 });
    expect((await loadProject(b, meta.id))?.doc?.frames).toHaveLength(3);
    expect((await b.before(meta.id))?.title).toBe("Earlier");
    await b.write(meta, { before: null });
    expect(await b.before(meta.id)).toBeNull();
  });

  it("removes a project with everything it held", async () => {
    const b = make();
    const meta = await createProject(b, doc("Gone"), 1);
    await b.write(meta, { before: doc("Held") });
    await b.remove(meta.id);
    expect(await loadProject(b, meta.id)).toBeNull();
    expect(await b.doc(meta.id)).toBeNull();
    expect(await b.before(meta.id)).toBeNull();
    expect(await listProjects(b)).toEqual([]);
  });

  it("lists the project worked on last first", async () => {
    const b = make();
    const old = await createProject(b, doc("Old"), 1);
    const fresh = await createProject(b, doc("Fresh"), 2);
    expect((await listProjects(b)).map((m) => m.id)).toEqual([fresh.id, old.id]);
    await renameProject(b, old.id, "Older", 3);
    expect((await listProjects(b)).map((m) => m.title)).toEqual(["Older", "Fresh"]);
  });
});

describe("projects", () => {
  it("starts a project without a document as untouched", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, null, 5);
    expect(meta).toMatchObject({ title: "", screens: 0, edited: false });
    expect((await loadProject(b, meta.id))?.doc).toBeNull();
  });

  it("writes a new name into the document, and only when it changed", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, doc("Before"), 1);
    const same = await renameProject(b, meta.id, "  Before ", 9);
    expect(same?.updatedAt).toBe(1);
    const named = await renameProject(b, meta.id, " After ", 9);
    expect(named).toMatchObject({ title: "After", updatedAt: 9 });
    expect((await b.doc(meta.id))?.title).toBe("After");
    expect(await renameProject(b, "nope", "x", 9)).toBeNull();
  });

  it("copies a project under a new name without the draft under review", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, doc("Recipes", 2), 1);
    await b.write(meta, { before: doc("Held") });
    const twin = await duplicateProject(b, meta.id, "Recipes copy", 7);
    expect(twin).toMatchObject({ title: "Recipes copy", screens: 2, createdAt: 7 });
    expect(twin?.id).not.toBe(meta.id);
    expect(await b.before(twin!.id)).toBeNull();
    expect((await b.doc(meta.id))?.title).toBe("Recipes");
  });

  it("names the copy of a project that was never opened", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, null, 1);
    const twin = await duplicateProject(b, meta.id, "Untitled copy", 2);
    expect(twin?.title).toBe("Untitled copy");
    /* a copy made by name is the author's: an arriving design must not take it over */
    expect(await b.meta(twin!.id)).toMatchObject({ title: "Untitled copy", edited: true });
  });

  it("gives each project its own edit lock", () => {
    expect(lockName("a")).not.toBe(lockName("b"));
  });
});

describe("moving the legacy document", () => {
  it("turns it into a project once and leaves the old entry as a backup", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine", 2)), [LEGACY_BEFORE_KEY]: JSON.stringify(doc("Held")) });
    const meta = await adoptLegacy(b, storage, 10);
    expect(meta).toMatchObject({ title: "Mine", screens: 2, edited: true });
    expect((await b.before(meta!.id))?.title).toBe("Held");
    expect(map.get(MOVED_KEY)).toBe(meta!.id);
    expect(map.get(LAST_KEY)).toBe(meta!.id);
    expect(map.has(LEGACY_DOC_KEY)).toBe(true);
    expect(await adoptLegacy(b, storage, 11)).toBeNull();
    expect(await listProjects(b)).toHaveLength(1);
  });

  it("moves the entry again, as a project of its own, when an older tab has changed it since", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine")) });
    const first = await adoptLegacy(b, storage, 1);
    /* a tab still running the earlier version goes on writing the old entry */
    map.set(LEGACY_DOC_KEY, JSON.stringify(doc("Mine, later", 3)));
    const second = await adoptLegacy(b, storage, 2);
    expect(second).toMatchObject({ title: "Mine, later", screens: 3 });
    expect(second!.id).not.toBe(first!.id);
    expect((await b.doc(first!.id))?.title).toBe("Mine");
    expect(await adoptLegacy(b, storage, 3)).toBeNull();
    expect(await listProjects(b)).toHaveLength(2);
  });

  it("does not move it twice when the flags could not be written", async () => {
    const b = memoryBackend();
    const map = new Map([[LEGACY_DOC_KEY, JSON.stringify(doc("Mine"))]]);
    /* a storage that is full: reads work, every write throws */
    const full: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(await adoptLegacy(b, full, 1)).toMatchObject({ title: "Mine" });
    expect(await adoptLegacy(b, full, 2)).toBeNull();
    expect(await adoptLegacy(b, full, 3)).toBeNull();
    expect(await listProjects(b)).toHaveLength(1);
  });

  it("does not bring a deleted project back even where the flags could never be written", async () => {
    const b = memoryBackend();
    const map = new Map([[LEGACY_DOC_KEY, JSON.stringify(doc("Mine"))]]);
    const full: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    const meta = await adoptLegacy(b, full, 1);
    /* the store keeps a note of its own, which is not a project */
    expect(await listProjects(b)).toHaveLength(1);
    await b.remove(meta!.id);
    expect(await adoptLegacy(b, full, 2)).toBeNull();
    expect(await listProjects(b)).toEqual([]);
    expect(await loadProject(b, (await b.metas())[0].id)).toBeNull();
  });

  it("does not bring a deleted project back", async () => {
    const b = memoryBackend();
    const { storage } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine")) });
    const meta = await adoptLegacy(b, storage, 1);
    await b.remove(meta!.id);
    expect(await adoptLegacy(b, storage, 2)).toBeNull();
    expect(await listProjects(b)).toEqual([]);
  });

  it("is moved once when two tabs arrive together", async () => {
    const b = memoryBackend();
    const { storage } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine")) });
    /* what the browser's lock does: one at a time */
    let queue: Promise<unknown> = Promise.resolve();
    const exclusive = <T>(work: () => Promise<T>) => {
      const next = queue.then(work);
      queue = next.catch(() => {});
      return next;
    };
    const [one, two] = await Promise.all([adoptLegacy(b, storage, 1, exclusive), adoptLegacy(b, storage, 1, exclusive)]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(await listProjects(b)).toHaveLength(1);
  });

  it("takes a move made before fingerprints were kept as done", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine")), [MOVED_KEY]: "earlier" });
    expect(await adoptLegacy(b, storage, 1)).toBeNull();
    expect(map.has(MOVED_SIG_KEY)).toBe(true);
    expect(await listProjects(b)).toEqual([]);
  });

  it("takes an older, looser document as it is", async () => {
    const b = memoryBackend();
    const { storage } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify({ groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }] }) });
    const meta = await adoptLegacy(b, storage, 1);
    expect(meta).toMatchObject({ title: "", screens: 1 });
  });

  it("ignores an entry that is not a document", async () => {
    const b = memoryBackend();
    for (const raw of ["{", "null", "[]", JSON.stringify({ groups: 1 })]) {
      const { storage, map } = fakeStorage({ [LEGACY_DOC_KEY]: raw });
      expect(await adoptLegacy(b, storage, 1)).toBeNull();
      expect(map.has(MOVED_KEY)).toBe(false);
    }
    expect(await listProjects(b)).toEqual([]);
  });
});

describe("the project a visit opens", () => {
  it("is the one the address names", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage();
    const a = await createProject(b, doc("A"), 1);
    const c = await createProject(b, doc("C"), 2);
    map.set(LAST_KEY, c.id);
    const { project, missing } = await resolveProject(b, storage, a.id, 3);
    expect(project.meta.id).toBe(a.id);
    expect(missing).toBe(false);
    expect(map.get(LAST_KEY)).toBe(a.id);
  });

  it("falls back to the one opened last, then the most recent, and says the named one is gone", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage();
    const a = await createProject(b, doc("A"), 1);
    const c = await createProject(b, doc("C"), 2);
    map.set(LAST_KEY, a.id);
    const first = await resolveProject(b, storage, "gone", 3);
    expect(first.project.meta.id).toBe(a.id);
    expect(first.missing).toBe(true);
    map.delete(LAST_KEY);
    expect((await resolveProject(b, storage, null, 3)).project.meta.id).toBe(c.id);
  });

  it("is the legacy document on the first visit after the move", async () => {
    const b = memoryBackend();
    const { storage } = fakeStorage({ [LEGACY_DOC_KEY]: JSON.stringify(doc("Mine")) });
    const { project, missing } = await resolveProject(b, storage, null, 1);
    expect(project.doc?.title).toBe("Mine");
    expect(missing).toBe(false);
  });

  it("is a new untouched project when there is nothing yet", async () => {
    const b = memoryBackend();
    const { storage, map } = fakeStorage();
    const { project } = await resolveProject(b, storage, null, 1);
    expect(project).toMatchObject({ doc: null, before: null, meta: { edited: false } });
    expect(map.get(LAST_KEY)).toBe(project.meta.id);
    /* the next visit opens the same one instead of piling up empty projects */
    expect((await resolveProject(b, storage, null, 2)).project.meta.id).toBe(project.meta.id);
    expect(await listProjects(b)).toHaveLength(1);
  });
});

describe("an arriving design", () => {
  it("takes over a project the author has not touched", async () => {
    const b = memoryBackend();
    const blank = await createProject(b, null, 1);
    const meta = await receiveDesign(b, blank, doc("Linked", 4), 2);
    expect(meta).toMatchObject({ id: blank.id, title: "Linked", screens: 4, edited: true, updatedAt: 2 });
    expect(await listProjects(b)).toHaveLength(1);
  });

  it("gets a project of its own beside one that holds work", async () => {
    const b = memoryBackend();
    const mine = await createProject(b, doc("Mine"), 1);
    const meta = await receiveDesign(b, mine, doc("Linked"), 2);
    expect(meta.id).not.toBe(mine.id);
    expect((await b.doc(mine.id))?.title).toBe("Mine");
    expect(await listProjects(b)).toHaveLength(2);
  });
});

describe("saving from the editor", () => {
  const clock = () => {
    let at = 100;
    return () => ++at;
  };

  it("does not count the document as opened as an edit", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, null, 1);
    const saver = createSaver(b, meta, { now: clock() });
    saver.push(doc("", 1));
    await saver.idle();
    expect(saver.meta()).toMatchObject({ edited: false, updatedAt: 1, screens: 1 });
    expect((await b.doc(meta.id))?.frames).toHaveLength(1);
    /* the same content again writes nothing and changes nothing */
    saver.push(doc("", 1));
    expect(saver.meta().updatedAt).toBe(1);
  });

  it("marks the project edited on the first real change and keeps its name in step", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, null, 1);
    const saver = createSaver(b, meta, { now: clock() });
    saver.push(doc("", 1));
    saver.push(doc("Recipes", 2));
    await saver.idle();
    expect(saver.meta()).toMatchObject({ edited: true, title: "Recipes", screens: 2, updatedAt: 101 });
    expect(await b.meta(meta.id)).toMatchObject({ edited: true, title: "Recipes" });
  });

  it("says so each time a write lands, and a listener that throws does not fail the write", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, null, 1);
    let landed = 0;
    let failed = 0;
    const saver = createSaver(b, meta, {
      now: clock(),
      onError: () => failed++,
      onWritten: () => {
        landed++;
        throw new Error("the listener's own trouble");
      },
    });
    saver.push(doc("", 1));
    await saver.idle();
    expect(landed).toBe(1);
    saver.push(doc("Recipes", 2));
    await saver.idle();
    expect(landed).toBe(2);
    expect(failed).toBe(0);
    expect(saver.pending()).toBe(false);
    expect((await b.doc(meta.id))?.title).toBe("Recipes");
  });

  it("never overlaps writes and always ends on the newest state", async () => {
    const inner = memoryBackend();
    let open = 0;
    let most = 0;
    const written: string[] = [];
    const b: Backend = {
      ...inner,
      write: async (m, parts) => {
        most = Math.max(most, ++open);
        await new Promise((r) => setTimeout(r, 2));
        if (parts?.doc) written.push(parts.doc.title);
        await inner.write(m, parts);
        open--;
      },
    };
    const meta = await createProject(inner, null, 1);
    const saver = createSaver(b, meta, { now: clock() });
    for (const title of ["a", "b", "c", "d"]) saver.push(doc(title));
    await new Promise((r) => setTimeout(r, 1));
    saver.push(doc("e"));
    await saver.idle();
    expect(most).toBe(1);
    expect(written.at(-1)).toBe("e");
    expect(written.length).toBeLessThan(5);
    expect((await inner.doc(meta.id))?.title).toBe("e");
  });

  it("writes the held draft beside the document and clears it", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, doc("Mine"), 1);
    const saver = createSaver(b, meta, { now: clock() });
    saver.push(doc("Mine"));
    saver.hold(doc("Held"));
    await saver.idle();
    expect((await b.before(meta.id))?.title).toBe("Held");
    expect((await b.doc(meta.id))?.title).toBe("Mine");
    saver.hold(null);
    await saver.idle();
    expect(await b.before(meta.id)).toBeNull();
  });

  const flaky = () => {
    const inner = memoryBackend();
    const state = { fail: true };
    const errors: unknown[] = [];
    const b: Backend = {
      ...inner,
      write: async (m, parts) => {
        if (state.fail) throw new Error("quota");
        await inner.write(m, parts);
      },
    };
    return { inner, b, state, errors };
  };

  it("reports a write that fails and carries on with the next", async () => {
    const { inner, b, state, errors } = flaky();
    const meta = await createProject(inner, null, 1);
    const saver = createSaver(b, meta, { now: clock(), onError: (e) => errors.push(e), retryMs: null });
    saver.push(doc("a"));
    await saver.idle();
    expect(errors).toHaveLength(1);
    state.fail = false;
    saver.push(doc("b"));
    await saver.idle();
    expect((await inner.doc(meta.id))?.title).toBe("b");
  });

  it("keeps what a failed write carried and writes it when tried again, with no new edit", async () => {
    const { inner, b, state, errors } = flaky();
    const meta = await createProject(inner, null, 1);
    let recovered = 0;
    const saver = createSaver(b, meta, { now: clock(), onError: (e) => errors.push(e), onSaved: () => recovered++, retryMs: null });
    saver.push(doc("a"));
    await saver.idle();
    expect(saver.pending()).toBe(true);
    expect(await inner.doc(meta.id)).toBeNull();
    /* the author makes no further change: the edit must still reach storage */
    state.fail = false;
    saver.push(doc("a"));
    await saver.retry();
    expect((await inner.doc(meta.id))?.title).toBe("a");
    expect(saver.pending()).toBe(false);
    expect(recovered).toBe(1);
  });

  it("does not lose the design under review when the write that carried it fails", async () => {
    const { inner, b, state } = flaky();
    const meta = await createProject(inner, doc("Mine"), 1);
    const saver = createSaver(b, meta, { now: clock(), retryMs: null, stored: true });
    saver.push(doc("Mine"));
    /* a draft arrives: the replaced design and the draft travel in one write, which fails */
    saver.hold(doc("Mine"));
    saver.push(doc("Draft"));
    await saver.idle();
    state.fail = false;
    saver.push(doc("Draft, touched"));
    await saver.idle();
    expect((await inner.doc(meta.id))?.title).toBe("Draft, touched");
    expect((await inner.before(meta.id))?.title).toBe("Mine");
  });

  it("tries a failed write again on its own after a moment", async () => {
    const { inner, b, state } = flaky();
    const meta = await createProject(inner, null, 1);
    const saver = createSaver(b, meta, { now: clock(), retryMs: 5 });
    saver.push(doc("a"));
    await saver.idle();
    state.fail = false;
    await new Promise((r) => setTimeout(r, 30));
    await saver.idle();
    expect((await inner.doc(meta.id))?.title).toBe("a");
  });

  it("does not write back the document a stored project was opened with", async () => {
    const b = memoryBackend();
    const meta = await createProject(b, doc("Stored"), 1);
    /* another editor of this page has since written something newer */
    await b.write({ ...meta, updatedAt: 50 }, { doc: doc("Newer") });
    const saver = createSaver(b, meta, { now: clock(), stored: true });
    saver.push(doc("Stored"));
    await saver.idle();
    expect(saver.pending()).toBe(false);
    expect((await b.doc(meta.id))?.title).toBe("Newer");
    expect(saver.meta().edited).toBe(true);
    /* a real change is written as before */
    saver.push(doc("Changed"));
    await saver.idle();
    expect((await b.doc(meta.id))?.title).toBe("Changed");
  });

  it("stops on its own once its editor is left, and hands what it could not write to the next one", async () => {
    const { inner, b, state } = flaky();
    const meta = await createProject(inner, doc("Stored"), 1);
    const first = createSaver(b, meta, { now: clock(), retryMs: 5, stored: true });
    first.push(doc("Stored"));
    first.push(doc("Unwritten"));
    await first.idle();
    /* the author leaves the editor while the write is still failing */
    first.dispose();
    expect(hasUnwritten()).toBe(true);
    state.fail = false;
    await new Promise((r) => setTimeout(r, 30));
    /* nothing retried behind the author's back */
    expect((await inner.doc(meta.id))?.title).toBe("Stored");
    /* the next editor of the project opens on the unwritten work and writes it */
    const reopened = await loadProject(inner, meta.id);
    expect(reopened?.doc?.title).toBe("Unwritten");
    const second = createSaver(b, reopened!.meta, { now: clock(), retryMs: null, stored: true });
    second.push(reopened!.doc!);
    await second.idle();
    expect((await inner.doc(meta.id))?.title).toBe("Unwritten");
    expect(hasUnwritten()).toBe(false);
    second.push(doc("And on"));
    await second.idle();
    expect((await inner.doc(meta.id))?.title).toBe("And on");
  });

  it("does not bring a project back after it was deleted while its editor was away", async () => {
    const { inner, b, state } = flaky();
    const meta = await createProject(inner, doc("Stored"), 1);
    const saver = createSaver(b, meta, { now: clock(), retryMs: 5, stored: true });
    saver.push(doc("Stored"));
    saver.push(doc("Unwritten"));
    await saver.idle();
    saver.dispose();
    /* deleted from the list, which forgets what was held for it */
    await inner.remove(meta.id);
    forgetUnwritten(meta.id);
    state.fail = false;
    await new Promise((r) => setTimeout(r, 30));
    expect(await inner.meta(meta.id)).toBeNull();
    expect(hasUnwritten()).toBe(false);
  });

  it("carries on when the same editor comes back on screen", async () => {
    const { inner, b, state } = flaky();
    const meta = await createProject(inner, doc("Stored"), 1);
    const saver = createSaver(b, meta, { now: clock(), retryMs: null, stored: true });
    saver.push(doc("Stored"));
    saver.push(doc("Unwritten"));
    await saver.idle();
    /* development mounts an editor, takes it down and mounts it again */
    saver.dispose();
    saver.attach();
    expect(hasUnwritten()).toBe(false);
    state.fail = false;
    await saver.retry();
    expect((await inner.doc(meta.id))?.title).toBe("Unwritten");
  });

  it("lets a reader wait for every write of the page", async () => {
    const inner = memoryBackend();
    const b: Backend = {
      ...inner,
      write: async (m, parts) => {
        await new Promise((r) => setTimeout(r, 5));
        await inner.write(m, parts);
      },
    };
    const meta = await createProject(inner, null, 1);
    const saver = createSaver(b, meta, { now: clock() });
    saver.push(doc("a"));
    saver.push(doc("b"));
    await writesSettled();
    expect((await inner.doc(meta.id))?.title).toBe("b");
  });
});

describe("asking the browser to hold on to its storage", () => {
  const store = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  };
  const browser = (kept: boolean, grants: boolean) => {
    let asked = 0;
    return { manager: { persisted: async () => kept, persist: async () => (asked++, grants) }, asked: () => asked };
  };
  const DAY = 24 * 60 * 60 * 1000;

  it("does not ask a browser that already keeps it", async () => {
    const b = browser(true, true);
    expect(await keepStored(store(), 1000, b.manager)).toBe(true);
    expect(b.asked()).toBe(0);
  });

  it("asks once, and says whether the storage is kept now", async () => {
    const yes = browser(false, true);
    expect(await keepStored(store(), 1000, yes.manager)).toBe(true);
    expect(yes.asked()).toBe(1);
    const no = browser(false, false);
    expect(await keepStored(store(), 1000, no.manager)).toBe(false);
  });

  it("leaves a browser that said no alone for a month, then asks again", async () => {
    const storage = store();
    const b = browser(false, false);
    await keepStored(storage, 1000, b.manager);
    expect(storage.getItem(PERSIST_ASKED_KEY)).toBe("1000");
    expect(await keepStored(storage, 1000 + 29 * DAY, b.manager)).toBe(false);
    expect(b.asked()).toBe(1);
    await keepStored(storage, 1000 + 31 * DAY, b.manager);
    expect(b.asked()).toBe(2);
  });

  it("is no trouble where the browser has nothing to ask, or the asking fails", async () => {
    expect(await keepStored(store(), 1000, undefined)).toBe(false);
    expect(await keepStored(store(), 1000, {} as never)).toBe(false);
    const broken = { persisted: async () => false, persist: async () => Promise.reject(new Error("denied")) };
    expect(await keepStored(store(), 1000, broken)).toBe(false);
  });
});
