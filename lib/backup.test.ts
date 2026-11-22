import { describe, expect, it } from "vitest";
import { BACKUP_KIND, backupFileName, collectBackup, designsIn, readDesigns, restoreBackup } from "./backup";
import { createProject, listProjects, memoryBackend, renameProject } from "./projects";
import type { Doc } from "./tokens";

const design = (title: string, screens = 1): Doc =>
  ({
    title,
    brief: "",
    frame: "phone",
    paletteKey: "purple",
    frames: Array.from({ length: screens }, (_, i) => ({ id: `f${i}`, name: `Screen ${i + 1}`, x: i * 492, y: 0 })),
    groups: [{ id: "g", x: 16, y: 24, axis: "x", items: [{ id: "bar", kind: "topAppBar", label: title, icon: null, variant: "filled" }] }],
  }) as unknown as Doc;

describe("writing the list out", () => {
  it("takes every project that holds a design, newest first, with its times", async () => {
    const b = memoryBackend();
    await createProject(b, design("Recipes", 2), 1000);
    await createProject(b, design("Trips"), 3000);
    /* one the author has not opened yet has nothing of its own to keep */
    await createProject(b, null, 2000);
    const backup = await collectBackup(b, 5000);
    expect(backup.kind).toBe(BACKUP_KIND);
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(5000);
    expect(backup.projects.map((p) => [p.title, p.createdAt, p.updatedAt])).toEqual([
      ["Trips", 3000, 3000],
      ["Recipes", 1000, 1000],
    ]);
    expect(backup.projects[1].doc.frames).toHaveLength(2);
  });

  it("names the file by the day, in two digits", () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe("m3e-canvas projects 2026-01-05.json");
    expect(backupFileName(new Date(2026, 10, 23))).toBe("m3e-canvas projects 2026-11-23.json");
  });
});

describe("reading a file back", () => {
  it("tells a backup from a project file, and from anything else", async () => {
    const b = memoryBackend();
    await createProject(b, design("Recipes"), 1000);
    const backup = JSON.parse(JSON.stringify(await collectBackup(b, 2000)));
    expect(designsIn(backup, 9000)).toEqual({ backup: true, entries: [{ title: "Recipes", createdAt: 1000, updatedAt: 1000, doc: design("Recipes") }] });
    expect(designsIn(design("Trips"), 9000)).toEqual({ backup: false, entries: [{ title: "Trips", createdAt: 9000, updatedAt: 9000, doc: design("Trips") }] });
    for (const other of [null, 3, "text", [], {}, { kind: BACKUP_KIND }, { kind: "something-else", projects: [] }]) expect(designsIn(other)).toBeNull();
  });

  it("keeps the designs of a backup that are sound and leaves the rest out", () => {
    const found = designsIn({ kind: BACKUP_KIND, version: 1, exportedAt: 1, projects: [{ title: "Good", createdAt: 10, updatedAt: 20, doc: design("Good") }, { title: "Bad", doc: { frames: "none" } }, null, "text"] }, 100);
    expect(found?.entries.map((e) => e.title)).toEqual(["Good"]);
    /* an empty backup is still a backup: it is not mistaken for a broken file */
    expect(designsIn({ kind: BACKUP_KIND, projects: [] })).toEqual({ backup: true, entries: [] });
  });

  it("does not trust the times a file claims", () => {
    const at = (createdAt: unknown, updatedAt: unknown) => designsIn({ kind: BACKUP_KIND, projects: [{ title: "T", createdAt, updatedAt, doc: design("T") }] }, 1000)!.entries[0];
    /* missing, not a number, not yet happened: taken as now */
    expect(at(undefined, "soon")).toMatchObject({ createdAt: 1000, updatedAt: 1000 });
    expect(at(-5, 9_999_999)).toMatchObject({ createdAt: 1000, updatedAt: 1000 });
    expect(at(Number.NaN, 400)).toMatchObject({ createdAt: 400, updatedAt: 400 });
    /* a project is not made after it was last changed */
    expect(at(800, 300)).toMatchObject({ createdAt: 300, updatedAt: 300 });
    expect(at(200, 300)).toMatchObject({ createdAt: 200, updatedAt: 300 });
  });

  it("reads a chosen file, and answers null for one that is not JSON", async () => {
    expect((await readDesigns({ text: async () => JSON.stringify(design("Trips")) }))?.entries).toHaveLength(1);
    expect(await readDesigns({ text: async () => "not json" })).toBeNull();
    expect(
      await readDesigns({
        text: async () => {
          throw new Error("unreadable");
        },
      }),
    ).toBeNull();
  });
});

describe("putting a backup into the store", () => {
  it("brings the list back as it was: the same names, times and order, under new ids", async () => {
    const from = memoryBackend();
    const recipes = await createProject(from, design("Recipes", 3), 1000);
    await createProject(from, design("Trips"), 3000);
    const backup = JSON.parse(JSON.stringify(await collectBackup(from)));

    const to = memoryBackend();
    expect(await restoreBackup(to, designsIn(backup)!.entries)).toEqual({ added: 2, present: 0 });
    const list = await listProjects(to);
    expect(list.map((m) => [m.title, m.createdAt, m.updatedAt, m.screens, m.edited])).toEqual([
      ["Trips", 3000, 3000, 1, true],
      ["Recipes", 1000, 1000, 3, true],
    ]);
    expect(list.some((m) => m.id === recipes.id)).toBe(false);
    expect(await to.doc(list[1].id)).toEqual(design("Recipes", 3));
  });

  it("does not double the list when the same backup is opened twice", async () => {
    const b = memoryBackend();
    await createProject(b, design("Recipes"), 1000);
    await createProject(b, design("Trips"), 3000);
    const entries = designsIn(JSON.parse(JSON.stringify(await collectBackup(b))))!.entries;
    expect(await restoreBackup(b, entries)).toEqual({ added: 0, present: 2 });
    expect(await listProjects(b)).toHaveLength(2);
  });

  it("adds a project again once it has been changed since the backup", async () => {
    const b = memoryBackend();
    const recipes = await createProject(b, design("Recipes"), 1000);
    const entries = designsIn(JSON.parse(JSON.stringify(await collectBackup(b))))!.entries;
    await renameProject(b, recipes.id, "Recipes 2", 4000);
    expect(await restoreBackup(b, entries)).toEqual({ added: 1, present: 0 });
    expect((await listProjects(b)).map((m) => m.title)).toEqual(["Recipes 2", "Recipes"]);
  });

  it("adds a single project file every time it is opened, as it always did", async () => {
    const b = memoryBackend();
    const one = designsIn(design("Trips"), 500)!.entries;
    await restoreBackup(b, one);
    expect(await restoreBackup(b, designsIn(design("Trips"), 600)!.entries)).toEqual({ added: 1, present: 0 });
    expect(await listProjects(b)).toHaveLength(2);
  });

  it("keeps what was added before a write failed", async () => {
    const b = memoryBackend();
    const write = b.write.bind(b);
    let writes = 0;
    b.write = async (meta, parts) => {
      if (++writes === 2) throw new Error("full");
      return write(meta, parts);
    };
    const entries = [1, 2, 3].map((n) => ({ title: `P${n}`, createdAt: n, updatedAt: n, doc: design(`P${n}`) }));
    await expect(restoreBackup(b, entries)).rejects.toThrow("full");
    expect((await listProjects(b)).map((m) => m.title)).toEqual(["P1"]);
  });
});
