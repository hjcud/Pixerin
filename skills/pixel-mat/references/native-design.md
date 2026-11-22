# Recompose a reference at native resolution

This is an experimental authoring route for an explicitly requested native
redraw. The current trial failed visual acceptance for characters and items;
it is not a validated remedy for conversion losses. Color fitting cannot
recover a structure that has no allocated cells, but allocating cells alone
does not preserve the source geometry. A native redraw is a separate
new asset when the user permits recomposition. For finishing accepted artwork,
keep its proportions and use the bounded [review workflow](native-reconstruction.md).

## Allocate space before color

View the source and the failed conversion. Record which identity, pose, contact
points and identifying features must survive. Decide what texture can be omitted.
Then place native bounding boxes and negative spaces for the major structures.
Fit and inspect their silhouette before spending cells on highlights. Compare
contour aspect ratio, principal axes and part junctions with the source. A round
vessel must not become narrow/pointed; a sword's blade must meet the guard at its
intended center. Merely including the named parts is insufficient. Proportion
changes require the user's intended design tradeoff; recognizing the object
does not justify a distorted reference reconstruction.

For a character, budget the face and hair together with the whole-body pose.
Read the actual visible eye count, each eye's pupil/light order, gaze, brow
angle and mouth corner from the source. Preserve actual skin, hair occlusions
and negative space around marks. Eye whites, glints, a
separate nose and an explicit mouth are optional at tiny sizes; do not force two
eyes into a profile or enlarge the head just to fit a checklist. An oversized
eye, frame or mouth may need subtraction rather than another highlight. Compare
the combined expression, not the presence of individual marks. A white glint
must not replace the pupil when the pupil is a defining source cue.
Separate source visibility from target stylization: a partly visible far eye
is not fully hidden merely because its mark is omitted in a tiny draft. Record
that omission as a size tradeoff. If comparing a far-eye mark, retain perspective
asymmetry, skin separation and the source forelock together; two visible marks
can make a three-quarter face look frontal without improving likeness.
Keep the head/body gesture and facing direction consistent with the source.
Record eye gaze separately from head facing; a source can glance left while its
head points right. Do not force bright eye whites to encode that distinction when
they overwhelm the available face cells.
For a clearly open source eye, preserve its opening and pupil/light order when
readable; a closed-lid correction from another subject can lose gaze or mood.
Check actual skin and hair occlusion around each eye before adding light cells.
Do not erase a source fringe just to impose a skin gap.
Derive near/far feature footprints from the reference's perspective rather than
duplicating an eye or frame. Non-touching features may share a horizontal band
when an actual skin path separates them; allocating every mark a complete row
can unnecessarily enlarge the head. Check that neighboring props and foliage
also remain separate from the face. For a narrow or half-lidded source eye,
compare dark, warm and light existing tones at the same footprint while retaining
the pupil and lid shape. At one native row, a bright lower aperture or glint can
make a narrow eye look wide; the brightest source sample need not represent the
whole eye. Judge the combined expression.
Give each important hand a connected palm/mitten, separate from the sleeve and
nearby bag. Draw a held object behind/in front of the hand deliberately so the
grip reads. Tiny individual fingers usually compete with that contact point.
These are visual decisions, not universal fixed coordinates or minimum sizes.

For an authorized native redraw, budget headwear, hair and skin within the planned
head before increasing its overall size. Reducing cap rows or moving a fringe can
reserve a skin row between eye and mouth marks. Retain identity-bearing forelocks
and the connected hood contour; a point above an interrupted hood can read as a
detached dot. The five-character trial improved some16px identification with this
subpart planning, but expressions and proportions still differed from the source.
It is a host-authored design method, not a validated automatic conversion.

Before an experimental learned score drives selection or edits, check its
ordering on controls that violate the requested features, such as erased eyes
or reversed gaze, as well as visibly rejected candidates. Tested CLIP/DINOv2
reference similarities sometimes preferred those failures or a different
subject; cosine values are not quality percentages. Earlier TinyVAE/LPIPS
optimization could also reduce its objective while losing glasses or facial
marks. If a score rewards these defects, reject that objective rather than
optimize it. Keep the earlier draft and inspect the combined face at its actual
size before choosing a candidate.

For a 16px item, allocate the silhouette and functional joins first: blade,
crossguard and grip; or bottle, neck, stopper and liquid boundary. Reserve an
identifying gem or glint only after those structures fit. Do not copy a commercial
game's sprite; draw the supplied subject and design.

## Plan an entire 16px character together

Before authoring indexed rows, read the actual palette and bind semantic names
to its current entries. Do not reuse another character's remembered indices:
valid indices can still paint ivory on a navy coat or gray on skin. Compare
rendered colors against their intended material roles. Local format validation
cannot detect that artistic mistake. Prefer an explicit role-to-index table in
the host's drawing program; it need not change the exported grid format.
For a permitted new palette, check every usage before consolidating a shade to
reserve a source identity color. Compare equal-geometry color variants: a source
eye light may need a different role from cloth cream. This never permits changing
a locked existing palette or establishes expression quality by itself.

For an explicitly requested whole-character reconstruction, budget the entire
canvas before enlarging a face. Record the source's facing, visible eye count,
hair silhouette, dominant clothing, stance and prop side. Allocate head, torso,
legs, hands and prop together; reserve negative space between feet and around
the grip. Include source-derived facial marks in that same plan. A larger head
requires shorter/repositioned body parts, not a patch over the old torso.

Source-cutout parts can separate identity preservation from layout decisions.
Use a contact graph for shoulder/arm/hand/prop and hip/leg/foot relationships,
ordered layers for occlusion, and nonoverlapping native marks for eyes and mouth.
Derive mark footprints from their size relative to the parent face, not their
aspect ratio alone: a long but tiny source mouth can still need only one cell.
Validate actual source support; do not fill a missed eye/mouth with a generic
fallback. Inspect hair/face and hand/prop interactions after the whole assembly.

Check the final composite, not just the proposed rectangles or source cutout
coverage. Important hands and props must retain visible cells after occlusion;
their visible footprints must still meet. Hidden contact layers are legitimate
only where the design calls for them. A facial clearance operation must never
erase another reserved landmark. Verify the final landmark colors/footprints,
not only opaque alpha. These checks reject structural failures; they cannot
approve expression or likeness.

A four-reference source-cutout experiment improved structural readability over
local face enlargement, while likeness, curves and clothing remained coarse.
Image-model redraws guided by the same layout still lost eye/mouth separation
when sampled to 16px. This is limited research evidence, not a validated automatic
character generator. The app's current reconstruction is local; the bundled CLI
does not automatically extract or solve a whole-character layout. Do not present
the offline prototype as an app capability. Keep the source, every candidate and
the actual native exports available for comparison.

For executable source-cutout experiments, [source-layout.md](source-layout.md)
describes `from-layout`. It defaults to source colors, supported gaps and native
marks. Its flat/shade experiment failed visual acceptance; keep the earlier
accepted pixel clusters rather than using simplification as a quality upgrade. It does not
automatically extract a layout or establish better likeness than the prior result.

## Two exact representations

The repeated character trial compared reference-image redraw and tile-board
decoding, direct native host designs, expression/spacing repairs, body-preserving
head redraws, and local native-model sampling. Native host designs made features
more legible, but enlarged heads changed proportions and expression remained
unreliable. Keeping the body fixed retained pose while still losing face identity.
Neither outcome justifies an automatic replacement. Choose between permitted
redesign and source-faithful preservation explicitly, retain the earlier candidate,
and inspect an unfamiliar character before generalizing a method.

Text-only native models enforce their output grid but do not thereby condition
on the supplied source. A low-noise face-only diffusion trial also failed to give
consistent likeness gains. Do not add either as a dependency or claim it repairs
identity without new visual evidence. Use the host for a source-specific native
plan and the CLI for rendering/validation; they perform different jobs. The
current results support readable drafts, not reliable original-face restoration.

For an experimental learned repair stage, compare against the same native draft
with only the proposed feature/material guards and no model call. If the final
guarded exports are identical, keep the simpler baseline; a lower intermediate
feature loss adds no visible value. Check this per source rather than treating
one failed model configuration as a universal limitation.

A native scaffold plus the original can be sent to an available image editor
for a separate repair candidate. In the three-character trial, the real sampled
32px captain face improved partially; the other faces were mixed and 16px failed.
Inspect the sampled native export, not the attractive enlarged model output.
Retain the existing body when the task only concerns the face, and pass any
proposed edit through the original scope, alpha, palette and painted-area budget.
Never enlarge a selected-face mask to obtain a larger repair allowance. The
offline whole-canvas studies created new assets; they are not proof that a local
face selection can accept the same patch. Do not enable repeated model calls or
this research route automatically.

If a final outer outline is requested for a new design, reserve its one-cell
margin during planning. Add one simultaneous four-neighbor layer to transparent
cells using the chosen source ink; do not overwrite fills or grow repeated rings.
Check thin gaps and clipping at the actual size. An optional outline improves
edge separation, not missing internal anatomy or expression. Keep it optional.

- `from-grid`: write the complete palette-indexed raster directly. It has the
  smallest representation overhead for a compact sprite.
- `from-parts`: write named native patches, such as head, face, sleeve, hand and
  held object. Painter order determines occlusion. This permits repositioning a
  part without reauthoring unrelated rows. It is not a recognizer or an automatic
  shape solver and does not guarantee a better drawing than a whole grid.

Render with `preview`. Inspect at 1x and integer zoom, including face/hand/contact
regions. Compare with the original reference and conversion, not just a numeric
diagnostic. Inspect the whole pose after a local change. Keep unsuccessful
candidates and stop after two repair passes unless further iteration is requested.
Export the actual native PNG and editable project. Do not claim app API quality
from a host-authored plan or hide a method's failures by selecting only good cases.

## Research and current evidence

[PixelBench](https://arxiv.org/abs/2611.02540) studies reference-to-palette-grid
reconstruction and reports strong low-resolution results for some frontier models.
Its results depend on the model, dataset and resolution; they do not establish
that this tool reliably draws faces or hands. Our named-part format is an
engineering choice, not a method evaluated by that paper.

[SD-piXL](https://arxiv.org/abs/2410.06236) optimizes native categorical pixels with
diffusion guidance and optional spatial conditioning. It is a different method,
requiring a model/optimization runtime; it is not implemented by `from-parts`.

The local four-reference experiment (two explorer source variants at 32px, sword
and potion at 16px) compared conversion, reference-guided raster regeneration,
whole-grid redraw and part-based redraw. The user rejected the overall quality:
character expression/structure broke down, the potion lost its round silhouette
and the sword blade joined the guard off-center. Readable isolated features did
not compensate for those defects. Record this as a failed visual trial, including
objects; it does not establish an object-generation strength or justify a default
redraw workflow. The experiment also shares layouts and is not a blinded or
independent model benchmark. Technical validation of cells/palettes still holds
but must remain separate from the failed visual acceptance.
