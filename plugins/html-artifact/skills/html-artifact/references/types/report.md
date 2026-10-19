# Status report, research roundup, audit, explainer

The reader opens it once, takes what they need and leaves. Answer the question first.

## Spine

1. **Masthead.** The `h1` answers the question the report was asked to answer. The lede says who it is for and what decision or action it supports.
2. **Answer.** For a roundup, a table of question → answer. For a status report, three groups: shipped, in flight, blocked, one line per item. For an audit, `dl.stats` of findings by severity, then the top three. For an explainer, the core idea in one sentence, then a diagram.
3. **Supporting sections.** One per point that backs the answer, each with its visual first: timeline, table, chart or diagram.
4. **Asks.** What you need from the reader, separated from the status, numbered and owned.
5. **Sources.** Each claim is traceable: file and line, commit, ticket, query, thread.

## Avoid

- Preamble before the answer.
- Restating the sources instead of synthesizing them.
- A wall of status with the asks mixed in.
