/**
 * @file studio-product-ui.spec.ts
 *
 * Focused UI tests for the Studio product editor.
 * Covers drag-and-drop (sections, section items, image carousel),
 * image management, and cover selection.
 *
 * Tests run serially and share a single seller account + two pre-seeded products.
 * All product/section/image data is inserted directly via the admin API in
 * beforeAll — no UI creation flows. Tests are purely edit → drag → save → verify.
 *
 * COVERAGE
 * ────────
 *  1. Open the product editor, drag section 0 (cards) down 1, save,
 *     re-open, verify the new section order persisted.
 *  2. Open the product editor, change cover to image 1, revert to image 0, save.
 *  3. Navigate to the Studio product list with two pre-seeded products,
 *     drag-reorder them, verify row order changed.
 *  4. Open the product editor (sections now: accordion/cards/two-column/gallery),
 *     drag item 0 → position 1 in each section, save, re-open, verify persistence.
 *  5. Open the product editor, drag carousel thumb-0 down 1, save,
 *     re-open, verify the new image order persisted.
 */

import path from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures/autoCleanup";
import { dragAndDrop } from "./helpers/drag";
import {
  APP_URLS,
  ELEMENT_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
} from "./helpers/constants";
import {
  adminDelete,
  adminInsert,
  createTestUser,
  injectSession,
  SELLER_PERMISSIONS,
  type TestUser,
} from "./helpers/session";
import { createSnapHelper } from "./helpers/snap";

const { snap, resetCounter } = createSnapHelper(
  path.resolve(__dirname, "screenshots/studio-product-ui"),
);

const IMAGE_URLS = [
  "https://picsum.photos/seed/ui-test-1/400/300",
  "https://picsum.photos/seed/ui-test-2/400/300",
  "https://picsum.photos/seed/ui-test-3/400/300",
];

// Two distinct item names per section type.
// Sections are seeded in order: cards(0) accordion(1) two-column(2) gallery(3).
// After test 1 drags cards down 1: accordion(0) cards(1) two-column(2) gallery(3).
const ITEM_NAMES = {
  cards: ["Card Alpha", "Card Beta"] as const,
  accordion: ["FAQ Alpha", "FAQ Beta"] as const,
  twoColumn: ["Row Alpha", "Row Beta"] as const,
  gallery: ["Pic Alpha", "Pic Beta"] as const,
} as const;

test.describe.serial(
  "Studio product UI: drag-drop, images, cover",
  { tag: "@ux" },
  () => {
    let seller: TestUser;
    let productId: string; // main product with sections + images

    // ── Setup / teardown ──────────────────────────────────────────────────────

    test.beforeAll(async () => {
      resetCounter();
      seller = await createTestUser("ui-seller", SELLER_PERMISSIONS);

      // Insert the main product with all 4 section types × 2 items + 3 images.
      // Sections start in the order the drag test expects: cards(0) → gets moved to slot 1.
      const ts = Date.now();
      const main = await adminInsert("products", {
        slug: `ui-main-${ts}`,
        name_en: `UI-Main-${ts}`,
        name_es: `UI-Principal-${ts}`,
        type: "service",
        price: 10_000,
        currency: "COP",
        seller_id: seller.userId,
        sort_order: 0,
        sections: [
          {
            name_en: "Section cards",
            name_es: "Section cards",
            type: "cards",
            sort_order: 0,
            items: [
              {
                title_en: ITEM_NAMES.cards[0],
                title_es: ITEM_NAMES.cards[0],
                description_en: "",
                description_es: "",
                sort_order: 0,
              },
              {
                title_en: ITEM_NAMES.cards[1],
                title_es: ITEM_NAMES.cards[1],
                description_en: "",
                description_es: "",
                sort_order: 1,
              },
            ],
          },
          {
            name_en: "Section accordion",
            name_es: "Section accordion",
            type: "accordion",
            sort_order: 1,
            items: [
              {
                title_en: ITEM_NAMES.accordion[0],
                title_es: ITEM_NAMES.accordion[0],
                description_en: "",
                description_es: "",
                sort_order: 0,
              },
              {
                title_en: ITEM_NAMES.accordion[1],
                title_es: ITEM_NAMES.accordion[1],
                description_en: "",
                description_es: "",
                sort_order: 1,
              },
            ],
          },
          {
            name_en: "Section two-column",
            name_es: "Section two-column",
            type: "two-column",
            sort_order: 2,
            items: [
              {
                title_en: ITEM_NAMES.twoColumn[0],
                title_es: ITEM_NAMES.twoColumn[0],
                description_en: "",
                description_es: "",
                sort_order: 0,
              },
              {
                title_en: ITEM_NAMES.twoColumn[1],
                title_es: ITEM_NAMES.twoColumn[1],
                description_en: "",
                description_es: "",
                sort_order: 1,
              },
            ],
          },
          {
            name_en: "Section gallery",
            name_es: "Section gallery",
            type: "gallery",
            sort_order: 3,
            items: [
              {
                title_en: ITEM_NAMES.gallery[0],
                title_es: ITEM_NAMES.gallery[0],
                description_en: "",
                description_es: "",
                sort_order: 0,
              },
              {
                title_en: ITEM_NAMES.gallery[1],
                title_es: ITEM_NAMES.gallery[1],
                description_en: "",
                description_es: "",
                sort_order: 1,
              },
            ],
          },
        ],
        images: [
          { url: IMAGE_URLS[0], is_cover: true, sort_order: 0 },
          { url: IMAGE_URLS[1], is_cover: false, sort_order: 1 },
          { url: IMAGE_URLS[2], is_cover: false, sort_order: 2 },
        ],
      });
      productId = main.id as string;

      // Insert a second minimal product so the product list has two draggable rows.
      await adminInsert("products", {
        slug: `ui-extra-${ts}`,
        name_en: `UI-Extra-${ts}`,
        name_es: `UI-Extra-${ts}`,
        type: "service",
        price: 5_000,
        currency: "COP",
        seller_id: seller.userId,
        sort_order: 1,
        sections: [],
        images: [],
      });
    });

    test.afterAll(async () => {
      try {
        await adminDelete("products", `seller_id=eq.${seller.userId}`);
      } catch {}
    });

    // ── Helper: locate an item's drag handle within a section ─────────────────
    // Uses [data-rfd-drag-handle-draggable-id], the attribute @hello-pangea/dnd
    // adds exclusively to drag handle elements. This is distinct from
    // InlineRemoveButton which has aria-label but NOT this attribute.
    function itemDragHandle(
      page: Page,
      sectionIndex: number,
      itemIndex: number,
    ) {
      return page
        .getByTestId(`section-${sectionIndex}-item-${itemIndex}`)
        .locator("[data-rfd-drag-handle-draggable-id]")
        .first();
    }

    // ── Test 1: Section drag-reorder + persistence ────────────────────────────

    test("drag section 0 down 1, save, re-open, verify section order persisted", async ({
      context,
      page,
    }: {
      context: BrowserContext;
      page: Page;
    }) => {
      test.setTimeout(120_000);
      await injectSession(context, seller);

      // Open the pre-seeded product in edit mode
      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      // Verify the initial seeded section order: cards(0), accordion(1), two-column(2), gallery(3)
      await expect(page.getByTestId("section-type-0")).toHaveValue("cards");
      await expect(page.getByTestId("section-type-1")).toHaveValue("accordion");
      await expect(page.getByTestId("section-type-2")).toHaveValue(
        "two-column",
      );
      await expect(page.getByTestId("section-type-3")).toHaveValue("gallery");

      await snap(page, "sections-before-reorder");

      // Drag section 0 (cards) down 1 → becomes slot 1; accordion promoted to slot 0
      const sectionHandle0 = page
        .getByTestId("section-card-0")
        .locator("[data-rfd-drag-handle-draggable-id]")
        .first();
      await dragAndDrop(page, sectionHandle0, "down", 1);

      await expect(page.getByTestId("section-type-0")).toHaveValue("accordion");
      await expect(page.getByTestId("section-type-1")).toHaveValue("cards");

      await snap(page, "sections-after-reorder");

      // Save and return to list
      await page.getByTestId("toolbar-save").click();
      await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      // Re-open and verify the new order persisted
      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      await snap(page, "sections-persistence-check");

      await expect(page.getByTestId("section-type-0")).toHaveValue("accordion");
      await expect(page.getByTestId("section-type-1")).toHaveValue("cards");
      await expect(page.getByTestId("section-type-2")).toHaveValue(
        "two-column",
      );
      await expect(page.getByTestId("section-type-3")).toHaveValue("gallery");
    });

    // ── Test 2: Cover management ──────────────────────────────────────────────

    test("change cover to image 1, revert to image 0, save", async ({
      context,
      page,
    }: {
      context: BrowserContext;
      page: Page;
    }) => {
      test.setTimeout(60_000);
      await injectSession(context, seller);

      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      // Scope to desktop gallery to avoid strict-mode collision with mobile gallery
      const gallery = page.getByTestId("image-gallery-thumbs");

      // Verify the 3 pre-seeded images are present
      for (let i = 0; i < 3; i++) {
        await gallery
          .getByTestId(`image-thumb-${i}`)
          .waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
      }

      // Image 0 is seeded as is_cover=true; image 1 is false
      await expect(gallery.getByTestId("image-thumb-cover-0")).toHaveAttribute(
        "data-cover",
        "true",
      );
      await expect(gallery.getByTestId("image-thumb-cover-1")).toHaveAttribute(
        "data-cover",
        "false",
      );

      // Change cover to image 1
      await gallery.getByTestId("image-thumb-cover-1").click();
      await snap(page, "cover-changed-to-1");

      await expect(gallery.getByTestId("image-thumb-cover-1")).toHaveAttribute(
        "data-cover",
        "true",
      );
      await expect(gallery.getByTestId("image-thumb-cover-0")).toHaveAttribute(
        "data-cover",
        "false",
      );

      // Revert cover back to image 0
      await gallery.getByTestId("image-thumb-cover-0").click();
      await snap(page, "cover-reverted-to-0");

      await expect(gallery.getByTestId("image-thumb-cover-0")).toHaveAttribute(
        "data-cover",
        "true",
      );
      await expect(gallery.getByTestId("image-thumb-cover-1")).toHaveAttribute(
        "data-cover",
        "false",
      );

      await page.getByTestId("toolbar-save").click();
      await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await snap(page, "cover-saved");
    });

    // ── Test 3: Product list drag-reorder ─────────────────────────────────────

    test("drag-reorder two products in the Studio product list", async ({
      context,
      page,
    }: {
      context: BrowserContext;
      page: Page;
    }) => {
      test.setTimeout(60_000);
      await injectSession(context, seller);

      await page.goto(`${APP_URLS.STUDIO}/en`);

      const rows = page.locator(`[data-testid^="product-row-"]`);
      await rows
        .first()
        .waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });

      const firstRowId = await rows.first().getAttribute("data-testid");
      const secondRowId = await rows.nth(1).getAttribute("data-testid");

      await snap(page, "product-list-before-reorder");

      const handle = rows
        .first()
        .locator("[data-rfd-drag-handle-draggable-id]")
        .first();
      await dragAndDrop(page, handle, "down", 1);
      await snap(page, "product-list-after-reorder");

      const newFirstRowId = await rows.first().getAttribute("data-testid");
      const newSecondRowId = await rows.nth(1).getAttribute("data-testid");

      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(newFirstRowId).toBe(secondRowId);
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(newSecondRowId).toBe(firstRowId);
    });

    // ── Test 4: Item drag-reorder within each section + persistence ───────────
    //
    // Section layout after test 1 save (accordion promoted to slot 0):
    //   slot 0 → accordion  [FAQ Alpha,  FAQ Beta]   vertical droppable
    //   slot 1 → cards      [Card Alpha, Card Beta]  horizontal droppable
    //   slot 2 → two-column [Row Alpha,  Row Beta]   vertical droppable
    //   slot 3 → gallery    [Pic Alpha,  Pic Beta]   vertical droppable
    //
    // Drag each section's item 0 to position 1; expected after save + re-open:
    //   slot 0 → [FAQ Beta,  FAQ Alpha]
    //   slot 1 → [Card Beta, Card Alpha]
    //   slot 2 → [Row Beta,  Row Alpha]
    //   slot 3 → [Pic Beta,  Pic Alpha]

    test("drag-reorder items within each section, save, re-open, verify persistence", async ({
      context,
      page,
    }: {
      context: BrowserContext;
      page: Page;
    }) => {
      test.setTimeout(120_000);
      await injectSession(context, seller);

      // ── Phase 1: open editor, confirm current order, drag-reorder ─────────────

      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      // Post-test-1 section layout: accordion(0), cards(1), two-column(2), gallery(3)
      await expect(page.getByTestId("section-item-title-0-0")).toHaveValue(
        ITEM_NAMES.accordion[0],
      );
      await expect(page.getByTestId("section-item-title-0-1")).toHaveValue(
        ITEM_NAMES.accordion[1],
      );
      await expect(page.getByTestId("section-item-title-1-0")).toHaveValue(
        ITEM_NAMES.cards[0],
      );
      await expect(page.getByTestId("section-item-title-1-1")).toHaveValue(
        ITEM_NAMES.cards[1],
      );
      await expect(page.getByTestId("section-item-title-2-0")).toHaveValue(
        ITEM_NAMES.twoColumn[0],
      );
      await expect(page.getByTestId("section-item-title-2-1")).toHaveValue(
        ITEM_NAMES.twoColumn[1],
      );
      await expect(page.getByTestId("section-item-title-3-0")).toHaveValue(
        ITEM_NAMES.gallery[0],
      );
      await expect(page.getByTestId("section-item-title-3-1")).toHaveValue(
        ITEM_NAMES.gallery[1],
      );

      await snap(page, "section-items-before-reorder");

      // Accordion (slot 0) — vertical droppable: move item 0 → position 1
      await dragAndDrop(page, itemDragHandle(page, 0, 0), "down", 1);

      // Cards (slot 1) — horizontal droppable: move item 0 → position 1
      await dragAndDrop(page, itemDragHandle(page, 1, 0), "right", 1);

      // Two-column (slot 2) — vertical droppable: move item 0 → position 1
      await dragAndDrop(page, itemDragHandle(page, 2, 0), "down", 1);

      // Gallery (slot 3) — vertical droppable: move item 0 → position 1
      await dragAndDrop(page, itemDragHandle(page, 3, 0), "down", 1);

      await snap(page, "section-items-after-reorder");

      // Verify new order in the live UI immediately after drag
      await expect(page.getByTestId("section-item-title-0-0")).toHaveValue(
        ITEM_NAMES.accordion[1],
      );
      await expect(page.getByTestId("section-item-title-0-1")).toHaveValue(
        ITEM_NAMES.accordion[0],
      );
      await expect(page.getByTestId("section-item-title-1-0")).toHaveValue(
        ITEM_NAMES.cards[1],
      );
      await expect(page.getByTestId("section-item-title-1-1")).toHaveValue(
        ITEM_NAMES.cards[0],
      );
      await expect(page.getByTestId("section-item-title-2-0")).toHaveValue(
        ITEM_NAMES.twoColumn[1],
      );
      await expect(page.getByTestId("section-item-title-2-1")).toHaveValue(
        ITEM_NAMES.twoColumn[0],
      );
      await expect(page.getByTestId("section-item-title-3-0")).toHaveValue(
        ITEM_NAMES.gallery[1],
      );
      await expect(page.getByTestId("section-item-title-3-1")).toHaveValue(
        ITEM_NAMES.gallery[0],
      );

      // Save and return to list
      await page.getByTestId("toolbar-save").click();
      await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await snap(page, "section-items-saved");

      // ── Phase 2: re-open and verify the order persisted ───────────────────────

      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      await snap(page, "section-items-persistence-check");

      await expect(page.getByTestId("section-item-title-0-0")).toHaveValue(
        ITEM_NAMES.accordion[1],
      );
      await expect(page.getByTestId("section-item-title-0-1")).toHaveValue(
        ITEM_NAMES.accordion[0],
      );
      await expect(page.getByTestId("section-item-title-1-0")).toHaveValue(
        ITEM_NAMES.cards[1],
      );
      await expect(page.getByTestId("section-item-title-1-1")).toHaveValue(
        ITEM_NAMES.cards[0],
      );
      await expect(page.getByTestId("section-item-title-2-0")).toHaveValue(
        ITEM_NAMES.twoColumn[1],
      );
      await expect(page.getByTestId("section-item-title-2-1")).toHaveValue(
        ITEM_NAMES.twoColumn[0],
      );
      await expect(page.getByTestId("section-item-title-3-0")).toHaveValue(
        ITEM_NAMES.gallery[1],
      );
      await expect(page.getByTestId("section-item-title-3-1")).toHaveValue(
        ITEM_NAMES.gallery[0],
      );
    });

    // ── Test 5: Image carousel drag-reorder + persistence ────────────────────
    //
    // Pre-seeded carousel order: [URL[0], URL[1], URL[2]].
    // Drag thumb-0 down 1 → new order: [URL[1], URL[0], URL[2]].
    // Verify by comparing img src before/after drag and after save + re-open.

    test("drag-reorder image carousel, save, re-open, verify persistence", async ({
      context,
      page,
    }: {
      context: BrowserContext;
      page: Page;
    }) => {
      test.setTimeout(120_000);
      await injectSession(context, seller);

      // ── Phase 1: open editor, capture initial srcs, drag-reorder ─────────────

      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      const gallery = page.getByTestId("image-gallery-thumbs");

      for (let i = 0; i < 3; i++) {
        await gallery
          .getByTestId(`image-thumb-${i}`)
          .waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
      }

      // Capture the current img src of the first two thumbnails before dragging
      const thumb0 = gallery.getByTestId("image-thumb-0");
      const thumb1 = gallery.getByTestId("image-thumb-1");

      const srcBefore0 = await thumb0
        .locator("img")
        .first()
        .getAttribute("src");
      const srcBefore1 = await thumb1
        .locator("img")
        .first()
        .getAttribute("src");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(srcBefore0).not.toBe(srcBefore1); // sanity: different images

      await snap(page, "carousel-before-reorder");

      // Drag thumb-0 down 1 (image carousel is a vertical droppable)
      const thumbHandle = thumb0
        .locator("[data-rfd-drag-handle-draggable-id]")
        .first();
      await dragAndDrop(page, thumbHandle, "down", 1);

      await snap(page, "carousel-after-reorder");

      // Verify the swap in the live UI: position 0 now shows what was at position 1
      const srcAfter0 = await gallery
        .getByTestId("image-thumb-0")
        .locator("img")
        .first()
        .getAttribute("src");
      const srcAfter1 = await gallery
        .getByTestId("image-thumb-1")
        .locator("img")
        .first()
        .getAttribute("src");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(srcAfter0).toBe(srcBefore1);
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(srcAfter1).toBe(srcBefore0);

      // Save and return to list
      await page.getByTestId("toolbar-save").click();
      await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await snap(page, "carousel-saved");

      // ── Phase 2: re-open and verify the order persisted ───────────────────────

      await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}`);

      const galleryReload = page.getByTestId("image-gallery-thumbs");
      // Reading src attributes below is a one-shot read, so the gallery has to
      // be there first. Waiting for it replaces both a settle wait and a fixed
      // sleep, and says what it is waiting for.
      await expect(galleryReload).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

      await snap(page, "carousel-persistence-check");

      const srcReload0 = await galleryReload
        .getByTestId("image-thumb-0")
        .locator("img")
        .first()
        .getAttribute("src");
      const srcReload1 = await galleryReload
        .getByTestId("image-thumb-1")
        .locator("img")
        .first()
        .getAttribute("src");

      // After reload, position 0 should still show the image that was originally at position 1
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(srcReload0).toBe(srcBefore1);
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(srcReload1).toBe(srcBefore0);
    });
  },
);
