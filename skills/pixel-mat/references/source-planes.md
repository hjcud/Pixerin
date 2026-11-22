# Experimental source sampling planes

Use this route only for a requested **new whole-character composition**, not a
bounded edit of accepted artwork. The CLI makes no model calls. The host generates
and inspects a simplified flat draft from the original reference, then chooses
actual source sampling lines. It must not ask the user to draw feature regions.

## Procedure

1. Inspect identity, age, expression, facing and gaze separately. Budget head,
   body, hands, props, feet and empty spaces together. A flat draft may deliberately
   change proportions; disclose that change. Keep the untouched original.
2. Generate one transparent square flat-shape draft using the authorized host
   image tool. Preserve important relationships, not every decoration. Inspect
   actual transparency and expression. A prompt requesting flat colors or a
   pixel grid does not prove either constraint was met.
3. Write the local context:

   ```text
   node scripts/pixel-mat.mjs analysis-context --method planes --input flat.png --width 16 --height 16 --output planes-context.json
   ```

4. Inspect the full-resolution draft. Write the context's response schema to
   `planes.json`, echoing its source hash. Each x/y anchor reserves a single
   native column/row. Positions are normalized against the **full** source,
   strictly between 0 and 1. To target raster pixel `(x, y)`, use pixel centers
   `(x + 0.5) / sourceWidth` and `(y + 0.5) / sourceHeight`; positions exactly
   on a cell boundary are vulnerable to floating-point/edge ambiguity.
   Use actual common slices through features that
   intersect: two eyes need not consume two rows. Reserve skin separation,
   headwear and prop contacts as well as marks. Lower-priority features may be
   omitted; record omissions instead of crowding the face. `preserveTransparent`
   protects genuinely transparent source samples along that line, not skin,
   whites, or shadows.
   Verify actual source RGBA at the selected intersections before assigning
   semantic labels. A nearby mouth border can be dark while the intended lip
   is pink; a supposed skin slice can cross a freckle. Labels alone cannot
   establish what was sampled. Palette fitting can also merge an identifying
   color, so inspect the final indexed color and whole-character palette cost.
5. Render, then preview at 1x and integer zoom:

   ```text
   node scripts/pixel-mat.mjs prepare --method planes --input flat.png --context planes-context.json --plan planes.json --width 16 --height 16 --colors 16 --output candidate.pixeltool
   node scripts/pixel-mat.mjs preview --input candidate.pixeltool --scale 16 --output candidate.png
   ```

6. Compare original, ordinary sampling and this candidate. Inspect expression,
   pupil direction, skin gaps, continuous props, grips, limbs and feet. Keep a
   worse candidate as rejected evidence. Sparse repairs must use the existing
   bounded `review-context`/`refine` route; do not enlarge its writable scope.

The same commands accept a 32x32 target. The current implementation requires a
square source, one frame, `--fit frame`, and the default alpha threshold 128.
Other conversion methods retain their existing contracts. `--palette` may pin
an existing palette, but actually used colors must fit the requested total RGBA
budget. No app default or GUI option is changed by this standalone experiment.

## Plan example

```json
{
  "format": "pixel-mat-sampling-planes",
  "version": 1,
  "sourceHash": "COPY_FROM_CONTEXT",
  "width": 16,
  "height": 16,
  "summary": "Reserve source eye, cheek and mouth separation",
  "x": [{"position": 0.5, "role": "face center", "weight": 2, "preserveTransparent": false}],
  "y": [],
  "omissions": ["Fine fabric seams"]
}
```

The values above illustrate syntax, not a usable character plan. Anchor weights
are 0.1–4; roles describe visible source evidence. Keep fewer anchors than native
cells. Infeasible plans are rejected, never fitted by silently raising limits.

## Guarantees and limits

Ordered dynamic programming assigns distinct native lines with bounded source
displacement (2.75 native units at 16px, 1.25 at 32px). Monotone interpolation
prevents a folded grid. Exact source samples provide colors; missed alpha cells
can be added only from majority source coverage or a connected two-edge crossing
with at least 12.5% coverage. Explicit transparent lines take priority. The
shared converter fits the final palette without dithering. These are geometry
and format guarantees, not face recognition or artwork scores.

This bends the complete source grid and can change proportions. It **does not**
meet the original uniform-source-cell support rule used by protected repairs.
It writes a new project, never modifies a manual document, and grants no
exception to layer, selection, palette, detail or alpha protections.

The November 2026 study used three existing references and one new baker.
The baker reused a frozen renderer but needed several host-authored planning
revisions. Results improved readability, especially at 32px; 16px identity and
expression remain insufficient for a general quality claim. Source planning is
not a validated autonomous app pipeline. Omitted features and changed
proportions must remain visible in the report.

A subsequent balanced-native-layout trial produced better body proportions in
some 32px drafts, but the image model still painted finer features than requested.
Actual 16px conversions failed again. Global source planes also distorted bodies;
face-only research proposals preserved body pixels but did not consistently
restore expression. They were normal initial proposals on new assets, not bounded
review patches. Do not bypass a native-review budget to replay them. No new
automatic planner or default conversion was approved from those trials.
