# Playground / tuner

For letting the reader feel a parameter's effect by moving it, not by reading about it.

## Spine

1. **Masthead.** The `h1` names what's being tuned ("Tune the toast's entrance"). The lede says which parameter matters most.
2. **Playground.** A `form.playground` (see `components.md`) next to its `#preview` target. Expose only the parameters that change the outcome, each with a sensible range and a live readout.
3. **Presets.** Two or three named presets that bracket the useful range, so the reader has a start before they fine-tune.
4. **Takeaway.** One sentence on which value you'd ship and why, once the reader has played with it.

## Avoid

- More controls than the reader can hold in their head at once; six is already a lot.
- A preview that doesn't visibly change when a control moves.
- Hiding the shippable recommendation behind "it depends."
