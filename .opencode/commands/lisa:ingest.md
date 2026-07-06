---
description: "Ingest source material into the LLM Wiki. With an argument (URL, file path, or prompt) ingest that one source; with no argument run a full ingest across every enabled non-external-write source. Routes to the right connector and runs the ordered pipeline (source note → synthesis → index → log → verify → state → commit/PR)."
---
Use the lisa-wiki-ingest skill to ingest into the wiki: route the input to the right connector (or, with no argument, run a full ingest across all enabled non-external-write sources), then run the ordered pipeline — sanitized source note, synthesis with citations, index, log, verification, and state advancement, then commit/PR per policy. $ARGUMENTS
