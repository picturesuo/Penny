# Queue

## Now
- [x] Define Penny as a pressure-tested second brain, not just a startup idea critic.
- [x] Shape the personal idea wiki around first-class map objects: claim, assumption, evidence, counterargument, research, and open question.
- [x] Make the first use case visibly inspired by Karpathy’s LLM wiki, but built for pressure testing rather than passive storage.
- [x] Show how a wiki entry becomes a living reasoning map with unresolved gaps and next actions.

## Next
- [x] Build out stress testing as a separate product lane, not just an implied part of pressure testing.
- [x] Add concrete stress-test passes for weak evidence, contradictions, risky dependencies, and missing comparisons.
- [x] Track what Penny already challenged so future stress tests deepen the reasoning instead of repeating themselves.

## Later
- [ ] Build the learning feature so Penny can recommend the best next thing to learn from the current weakest branch.
- [ ] Connect learning recommendations to validation tasks, not generic reading advice.
- [ ] Close the loop from capture -> stress test -> learn -> act.

## Blocked
- [ ] No product blockers recorded yet.

## Discovered While Working
- [x] The current landing page framed Penny mainly as startup idea pressure testing and did not yet represent the second-brain, stress-testing, and learning structure.
- [x] The repo already has a lightweight tracker file, so the product direction can be kept explicit without adding new infrastructure.
- [x] The new-map flow was still framed as a generic idea prompt; shifting it to wiki-style capture is the smallest real product move toward the second-brain lane.
- [x] The map workspace needed to keep the original source entry visible; otherwise the second-brain framing faded once the user entered the map.
- [x] The in-app surfaces needed to say “personal idea wiki” more explicitly; leaving the LLM-wiki inspiration only on the landing page made the product frame feel inconsistent once users entered the app.
- [x] The judged map already exposed enough psychology and graph data to build a visible stress-test board without adding a new backend endpoint first.
