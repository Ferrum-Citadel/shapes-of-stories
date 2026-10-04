import questionsJson from "../../public/questions.json?raw";
import aboutSource from "../pages/About.tsx?raw";
import { BINS } from "../lib/bins";
import { MODE_CONFIDENCE, SCORE_MAX } from "../lib/layers";
import {
  HOW_TO_READ,
  SHAPE_CARD_NOTE,
  SHAPE_LEANS_R,
  SHAPE_MARGIN,
  SHAPE_NAMED_R,
} from "../lib/definitions";

// Generated from the backend by `app.cli questions-json`.
const generated = JSON.parse(questionsJson).constants;

test("every copied backend value equals the generated one", () => {
  expect({ BINS, SCORE_MAX, MODE_CONFIDENCE, SHAPE_NAMED_R, SHAPE_LEANS_R, SHAPE_MARGIN }).toEqual({
    BINS: generated.bins,
    SCORE_MAX: generated.score_max,
    MODE_CONFIDENCE: generated.mode_confidence,
    SHAPE_NAMED_R: generated.shape_named_r,
    SHAPE_LEANS_R: generated.shape_leans_r,
    SHAPE_MARGIN: generated.shape_margin,
  });
});

test("the copy quotes the generated numbers", () => {
  for (const text of [SHAPE_CARD_NOTE, HOW_TO_READ[1].more]) {
    expect(text).toContain(generated.shape_named_r.toFixed(2));
    expect(text).toContain(generated.shape_leans_r.toFixed(2));
  }
  for (const text of [HOW_TO_READ[0].text, aboutSource])
    expect(text).toContain(`${generated.passage_words} words`);
  for (const text of [HOW_TO_READ[0].more, aboutSource])
    expect(text).toContain(`0 to ${generated.score_max}`);
});
