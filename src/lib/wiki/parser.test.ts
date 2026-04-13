import { describe, expect, it } from "vitest";
import { buildGraphData, parseEvidenceBlock, parseWikiPage } from "./parser";

describe("parseEvidenceBlock", () => {
  it("extracts evidence payload from machine-readable blocks", () => {
    const raw = `---
title: "Source"
type: "source"
created: "2026-04-13"
updated: "2026-04-13"
---

# Source

\`\`\`mnemovault-evidence
{"claims":[{"text":"A","page_name":"Source","evidence_type":"EXTRACTED","confidence":1,"source_ref":"a.txt"}],"edges":[{"source_page":"Source","target_page":"Concept X","relation":"describes","evidence_type":"INFERRED","confidence":0.5,"source_ref":"a.txt"}]}
\`\`\`
`;

    expect(parseEvidenceBlock(raw)).toEqual({
      claims: [
        {
          text: "A",
          page_name: "Source",
          evidence_type: "EXTRACTED",
          confidence: 1,
          source_ref: "a.txt",
        },
      ],
      edges: [
        {
          source_page: "Source",
          target_page: "Concept X",
          relation: "describes",
          evidence_type: "INFERRED",
          confidence: 0.5,
          source_ref: "a.txt",
        },
      ],
    });
  });
});

describe("buildGraphData", () => {
  it("preserves wikilinks and upgrades edges with evidence metadata", () => {
    const source = parseWikiPage(
      "source.md",
      `---
title: "Source"
type: "source"
created: "2026-04-13"
updated: "2026-04-13"
---

Links to [[Concept X]].

\`\`\`mnemovault-evidence
{"claims":[],"edges":[{"source_page":"Source","target_page":"Concept X","relation":"describes","evidence_type":"EXTRACTED","confidence":0.9,"source_ref":"a.txt :: intro"}]}
\`\`\`
`
    );
    const concept = parseWikiPage(
      "concept-x.md",
      `---
title: "Concept X"
type: "concept"
created: "2026-04-13"
updated: "2026-04-13"
---

# Concept X
`
    );

    const graph = buildGraphData([source, concept]);
    expect(graph.edges).toEqual([
      {
        source: "source",
        target: "concept-x",
        relation: "describes",
        evidenceType: "EXTRACTED",
        confidence: 0.9,
        sourceRef: "a.txt :: intro",
      },
    ]);
  });
});
