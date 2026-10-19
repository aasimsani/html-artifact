# Data explorer, CSV/JSON browser

The reader came to find specific rows, not to read a narrative. Give them facets, search and a sortable table, not prose.

## Spine

1. **Masthead.** The `h1` names the dataset. The lede says how many rows and where they came from.
2. **One `div.explorer` per dataset**, with the rows embedded as JSON so the file stays self-contained and works offline.
3. **`data-facets`** names the two or three fields worth filtering by, usually low-cardinality ones (status, region, type). Don't facet a field with near-unique values, like an id or a free-text note.
4. **`data-time`**, when the rows carry a date or timestamp field, turns on a per-day histogram of the filtered rows.

## Markup

```html
<div class="explorer" data-id="accounts" data-facets="region,status" data-time="created_at">
  <script type="application/json">[
    {"account": "Acme Co", "region": "EU", "status": "open", "created_at": "2026-10-01"}
  ]</script>
  <p>4,000 accounts exported from the billing warehouse on 2026-10-18.</p>
</div>
```

The build adds the row count, a facet sidebar (checking two values in one facet is OR; checking values in two different facets is AND), a search box that matches any field, a sortable table paginated at 200 rows, the histogram when `data-time` is set, click-to-expand rows, and "Copy CSV" / "Copy as SQL WHERE" buttons. Don't write any of that by hand.

## Avoid

- Embedding more rows than the reader will ever filter down to usefully. A few thousand rows is fine; don't ship a raw export with a million.
- A facet field that is also the search target for every query. Pick facets that narrow the view, and let search handle the rest.
- Restating the row count in prose above the explorer. The header already shows it.
