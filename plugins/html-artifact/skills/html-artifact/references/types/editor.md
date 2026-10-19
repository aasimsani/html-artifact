# Throwaway editor

A one-off tool for triaging, reordering or labelling a list the user will hand back to Claude when they're done — not a document. Build one when the deliverable is "help me sort through this list," not "write this up."

## Markup

```html
<ol class="editor-list" data-id="triage" data-labels="bug,feature,chore" data-tones="crit,good,nit">
  <li data-id="T-12">Fix crash on save <small>backend</small></li>
  <li data-id="T-13">Add dark mode toggle <small>frontend</small></li>
</ol>
```

- `data-id` names the instance; its state is exported as `editor:<data-id>`.
- `data-labels` is the label vocabulary, in the order `data-tones` colors them.
- Each `li` needs a stable `data-id` (a ticket key, a filename, anything unique) plus the item's text. A trailing `<small>` holds metadata that stays put during an edit.

## What it gives the reader

- **Reorder.** Drag an item, or focus it and press `Alt+↑` / `Alt+↓`.
- **Label.** Click a chip under an item to toggle that label on it.
- **Delete.** The × button removes an item with an undo toast, and keeps it in a "Deleted" list below until restored.
- **Edit.** Double-click an item, or focus it and press `Enter`, to edit its text in place. `Enter` saves, `Esc` cancels.
- **Filter.** The dropdown above the list shows only items carrying one label.
- A count line under the toolbar reads like "24 items · 3 labelled bug · 2 deleted".

## When the user hands the result back

Open the review tray's JSON export, or read `HA.blocks()['editor:<data-id>'].state` directly: `{ order, labels, deleted, edits }`. `order` is every id, deleted ones included, in their final sequence; filter the ones in `deleted` out.

## Avoid

- One `editor-list` per concern: don't cram triage and labelling of unrelated lists into one instance when two instances, each with its own `data-id`, would keep state and summaries separate.
- Treating this as a reviewable document: it has no sections, no comments, and isn't meant to be read start to end.
