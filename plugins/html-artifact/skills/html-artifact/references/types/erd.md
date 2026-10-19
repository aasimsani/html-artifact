# ERD explorer

An interactive entity-relationship diagram: entity tables in a grid, with reference lines
drawn between foreign keys and the primary keys they point at.

```html
<div class="erd" data-id="shop">
  <table class="entity" data-name="organizations"><caption>organizations</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
    <tr data-col="name"><td>name</td><td>text</td></tr>
  </table>
  <table class="entity" data-name="customers"><caption>customers</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
    <tr data-col="org_id" data-ref="organizations.id" data-card="1:n"><td>org_id</td><td>uuid</td></tr>
  </table>
</div>
```

- `table.entity[data-name]` is one entity. `caption` names it, and it is also the click target that focuses the entity.
- A row carries `data-col` (the column name) always. `data-pk` marks a primary key. `data-ref="entity.column"` marks a foreign key and names the row it points at; an optional `data-card="1:n"` gives the one-side and many-side labels drawn on the line (it defaults to `n:1`, the referencing row being the many side).
- The page reads correctly before JS runs: it is a grid of plain tables. JS adds the SVG overlay, the focus lens and the search box.

## Behaviour

- The grid is responsive (`auto-fit`, so it collapses to one column on a phone), and lines redraw on resize.
- Clicking an entity's caption focuses it: unrelated entities dim, and the lines touching it turn into the accent colour. Clicking the same entity again clears the focus.
- The search box (added by the component) highlights rows whose column name contains the query.
- State is `{ focus, search }`, restored on reload. The review export's summary reads like `focus: customers`.

## Avoid

- Giving a `data-ref` value that doesn't resolve to an existing `data-name`/`data-col` pair — the row is skipped, silently, rather than drawn as a dangling line.
- More than a handful of entities on one page. Past a dozen or so, split the diagram or group entities by domain into separate `.erd` blocks.
