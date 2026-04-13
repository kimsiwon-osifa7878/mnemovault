import { describe, expect, it } from "vitest";
import {
  COMPILE_PIPELINE_VERSION,
  getCompileReason,
  normalizeProcessedFilesRecord,
} from "./processed-files";

describe("normalizeProcessedFilesRecord", () => {
  it("upgrades legacy timestamp entries", () => {
    expect(
      normalizeProcessedFilesRecord({
        "raw/articles/a.txt": "2026-04-13T00:00:00.000Z",
      })
    ).toEqual({
      "raw/articles/a.txt": {
        path: "raw/articles/a.txt",
        sha256: "",
        compiled_at: "2026-04-13T00:00:00.000Z",
        pipeline_version: "",
      },
    });
  });
});

describe("getCompileReason", () => {
  it("returns new when no prior metadata exists", () => {
    expect(getCompileReason("raw/a.txt", "hash-1", {})).toBe("new");
  });

  it("returns content_changed when hash differs or is missing", () => {
    expect(
      getCompileReason("raw/a.txt", "hash-2", {
        "raw/a.txt": {
          path: "raw/a.txt",
          sha256: "hash-1",
          compiled_at: "2026-04-13T00:00:00.000Z",
          pipeline_version: COMPILE_PIPELINE_VERSION,
        },
      })
    ).toBe("content_changed");
  });

  it("returns pipeline_changed when hash matches but pipeline version differs", () => {
    expect(
      getCompileReason("raw/a.txt", "hash-1", {
        "raw/a.txt": {
          path: "raw/a.txt",
          sha256: "hash-1",
          compiled_at: "2026-04-13T00:00:00.000Z",
          pipeline_version: "old-version",
        },
      })
    ).toBe("pipeline_changed");
  });

  it("returns null when file is up to date", () => {
    expect(
      getCompileReason("raw/a.txt", "hash-1", {
        "raw/a.txt": {
          path: "raw/a.txt",
          sha256: "hash-1",
          compiled_at: "2026-04-13T00:00:00.000Z",
          pipeline_version: COMPILE_PIPELINE_VERSION,
        },
      })
    ).toBeNull();
  });
});
