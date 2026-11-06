import assert from 'node:assert/strict';
import test from 'node:test';
import { PDF_DETAIL_PIXELS, pdfDetailCovers, pdfDetailPlan, visiblePdfRegion } from '../src/domain/pdf-detail';

test('an enlarged page uses the viewport detail budget, rather than reducing the whole page resolution', () => {
  const page = { width: 2500, height: 3536 }, visible = { left: 400, top: 900, width: 1000, height: 700 };
  const plan = pdfDetailPlan(page, visible, 1.25)!;
  assert.ok(Math.sqrt(8_000_000 / (page.width * page.height)) < 1, 'The bounded whole-page bitmap can be below screen resolution');
  assert.equal(plan.scale, 2); assert.ok(plan.pixelWidth * plan.pixelHeight <= PDF_DETAIL_PIXELS);
  assert.ok(pdfDetailCovers(plan, visible, 2));
  assert.ok(pdfDetailCovers(plan, { ...visible, top: visible.top + 50 }, 2), 'Small scrolls reuse the existing detail margin');
  assert.equal(pdfDetailCovers(plan, { ...visible, top: visible.top + 300 }, 2), false);
  assert.equal(pdfDetailCovers(plan, visible, 3), false, 'A higher-density monitor requires a fresh detail tile');
});

test('offscreen pages have no detail allocation; horizontal scroll and page edges clip safely', () => {
  const page = { width: 2000, height: 3000 };
  assert.equal(pdfDetailPlan(page, { left: -300, top: -500, width: 200, height: 200 }, 2), null);
  assert.deepEqual(visiblePdfRegion(page, { left: 1900, top: 2800, width: 600, height: 800 }), { left: 1900, top: 2800, width: 100, height: 200 });
  const plan = pdfDetailPlan(page, { left: 1900, top: 2800, width: 600, height: 800 }, 2)!;
  assert.ok(plan.left >= 0 && plan.top >= 0 && plan.left + plan.width <= page.width && plan.top + plan.height <= page.height);
  assert.equal(pdfDetailCovers(null, plan, 2), false);
});

test('detail buffers remain bounded on enormous pages and high-density displays', () => {
  for (const ratio of [1, 1.25, 1.5, 2, 3, 8, NaN]) for (const size of [600, 1500, 50000]) {
    const plan = pdfDetailPlan({ width: 100000, height: 100000 }, { left: 200, top: 500, width: size, height: size }, ratio)!;
    assert.ok(plan.pixelWidth > 0 && plan.pixelHeight > 0 && plan.pixelWidth * plan.pixelHeight <= PDF_DETAIL_PIXELS);
    assert.ok(plan.scale > 0 && plan.scale <= 3);
  }
  assert.equal(pdfDetailPlan({ width: Infinity, height: 100 }, { left: 0, top: 0, width: 100, height: 100 }, 1), null);
  const narrow = pdfDetailPlan({ width: 1, height: 1e12 }, { left: 0, top: 0, width: 1, height: 1e12 }, 3)!;
  assert.ok(narrow.pixelWidth * narrow.pixelHeight <= PDF_DETAIL_PIXELS, 'Even an exceptionally long one-pixel-wide page cannot escape the pixel budget');
});
