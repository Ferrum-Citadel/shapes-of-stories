import { makeSlicer, paragraphsOf } from "../lib/text";

// The same passages are checked against the server's beat_paragraph_spans in backend/tests/test_pipeline.py.
const THREE = "Alpha one. Alpha two.\n\nBeta one. Beta two.\n\nGamma one. Gamma two.";

test("a passage starting inside a paragraph counts its piece as paragraph 0", () => {
  const start = THREE.indexOf("Alpha two.");
  const end = THREE.indexOf("Beta two.") + "Beta two.".length;
  expect(paragraphsOf(makeSlicer(THREE), start, end)).toEqual([
    "Alpha two.",
    "Beta one. Beta two.",
  ]);
});

test("a passage ending inside a paragraph keeps its last piece", () => {
  const start = THREE.indexOf("Beta one.");
  const end = THREE.indexOf("Gamma one.") + "Gamma one.".length;
  expect(paragraphsOf(makeSlicer(THREE), start, end)).toEqual([
    "Beta one. Beta two.",
    "Gamma one.",
  ]);
});
