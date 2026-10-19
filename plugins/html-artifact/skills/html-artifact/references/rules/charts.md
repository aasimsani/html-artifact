# Chart rules

Draw charts as inline SVG. A bar is a `<rect>`, and a line is one `<path>`. Load no chart library unless there are hundreds of points.

## Pick the form from the data

| The data is… | Draw |
|---|---|
| fewer than a dozen numbers to compare | `dl.stats` or a short table |
| part of a whole, fewer than five parts | `div.bar` (a stacked bar), never a pie |
| categories compared | horizontal bars, sorted, with labels at the bar ends |
| a trend over time | a line; a sparkline when it sits inside a sentence or table |
| a distribution | a histogram or a dot strip |

## Honesty

- Bar axes start at zero.
- Label values on the marks you want read. A tooltip must never be the only way to read a value.
- State the unit in the title or the axis.
- If you can't say what the chart shows in one sentence, it isn't ready. Put that sentence in the `figcaption`.

## Ink

- Use theme variables or `currentColor`, never fixed hex colours, so dark mode works.
- Use six series at most. Vary lightness as well as hue, so the chart survives greyscale.
- Grid lines are lighter than the data.
