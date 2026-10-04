import { test, expect, type Page } from "@playwright/test";

// Where the first element a selector finds starts, from the top of the window.
const top = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);

test("hovering event glyphs never changes the page height", async ({ page }) => {
  await page.goto("/gallery/great-expectations");
  await page.evaluate(() => localStorage.setItem("sos.seen.gallery.great-expectations", "1"));
  await page.reload();
  const hits = page.locator("rect[data-hit]");
  await hits.first().waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  const n = Math.min(await hits.count(), 12);
  for (let i = 0; i < n; i++) {
    await hits.nth(i).hover({ force: true });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
    await page.mouse.move(5, 5);
  }
});

test("a pinned passage survives scrolling and the scroll position stays", async ({ page }) => {
  await page.goto("/gallery/great-expectations");
  await page.locator("[data-overlay]").click();
  await expect(page.getByRole("region", { name: "Passage" })).toBeVisible();
  // The book's text is fetched on this first pin, so its paragraphs arrive a moment after the drawer.
  await expect(
    page.getByRole("region", { name: "Passage" }).getByRole("paragraph").first(),
  ).toHaveText(/\w{3}/);
  // The page glides to the passage first; a wheel turned during that glide is lost.
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY);
      const still = y === last;
      last = y;
      return still;
    })
    .toBe(true);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await expect(page.getByRole("region", { name: "Passage" })).toBeAttached();
});

test("the wall shows, the opening plays on a first visit and not on a return", async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/every story has a shape/i);
  // The opening needs a shape to sketch, so take a work that has one rather than trust a title to keep it through a rebuild.
  const index: { slug: string; archetype: { state: string } }[] = await (
    await page.request.get("/gallery/index.json")
  ).json();
  const slug = index.find((e) => e.archetype.state === "named")!.slug;
  await page.goto(`/gallery/${slug}`);
  const line = page.locator("path[data-layer=fortune]");
  await expect(line).toHaveAttribute("style", /stroke-dasharray/);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), `sos.seen.gallery.${slug}`), {
      timeout: 5000,
    })
    .toBe("1");
  await page.reload();
  await line.waitFor();
  await expect(line).not.toHaveAttribute("style", /stroke-dasharray/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  async function openWork(page: Page) {
    await page.goto("/gallery/great-expectations");
    await page.evaluate(() => localStorage.setItem("sos.seen.gallery.great-expectations", "1"));
    await page.reload();
    await page.locator("rect[data-hit]").first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
  }
  const tapChart = async (page: Page) => {
    const box = (await page.locator("[data-overlay]").boundingBox())!;
    await page
      .locator("[data-overlay]")
      .tap({ position: { x: box.width * 0.42, y: box.height / 2 } });
    await page.getByRole("region", { name: "Passage" }).waitFor();
  };

  test("the chart comes before the layers, and a tapped passage opens where it can be seen", async ({
    page,
  }) => {
    await openWork(page);
    expect(await top(page, "[data-overlay]")).toBeLessThan(
      await top(page, "[role=group][aria-label='Feeling layers']"),
    );
    expect(await top(page, "[data-overlay]")).toBeLessThan(844);
    await tapChart(page);
    const later = page
      .getByRole("region", { name: "Passage" })
      .getByRole("button", { name: /later/ });
    await expect
      .poll(() =>
        later.evaluate((b) => {
          const r = b.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight;
        }),
      )
      .toBe(true);
  });

  test("gallery, work, drawer and chapters hold together at 390 px", async ({ page }) => {
    await page.goto("/gallery");
    const plates = page.locator("main section ul > li > a[href^='/gallery/']");
    await plates.first().waitFor();
    const lefts = await plates.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );
    expect(lefts.length).toBeGreaterThan(3);
    expect(new Set(lefts).size).toBe(1);
    await openWork(page);
    expect(await top(page, "[data-overlay]")).toBeLessThan(
      await top(page, "h2:text-is('Chapters')"),
    );
    await tapChart(page);
    await expect(
      page.getByRole("region", { name: "Passage" }).getByRole("paragraph").first(),
    ).toHaveText(/\w{3}/);
    const rows = page.getByRole("list", { name: "Chapters" }).getByRole("listitem");
    const n = await rows.count();
    expect(n).toBeGreaterThan(1);
    const widths = await rows.evaluateAll((els) =>
      els.map((li) => {
        const bar = li.querySelector("[role=img]");
        return bar && bar.getAttribute("aria-label") !== "no writing measured"
          ? bar.getBoundingClientRect().width
          : 0;
      }),
    );
    expect(widths.filter((w) => w > 0)).toHaveLength(n);
  });

  test("every button, link and field on a work page is at least 40 px on its shorter side, hit areas included", async ({
    page,
  }) => {
    await openWork(page);
    await tapChart(page);
    const small = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, input:not([type=hidden]), select, textarea, label:has(> input.sr-only)",
        ),
      ].filter(
        (el) =>
          !el.closest(".sr-only") &&
          !el.matches("input.sr-only") &&
          el.getBoundingClientRect().width > 0,
      );
      // A positioned element's ::after, when there is one, widens what a finger can hit.
      const hit = (el: HTMLElement) => {
        const r = el.getBoundingClientRect(),
          a = getComputedStyle(el, "::after"),
          px = (v: string) => (v.endsWith("px") ? parseFloat(v) : 0);
        if (
          a.content === "none" ||
          a.position !== "absolute" ||
          getComputedStyle(el).position === "static"
        )
          return [r.width, r.height];
        return [
          Math.max(r.width, r.width - px(a.left) - px(a.right)),
          Math.max(r.height, r.height - px(a.top) - px(a.bottom)),
        ];
      };
      return targets
        .map((el) => ({ el, size: hit(el) }))
        .filter(({ size }) => Math.min(...size) < 40 - 0.5)
        .map(
          ({ el, size }) =>
            `${el.tagName} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${size.map(Math.round).join("x")}`,
        );
    });
    expect(small).toEqual([]);
  });

  test("tapping a question near the right edge of a short page opens it where it is, without moving the page", async ({
    page,
  }) => {
    await page.goto("/compare?a=gallery:great-expectations&b=gallery:jane-eyre");
    await page.locator("main svg[role=img]").first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const q = page.getByRole("button", { name: "What the match means" }).first();
    await q.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await q.tap();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => scrollY)).toBe(before);
  });

  test("no popover makes the page scroll sideways, on a phone or a tablet", async ({ page }) => {
    await openWork(page);
    await tapChart(page);
    const check = async () => {
      const questions = page.locator(
        "main button[aria-label^='What '], main button[aria-label^='About ']",
      );
      let opened = 0;
      for (let i = 0; i < (await questions.count()); i++) {
        const q = questions.nth(i);
        if (!(await q.isVisible())) continue;
        await q.scrollIntoViewIfNeeded();
        await q.tap();
        opened++;
        const panel = page.locator(`[id="${await q.getAttribute("aria-controls")}"]`);
        const [left, right, page_, scroll] = await panel.evaluate((p) => [
          p.getBoundingClientRect().left,
          p.getBoundingClientRect().right,
          document.documentElement.clientWidth,
          document.documentElement.scrollWidth,
        ]);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(page_);
        expect(scroll).toBeLessThanOrEqual(page_);
        await page.locator("h1").tap();
      }
      return opened;
    };
    expect(await check()).toBeGreaterThanOrEqual(2);
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(await check()).toBeGreaterThanOrEqual(4);
  });
});

test("the event ribbon is one tab stop; arrows move along it and Enter opens the passage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/gallery/great-expectations");
  await page.evaluate(() => localStorage.setItem("sos.seen.gallery.great-expectations", "1"));
  await page.reload();
  const ribbon = page.locator("svg[role=listbox][aria-label^='Story events']");
  await ribbon.waitFor();
  for (let i = 0; i < 80 && !(await ribbon.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press("Tab");
  await expect(ribbon).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(ribbon).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Passage" })).toBeVisible();
});

test("the theme button cycles dark, light and system, and the choice outlives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/gallery");
  const theme = page.getByRole("button", { name: /^Theme: / });
  await expect(theme).toHaveAccessibleName("Theme: dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(theme).toHaveAccessibleName("Theme: system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.click();
  await expect(theme).toHaveAccessibleName("Theme: dark");
  expect(await page.evaluate(() => localStorage.getItem("sos.theme"))).toBeNull();
});
