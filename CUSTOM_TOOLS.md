# Custom tools and shortcuts

## Connected selection

Choose Connected selection (default **W**) in the left toolbar and click a pixel.
The **Same color** mode compares exact RGBA values, including transparency, rather
than palette indices. **Nontransparent region** selects connected painted pixels
regardless of color, including partial alpha; clicking fully transparent space
in this mode selects nothing. The active layer is the source, not the composite.

Four-way connectivity is the default. Enable **Include diagonals** for eight-way
connectivity. Wrapped tile editing also connects across opposite canvas edges.
Shift-click adds and Alt-click or right-click subtracts. An ordinary click replaces
the selection. Selection changes, including Select all, Invert and Deselect,
can be undone without changing artwork.
Hovering previews the connected region without selecting it. The canvas tooltip
reports its pixel count; moving away removes the preview.

## Keyboard shortcuts

Open Settings → Editor → Keyboard shortcuts. Search a command, click either binding
slot and press a key combination. Each command accepts at most two bindings.
Conflicts are reported without replacing an existing assignment. The × button
clears a binding; Save shortcuts persists the changes immediately and independently
of other editor settings. Closing or canceling discards the shortcut draft.
Restore defaults is also a draft until saved.
Each command has its own Default button. Conflicts offer a jump to the other
command so its binding can be reviewed; restoring defaults never steals a key.
AI proposal application and placement confirmation are separate commands that
can share a key because their contexts are mutually exclusive. Both default to
Enter, and each button displays its own configured bindings. Other overlapping
commands still report conflicts.

Saved script tools appear in the command list. Their shortcuts open the tool's
preview/editor; they do not silently apply artwork changes. Space, Escape, arrow
gestures and Ctrl+wheel keep their existing behavior. Shortcuts do not trigger
while typing, except project saving and requesting an AI edit. Open dialogs and
in-progress strokes retain their existing keyboard guards. Letter bindings use
physical letter keys so they also work with a Korean keyboard layout.
In the AI prompt, Enter sends and Shift+Enter inserts a line break. Enter used to
confirm IME composition does not send. Empty text, held-key repeats and requests
during an existing edit/review do not submit. Ctrl+Enter remains an alternative;
outside the prompt the configured AI-request shortcut is used. Enter outside text
fields confirms pending placement or applies an AI proposal.

## JavaScript tools

Expand **Custom tools** in the left toolbar and choose Add / manage tools. Edit
the built-in example or import a UTF-8 `.js` file, name it, and save it. Saved tools
appear in the left menu and persist locally. The library holds up to 32 tools,
each with a name of up to 60 characters and a source of up to 64 KiB. Tools and
shortcuts are local settings, not part of `.pixeltool` projects or AI requests.
Source/name edits are saved as local drafts (up to 32, with the same source limits)
and restored after restarting. An asterisk in the tool list identifies a draft.
Importing creates a separate draft and retains the previous one in the list.
Revert discards the selected draft and restores its saved tool, if any. Save tool
updates the library. Undo deletion restores the most recently deleted tool, also
after restarting. These copies remain in the local application profile.

Scripts are synchronous function bodies using the supplied `api` object:

| Member                         | Meaning                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `width`, `height`              | Native canvas dimensions                                           |
| `pixels`                       | Read-only row-major active-layer palette indices                   |
| `palette`                      | Read-only `#RRGGBBAA` palette                                      |
| `mask`                         | Read-only writable pixel mask after selection and protections      |
| `primary`, `secondary`         | Selected primary and secondary palette indices                     |
| `primaryRGBA`, `secondaryRGBA` | Displayed drawing colors as RGBA strings, including pending shades |
| `params`                       | Read-only values of the script's declared controls                 |
| `setPixel(x, y, index)`        | Request a color change at a writable pixel                         |
| `addColor("#RRGGBBAA")`        | Reuse or append a color and return its palette index               |

For example, recolor painted pixels in the writable region:

```js
const color = api.addColor("#F2B866FF");
for (let y = 0; y < api.height; y++) {
  for (let x = 0; x < api.width; x++) {
    const i = y * api.width + x;
    if (api.mask[i] && api.palette[api.pixels[i]].slice(7) !== "00") {
      api.setPixel(x, y, color);
    }
  }
}
```

Repeated writes to a pixel use the last value. Requests outside the writable mask
fail; the editor never silently clips them. Existing alpha, geometry, autotile and
active-layer protections are checked before any result is shown or applied.
Selecting **Run / preview** leaves the original untouched. **Apply** commits the
whole result as one undo step; closing or canceling keeps the original.
The preview offers Original, Changed pixels and Protected area toggles. Changing
source or parameter values invalidates the old preview until Run / preview is used
again. Pending shade colors are added to the proposal's palette only when their
indices are requested, without mutating the live document. Such an index may
refer to a newly added color beyond the original read-only `api.palette` array;
use `primaryRGBA` or `secondaryRGBA` to read the displayed color directly.

### Parameter controls

An optional single-line JSON comment declares up to 12 controls without executing
the script. Existing scripts need no changes. Number controls require finite
`min`, `max`, positive `step` and an in-range `default`; color defaults use
`#RRGGBB`; boolean defaults use `true` or `false`. IDs must be unique, start with
a letter and contain only letters, digits or underscores (at most 32 characters).
Labels are plain user text, at most 60 characters. Invalid declarations and
out-of-range input block execution. Runtime color values include opaque alpha.

```js
// @params [{"id":"color","label":"Color","type":"color","default":"#F2B866"},{"id":"enabled","label":"Enabled","type":"boolean","default":true}]
if (api.params.enabled) {
  const color = api.addColor(api.params.color);
  for (let i = 0; i < api.mask.length; i++) {
    if (api.mask[i])
      api.setPixel(i % api.width, Math.floor(i / api.width), color);
  }
}
```

For a numeric control, for example, use
`{"id":"strength","label":"Strength","type":"number","min":0,"max":100,"step":1,"default":40}`
and read `api.params.strength`. Controls start from their declared defaults when
loading a tool; changes affect the current preview session.

Each execution runs in a fresh browser worker with a 1.5-second deadline and a
262,144-character serialized result limit. Cancellation, failure and completion
terminate the worker. The worker has no Node or app bridge, and its separate CSP
blocks network requests, imports and child workers. Network, child-worker and
browser database entry points are also disabled. Script output is untrusted and
passes the editor's atomic proposal validator. Async work, npm packages, DOM
tools, local file access and direct layer/project mutation are not supported.

## Verification

`pnpm test` includes connectivity, binding normalization and worker lifecycle tests.
`pnpm test:custom-tools` checks the desktop selection, script preview/apply/undo,
scope rejection, timeout, isolation, shortcut conflicts and restart persistence
using isolated profiles without live AI calls.
