---
description: An incident writeup the team will review. It should be built from components, verified, and carry a real timeline.
tags: [trigger, report]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
---

Write up yesterday's outage as a postmortem the team can review and comment on. Save it as postmortem.html.

What happened: at 09:40 UTC we shipped worker v4.12, which raised the queue prefetch from 10 to 200. 09:52 the payments queue backlog passed 50,000 jobs. 09:58 the on-call alert fired for job latency. 10:03 Dana acknowledged. 10:15 we saw that one slow consumer was holding 200 jobs each, so other workers sat idle. 10:21 we set prefetch back to 10 with a config push. 10:44 the backlog drained. Customer impact: payment confirmations were delayed by up to 45 minutes for about 12% of checkouts in that window, and nothing was lost. Root cause: prefetch=200 let one slow consumer reserve most of the queue. Follow-ups: cap prefetch in the worker config schema (owner: Dana, Friday), add a backlog-age alert at 10 minutes (owner: Ravi, next sprint), load-test prefetch changes before release (owner: Mei, this month).
