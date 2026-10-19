---
description: A design doc for team review. It should use content components rather than hand-drawn SVG for a simple pipeline.
tags: [trigger, design]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
---

Draft a design doc for per-customer rate limiting on our public API so the platform team can review it. Save it as design_rate-limits.html.

Facts: requests go client → edge proxy → auth service → rate limiter → API handlers. Today the only limit is a global 5,000 requests per second at the edge. Two customers caused 80% of throttled traffic last month. Proposal: a token bucket per API key in Redis, 100 requests per second with a burst of 300, returning 429 with a Retry-After header. Alternatives considered: fixed-window counters (simpler, but bursty at window edges) and limits in the edge proxy (no per-key data there). Open questions: should internal keys be exempt, and what happens when Redis is unavailable (fail open or fail closed)?
