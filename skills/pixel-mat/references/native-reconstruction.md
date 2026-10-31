# Reference-guided native reconstruction

Use this when a detailed raster conversion or text-to-grid draft loses its
identifying shapes. Keep the requested resolution. More colors or a larger canvas
do not demonstrate that a 32px design has been repaired.

This workflow is a local repair within the existing layout. If a face or hand
cannot fit without moving major structures, use the separately authorized
[native design workflow](native-design.md) for a new asset instead of expanding
the repair limit.

View the reference and draft at native size and an integer zoom. Identify a few
specific failures, such as a missing iris, merged muzzle, incorrect pose, broken
silhouette or joined limbs. Reserve whole cells for useful features and their
negative spaces. For faces, compare the gaze, brow/mouth relationship and skin
spacing together. Removing an oversized mark may work better than adding an eye
white or an explicit mouth. Preserve body proportions during a local repair;
do not turn it into an enlarged-head redesign. Compare the complete subject;
do not guess coordinates from an enlarged screenshot. Read the native rows and
immutable segment table in `review-context`.

Write a short review with `decision`, `summary`, `findings` and `patch` using the
schema in the context and [cli.md](cli.md). Use only the current palette. Change
coherent local clusters while preserving identity, composition, unrequested
parts and all edit protections. Do not spread single-pixel noise to increase
detail. A deliberate eye/glint can be a single pixel; do not delete it merely
because it is isolated. `keep` must contain an empty patch. An attempted repair
cannot change more than 25% of writable pixels, rounded up.
Its currently painted writable footprint imposes the same quarter-area limit
with a one-pixel minimum; read the actual `maximum_changed_pixels` in the context.
When `--colors` was specified, preserve that total RGBA budget as well as the
palette. Adding an unused stored color can still exceed the budget: consolidate
an unnecessary shade within the bounded patch or keep the draft.

Run `refine` into a new project, then `preview` and compare the real before/after
images. For continued iterations, include the strongest previously retained or
user-approved control; the latest export may be weaker. A local feature gain
does not establish a whole-character gain. Bind the final choice to its actual
file and source fingerprint after decoding any comparison labels.
Verify the target-size expression, feature separation, pose, materials,
silhouette and any permitted reference purposes. Reject a candidate that is
worse even if validation succeeds. Keep earlier files. Stop after two repair
passes. Preserve rejected candidates and label them clearly in comparisons; do
not describe a technically accepted patch as an artistic improvement unless the
rendered result supports that judgment. If the structure still requires broad
redesign, report that limitation
and revise the source art/design in a separate authorized generation instead.

The app spends at most one additional visual-review request in a normal precise
generation with repair enabled; the standalone skill uses its host AI for each
explicit pass. Keep those routes and call counts distinct in comparisons. Record
whether a result came from an API, the host AI or deterministic local conversion.
Do not label a host-authored response as an app API result, or equate format and
protection checks with aesthetic success. Start animation only after the reference
frame is visually acceptable.
