import { act, renderHook } from "@testing-library/react";
import { useSelection } from "../lib/selection";

const key = (k: string) => ({ key: k, preventDefault: () => {} }) as unknown as React.KeyboardEvent;

test("hover previews, pin sticks, and a hover while pinned is shown without moving the pin", () => {
  const { result } = renderHook(() => useSelection(10));
  act(() => result.current.setHover(3));
  expect(result.current.shown).toBe(3);
  act(() => result.current.pin(5));
  act(() => result.current.setHover(7));
  expect(result.current.pinned).toBe(5);
  expect(result.current.shown).toBe(7);
  act(() => result.current.setHover(null));
  expect(result.current.shown).toBe(5);
  act(() => result.current.pin(5));
  expect(result.current.pinned).toBeNull();
});

test("a pinned passage is released by a click on it, by Escape and by unpin, with the hover still shown", () => {
  const { result } = renderHook(() => useSelection(10));
  act(() => result.current.pin(4));
  act(() => result.current.setHover(8));
  act(() => result.current.onKeyDown(key("Escape")));
  expect(result.current.pinned).toBeNull();
  expect(result.current.shown).toBe(8);
  act(() => result.current.pin(2));
  act(() => result.current.unpin());
  expect(result.current.pinned).toBeNull();
  act(() => result.current.pin(6));
  act(() => result.current.pin(6));
  expect(result.current.pinned).toBeNull();
});

test("a click on another passage while one is pinned pins it at once; a click on the pinned one unpins", () => {
  const { result } = renderHook(() => useSelection(10));
  // A mouse moves over a column before it clicks there.
  act(() => {
    result.current.setHover(2);
    result.current.pin(2);
  });
  act(() => {
    result.current.setHover(6);
    result.current.pin(6);
  });
  expect(result.current.pinned).toBe(6);
  expect(result.current.shown).toBe(6);
  act(() => result.current.pin(6));
  expect(result.current.pinned).toBeNull();
});

test("a key step drops the hover, so what is shown follows the keys under a resting mouse", () => {
  const { result } = renderHook(() => useSelection(10));
  act(() => result.current.pin(2));
  act(() => result.current.setHover(7));
  act(() => result.current.onKeyDown(key("ArrowRight")));
  expect(result.current.pinned).toBe(3);
  expect(result.current.shown).toBe(3);
  act(() => result.current.setHover(7));
  act(() => result.current.onKeyDown(key("Escape")));
  expect(result.current.shown).toBe(7);
});

test("keyboard moves the pinned beat and Escape closes", () => {
  const { result } = renderHook(() => useSelection(4));
  act(() => result.current.onKeyDown(key("ArrowRight")));
  expect(result.current.pinned).toBe(0);
  act(() => result.current.onKeyDown(key("End")));
  expect(result.current.pinned).toBe(3);
  act(() => result.current.onKeyDown(key("ArrowRight")));
  expect(result.current.pinned).toBe(3);
  act(() => result.current.onKeyDown(key("Escape")));
  expect(result.current.pinned).toBeNull();
});

test("select sets pinned without toggling, pin toggles", () => {
  const { result } = renderHook(() => useSelection(5));
  act(() => result.current.select(3));
  expect(result.current.pinned).toBe(3);
  act(() => result.current.select(3));
  expect(result.current.pinned).toBe(3);
  act(() => result.current.pin(3));
  expect(result.current.pinned).toBeNull();
});

test("a first ArrowLeft from nothing selects passage 0", () => {
  const { result } = renderHook(() => useSelection(5));
  act(() => result.current.onKeyDown(key("ArrowLeft")));
  expect(result.current.pinned).toBe(0);
});

test("select clamps to the first and the last passage", () => {
  const { result } = renderHook(() => useSelection(5));
  act(() => result.current.select(-3));
  expect(result.current.pinned).toBe(0);
  act(() => result.current.select(9));
  expect(result.current.pinned).toBe(4);
});

test("a tap that unpins also drops the hover a touch screen left behind", () => {
  const { result } = renderHook(() => useSelection(5));
  // A tap arrives as an emulated mouse move, then the click.
  act(() => {
    result.current.setHover(2);
    result.current.pin(2);
  });
  act(() => {
    result.current.setHover(2);
    result.current.pin(2);
  });
  expect(result.current.pinned).toBeNull();
  expect(result.current.shown).toBeNull();
});
