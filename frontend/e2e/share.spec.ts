import { expect, test, type Page } from "@playwright/test";
const NOVEL = Array.from(
  { length: 6 },
  (_, i) =>
    `CHAPTER ${i + 1}\n\n` + "The lamps were lit and the river ran on toward the sea. ".repeat(90),
).join("\n\n");

// The visitor's view of a link: its first heading, once the page has settled.
async function visit(page: Page, url: string) {
  await page.goto(url);
  return page.getByRole("heading", { level: 1 });
}

test("the share round trip: owner and visitor in separate browsers", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  owner.on("dialog", (d) => d.accept());
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  const asked: string[] = [];
  visitor.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/")) asked.push(path);
  });

  await owner.goto("/import");
  await owner.getByLabel("paste text").fill(NOVEL);
  await owner.getByRole("button", { name: "Preview" }).click();
  await owner.getByLabel("TypeSafe API key").fill("sk-synthetic-1234567890");
  await owner.getByRole("button", { name: "Analyze" }).click();
  await expect(owner).toHaveURL(/\/works\//);
  await expect(owner.getByRole("heading", { name: "Chapters" })).toBeVisible({ timeout: 60_000 });
  // Not kept: no share offered.
  await expect(owner.getByText(/^Private, and deleted in .* unless you keep it\.$/)).toBeVisible();
  await expect(owner.getByRole("button", { name: "Share link" })).toHaveCount(0);

  await owner.getByRole("button", { name: "Keep" }).click();
  await owner.getByRole("button", { name: "Share link" }).click();
  const field = owner.getByRole("textbox", { name: "Share link" });
  const link = await field.inputValue();
  expect(link).toMatch(/\/shared\/[\w-]{22}$/);

  // A visitor without the owner's session sees the chart, chapters and shape, never the text.
  await expect(await visit(visitor, link)).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Chapters" })).toBeVisible();
  await expect(visitor.locator("path[data-layer=fortune]")).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Analyze your own book" })).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: /Keep|Share|Export|Poster|Delete/ }),
  ).toHaveCount(0);
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "Chapters" })).toBeVisible();
  expect(new Set(asked)).toEqual(new Set([`/api/shared/${link.split("/shared/")[1]}`]));

  // The work's own address is no key: the visitor gets nothing from it.
  await expect(await visit(visitor, owner.url())).toHaveText("Could not load this work");
  asked.length = 0;

  // The owner's reload shows the same live link.
  await owner.reload();
  await expect(field).toHaveValue(link);

  // Stop sharing: the old link is dead; sharing again makes a new one and the old stays dead.
  await owner.getByRole("button", { name: "Stop sharing" }).click();
  await expect(await visit(visitor, link)).toHaveText("This link no longer works");
  await owner.getByRole("button", { name: "Share link" }).click();
  const second = await field.inputValue();
  expect(second).not.toBe(link);
  await expect(await visit(visitor, link)).toHaveText("This link no longer works");
  await expect(visitor.getByRole("heading", { name: "Chapters" })).toHaveCount(0);
  await expect(await visit(visitor, second)).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Chapters" })).toBeVisible();

  // Deleting the work kills its link.
  await owner.getByRole("button", { name: "Delete" }).click();
  await expect(owner).toHaveURL(/\/my$/);
  await expect(await visit(visitor, second)).toHaveText("This link no longer works");
  await visitorContext.close();
});
