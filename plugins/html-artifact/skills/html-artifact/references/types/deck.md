# Slide deck

A deck for presenting, not just reading. It opens as a normal scrolling page of sections — every slide is a review section, so it still takes comments and highlights — and a "Present" button switches to a fullscreen, one-slide-at-a-time view.

## Markup

```html
<body class="deck">
<header class="masthead"><h1>Deck title.</h1></header>
<div class="page"><nav class="toc"></nav><main>
  <section class="slide" id="s1">
    <p class="eyebrow">Slide 1</p>
    <h2>The headline for this slide.</h2>
    <p>One or two supporting sentences, or a visual.</p>
    <aside class="notes">What to say that isn't on the slide.</aside>
  </section>
  <section class="slide" id="s2">…</section>
</main></div>
</body>
```

- One `section.slide` per slide, each with its own `id` (used in the URL hash) and an `eyebrow` + `h2`.
- `aside.notes` is optional. It reads as plain text in the scrolling view; present mode hides it until `N` shows it in a caption bar.
- Keep each slide's own markup short. The present-mode frame scales to a 16:9 box, so a slide with too much text spills past it.

## Spine

1. **Masthead.** The deck's title and who it's for, same as any other page.
2. **One section per slide.** Lead with the point, then the visual that makes it (a stat, a diagram, a short list). Avoid walls of bullets.
3. **Notes.** Put delivery reminders and the numbers behind a claim in `aside.notes`, not on the slide.

## Present mode

Click "Present" (or restore a page that was left presenting) to enter it.

| Key | Does |
|---|---|
| `→` / `Space` / `Page Down` | Next slide |
| `←` / `Page Up` | Previous slide |
| `Home` / `End` | First / last slide |
| `N` | Toggle speaker notes |
| `Esc` | Leave present mode |

The counter, progress bar and current slide persist across a reload, and the URL hash always names the current slide, so a direct link to `#s3` opens on that slide.

## Avoid

- Dense slides: a slide is a prompt for talking, not the talk itself.
- Skipping the scrolling view: it's how a reader reviews and comments on the deck without presenting it.
