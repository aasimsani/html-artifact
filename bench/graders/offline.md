---
type: regex
target: { source: file, path: "{{OUT}}" }
pattern: "<script[^>]+src=\"https?://"
match: not_contains
---
