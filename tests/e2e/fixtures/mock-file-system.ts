export function installMockMnemoVaultWorkspace() {
  class MockFile {
    private readonly encoder = new TextEncoder();

    constructor(private content: string) {}

    get size() {
      return this.encoder.encode(this.content).length;
    }

    async text() {
      return this.content;
    }

    async arrayBuffer() {
      return this.encoder.encode(this.content).buffer;
    }
  }

  class MockWritableFileStream {
    private cursor = 0;

    constructor(private readonly entry: MockFileHandle, keepExistingData = false) {
      if (!keepExistingData) {
        this.entry.content = "";
      } else {
        this.cursor = entry.content.length;
      }
    }

    async seek(position: number) {
      this.cursor = position;
    }

    async write(data: string | ArrayBuffer) {
      const next =
        typeof data === "string" ? data : new TextDecoder().decode(new Uint8Array(data));
      const current = this.entry.content;
      const start = current.slice(0, this.cursor);
      const end = current.slice(this.cursor + next.length);
      this.entry.content = `${start}${next}${end}`;
      this.cursor += next.length;
    }

    async close() {}
  }

  class MockFileHandle {
    readonly kind = "file";

    constructor(
      public readonly name: string,
      public content: string
    ) {}

    async getFile() {
      return new MockFile(this.content);
    }

    async createWritable(options?: { keepExistingData?: boolean }) {
      return new MockWritableFileStream(this, options?.keepExistingData);
    }
  }

  class MockDirectoryHandle {
    readonly kind = "directory";
    private readonly directories = new Map<string, MockDirectoryHandle>();
    private readonly files = new Map<string, MockFileHandle>();

    constructor(public readonly name: string) {}

    async queryPermission() {
      return "granted" as const;
    }

    async getDirectoryHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<MockDirectoryHandle> {
      const existing = this.directories.get(name);
      if (existing) return existing;
      if (!options?.create) {
        throw new Error(`Directory not found: ${name}`);
      }
      const handle = new MockDirectoryHandle(name);
      this.directories.set(name, handle);
      return handle;
    }

    async getFileHandle(
      name: string,
      options?: { create?: boolean }
    ): Promise<MockFileHandle> {
      const existing = this.files.get(name);
      if (existing) return existing;
      if (!options?.create) {
        throw new Error(`File not found: ${name}`);
      }
      const handle = new MockFileHandle(name, "");
      this.files.set(name, handle);
      return handle;
    }

    async removeEntry(name: string) {
      this.files.delete(name);
      this.directories.delete(name);
    }

    async *values() {
      for (const dir of this.directories.values()) {
        yield dir;
      }
      for (const file of this.files.values()) {
        yield file;
      }
    }
  }

  const root = new MockDirectoryHandle("mock-workspace");

  const seedFile = async (path: string, content: string) => {
    const parts = path.split("/");
    const fileName = parts.pop();
    if (!fileName) return;

    let dir = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const handle = await dir.getFileHandle(fileName, { create: true });
    handle.content = content;
  };

  const today = "2026-04-14";

  void seedFile(
    "content/wiki/source.md",
    `---
title: "Source"
type: "source"
created: "${today}"
updated: "${today}"
---

# Source

Links to [[Concept X]].

\`\`\`mnemovault-evidence
{"claims":[],"edges":[{"source_page":"Source","target_page":"Concept X","relation":"describes","evidence_type":"EXTRACTED","confidence":0.9,"source_ref":"a.txt :: intro"}]}
\`\`\`
`
  );

  void seedFile(
    "content/wiki/concept-x.md",
    `---
title: "Concept X"
type: "concept"
created: "${today}"
updated: "${today}"
---

# Concept X
`
  );

  window.__MNEMOVAULT_E2E_DIR_HANDLE__ = root as unknown as FileSystemDirectoryHandle;
  window.showDirectoryPicker = async () => root as unknown as FileSystemDirectoryHandle;
}
