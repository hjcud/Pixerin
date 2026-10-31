# Resources for an existing game

Inspect the active manifest and representative installed PNGs before generation.
Older handoffs, enlarged screenshots and canonical render sizes can describe a
different source resolution. Record the actual canvas, pixel pivot convention,
pixels per unit, facing/state, palette and alpha rules for the requested asset.
Keep source scale separate from camera zoom and source-to-canonical render scale.
Distinguish shared scale factors from asset-specific multipliers; a shared factor
does not imply an actor-only enlargement.

For a replacement, preserve the existing source and make a separate candidate.
Content trimming and frame fitting are different operations: neither guarantees
that feet, trunk contacts or building entrances stay registered. Preserve aspect
ratio when fitting a new draft, then inspect its contact points and clearance.
Preserve the project's animation registration; independently centering each frame
on its moving feet can introduce unwanted shifts and animation jitter.
Do not use small registration fixes as evidence that animation is validated.

Review orientation and part relationships separately from dimensions. A house can
have a valid canvas and pivot while its door moves to the wrong wall. A tiny
resident can retain height while its legs merge. Compare original and candidate
at native size and an integer zoom, then at the same placement in the game or an
explicitly identified offline fixture. Use produced, registered assets for fixture
objects, and respect the project's outline style. A minimalist game resident is
not evidence that a detailed reference face can retain its likeness at that size.

Deliver source fingerprints, the exact native PNG/editable project, chosen pivot
and scale, and generation provenance. Record rejected variants and the reason for
choosing a candidate. Test constraints and art quality separately. Inspect the
captured preview itself: successful canvas drawing or interaction events do not
prove that an offscreen screenshot contains the artwork. Label an offline preview
as such; it does not establish Unity import, collider/occlusion, other directions
or animation compatibility. Keep experimental resources separate from production
until the requested integration and its checks have actually been performed.
