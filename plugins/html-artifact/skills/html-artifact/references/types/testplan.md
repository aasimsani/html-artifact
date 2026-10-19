# Test plan, QA checklist, release sign-off

The reader works through flows one step at a time and records pass/fail/blocked as they go, not after.

## Spine

1. **Masthead.** The `h1` names what is being tested ("Checkout release sign-off"). The lede names the build or branch under test.
2. **One `div.testplan` per page**, holding one `section.tp-flow` per user flow and one `div.tp-step` per step inside it. Order flows the way a tester would actually run them, most-used first.
3. **Each step's `dl`** has exactly `Action` (what to do, with a `<code>` command when there is one), `Pass` (what success looks like), and `Watch` (the thing most likely to silently break).

## Markup

```html
<div class="testplan" data-id="checkout">
  <section class="tp-flow" data-title="New user checkout" data-minutes="15">
    <div class="tp-step" data-id="f1-s1">
      <dl>
        <dt>Action</dt><dd>Add an item to the cart, then run <code>checkout --guest</code>.</dd>
        <dt>Pass</dt><dd>The order confirmation page shows the item and total.</dd>
        <dt>Watch</dt><dd>Tax should match the shipping address, not the billing one.</dd>
      </dl>
    </div>
  </section>
</div>
```

The build adds a state control (pending/pass/fail/blocked/skipped) and a notes box to every step, a sticky global progress bar plus one per flow, a search box, a hide-resolved toggle, and `j`/`k`/`p`/`f`/`b`/`s` keyboard shortcuts. Don't write any of that by hand, and don't use the bare class `flow` on a step container, because `figure.flow` is a different component.

## Avoid

- Steps that bundle two checks. Split them, because one state control covers one outcome.
- A `Watch` line that restates `Pass`. It should name the failure mode a tester would otherwise miss.
- More than about six flows on one page. Split a long plan by surface area instead.
