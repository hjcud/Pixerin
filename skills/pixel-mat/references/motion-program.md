# Native-grid motion programs

The renderer starts every pose from the same reference sprite. It clears only
the source pixels assigned to moving parts, redraws those parts in pose order,
then applies intentional sparse edits. Unassigned source pixels remain still.
This avoids cumulative resampling and pose-to-pose drift. It does not infer
anatomy or guarantee good animation; those remain the directing AI's job.

Read the `context` file before planning. Coordinates are zero-based pixel centers
in the active layer, not coordinates in an enlarged preview. Parts must contain
painted pixels, must not overlap, and use horizontal source runs. Each frame must
list each part exactly once in back-to-front order. `turn` is 0–3 clockwise quarter
turns. `flipX` applies before turning. Offsets are always from the reference,
never relative to a previous frame. Small joint rotations normally need sparse
pixel redraws instead of rotating an entire limb by 90 degrees.

```json
{
  "version": 1,
  "summary": "A four-frame breathing idle with planted feet",
  "parts": [
    {"id": "body", "pivotX": 7, "pivotY": 7, "runs": [{"x": 6, "y": 6, "length": 3}]}
  ],
  "frames": [
    {"duration": 140, "poses": [{"id":"body","dx":0,"dy":0,"turn":0,"flipX":false,"visible":true}], "edits": []},
    {"duration": 100, "poses": [{"id":"body","dx":0,"dy":-1,"turn":0,"flipX":false,"visible":true}], "edits": []},
    {"duration": 140, "poses": [{"id":"body","dx":0,"dy":0,"turn":0,"flipX":false,"visible":true}], "edits": []},
    {"duration": 100, "poses": [{"id":"body","dx":0,"dy":1,"turn":0,"flipX":false,"visible":true}], "edits": []}
  ]
}
```

The example assumes those three pixels are actually painted in the source. Do
not paste it into unrelated artwork. IDs use ASCII letters, numbers, underscores
or hyphens, at most 40 characters. There are at most 16 parts and 24 AI frames.
The first frame must reproduce the original exactly. An edit has the form
`{"x": 7, "y": 5, "color": 2}`; zero erases. It uses an existing palette index.
Duplicate edit coordinates, invalid indices, off-canvas movement, protected writes
and a completely motionless result are rejected before a proposal is returned.

Plan the action before writing coordinates: silhouette and weight, contact poses,
anticipation, main action, recovery, then secondary motion. Use pose timing and
deliberate holds rather than forcing an equal-speed wobble. Preserve eye spacing,
costume motifs and material shade roles. A walk requires coherent limbs and
contact phases; moving the entire sprite sideways is not a convincing walk.

After rendering, review both the contact sheet and animation playback. Watch the
last-to-first transition for loops. A high changed-pixel count is not a quality
score, and identical hold frames can be intentional. Use native-grid edits for
exposed joints, broken outlines, occlusion, cloth and controlled smear frames.
Do not automatically delete isolated pixels: they can be eyes or glints.

App-generated motions additionally use a bounded optional second AI review of
the source, motion program and rendered contact sheet. Only validated sparse
corrections can replace the draft. A failed review remains visibly marked as
incomplete. The standalone skill performs the equivalent visual review with its
host AI and the CLI, without requesting a separate service connection.
