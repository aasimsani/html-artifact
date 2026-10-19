# Mind map

An editable idea tree: a root with branches, each one renamable, addable, deletable and
reorderable without leaving the page.

```html
<ul class="mindmap" data-id="launch-plan">
  <li>Launch plan
    <ul>
      <li data-tone="keep">Marketing
        <ul>
          <li>Blog post</li>
          <li data-tone="drop">Print ads</li>
        </ul>
      </li>
      <li data-tone="maybe">Beta invites</li>
    </ul>
  </li>
</ul>
```

- It is a plain nested list before JS runs, so it reads as an outline. `data-tone="keep" | "maybe" | "drop"` marks a node's status and survives into the tree the component serializes.
- JS wraps each node's text in a row with a collapse toggle, a mark button and add-child / add-sibling / delete controls.

## Behaviour

- **Rename**: double-click a node's text, or focus it and press Enter; Enter again (or losing focus) commits, Escape reverts.
- **Add / delete**: the row's `+ child` and `+ sibling` buttons insert a node and start editing it; `Delete` removes the node and arms a single-slot `Undo delete` button above the tree.
- **Move**: Tab indents a node under its previous sibling, Shift+Tab outdents it to its parent's level; Alt+Up / Alt+Down swap it with the sibling above or below.
- **Collapse**: the toggle button hides or shows a node's children; this is not persisted.
- State is the whole tree as JSON, `[{ text, mark, children: […] }]`, restored on reload. The review export's summary reads like `12 nodes · 3 dropped`.

## Avoid

- Relying on collapsed state surviving a reload — it doesn't; only the tree's content and marks do.
- A root with no text. Give every node, including the root, something to rename from.
