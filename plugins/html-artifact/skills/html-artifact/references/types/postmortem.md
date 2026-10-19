# Postmortem, incident report, RCA

Leadership reads the first screen and the action items. Engineers read the timeline and the cause. Write for both.

## Spine

1. **Masthead.** Severity and status in the eyebrow ("SEV-2 · resolved"). The `h1` states what broke and for how long. The lede states the customer impact in numbers.
2. **Summary.** `dl.stats` for duration, the share of customers affected, and anything lost. Then a callout with the verdict: fixed, partially fixed or not fixed.
3. **Timeline.** `ol.timeline` with one `<time>` per event, covering detection, escalation, mitigation and resolution. Tone the bad events crit and the recovery good. Keep it to the events that changed the course.
4. **Root cause.** A numbered cause chain from trigger to impact, with the defect step toned crit. Then two or three sentences for readers who skipped the timeline.
5. **What worked and what didn't.** Two short bullet lists. Without the first, the review turns punitive.
6. **Action items.** A numbered list. Each item has an owner and a date, and is a commitment, not a wish.
7. **Sources.** Dashboards, logs, PRs and threads, named precisely.

## Avoid

- Burying the impact below the timeline.
- A timeline written as prose paragraphs.
- Action items without owners.
