# Manual Click-Through Proof

Date: May 23, 2026

Path verified in an isolated local Chrome profile against `http://localhost:3007`.

## Notes
- The in-app Browser plugin was available as a skill, but the `iab` browser surface was unavailable in this session.
- The Chrome extension browser surface was also unavailable.
- To avoid touching the user's live Arc/Gmail state, the manual pass used a temporary Chrome profile at `/tmp/penny-yc-manual-chrome`.
- Desktop screenshot capture was blocked by the local display API, so durable visual proof is the Playwright screenshot/video/trace set under `docs/proof/yc-recording/`.

## Click Path Completed
1. Public landing page opened at `http://localhost:3007`.
2. Clicked `Build with Penny`.
3. Confirmed Create opened with the YC fixture labels: Email fixture, Gmail-style context, Manual messages context, Founder notes, trainingUse=false.
4. Confirmed visible Canvas: Penny -> Brain sources -> Create options -> Learn explanation -> Export prompt.
5. Selected Personal, Valuable, and Critical.
6. Entered comment: `Manual browser pass: keep the founder-specific memory context, show the judgment changing the artifact, and export a clean YC-recordable spec.`
7. Clicked `Update artifact`.
8. Confirmed artifact changed to v2 and verification changed to Ready.
9. Clicked `Learn this`.
10. Clicked `Show how this applies to my artifact`.
11. Clicked `Back to Create`.
12. Confirmed selections, comment, artifact, evidence, and Canvas were preserved.
13. Clicked `Export prompt`.
14. Confirmed final status `Coding-agent prompt exported` and exported prompt contained `## YC Demo Spec`.
