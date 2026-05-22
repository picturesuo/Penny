# Gmail Privacy Notes

This document is the Gmail-specific privacy and compliance companion to `docs/gmail-staging.md`. It describes the current implemented behavior and the requirements that must remain true before any broader release.

## Requested Scope

Penny requests exactly one Gmail scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Why Penny needs it:

```text
read email for private Brain memory and email search.
```

Penny must not request:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/gmail.send`
- `https://mail.google.com/`

`gmail.readonly` is a restricted Google scope. Penny must stay unavailable for public production Gmail use until Google verification, domain verification, privacy review, and any required security assessment are complete.

## What Penny Stores

After explicit user consent and sync, Penny stores private Brain memory derived from Gmail messages:

- Message source reference: provider, surface, message id, thread id, source URI, Gmail URL, and connection provenance.
- Message metadata: subject, sender, recipients, cc recipients, date, Gmail labels, snippet, attachment presence, attachment metadata, historyId, and scope audit reason.
- Message text used for private Brain memory: normalized subject/from/to/cc/date/labels/thread/message ids/snippet/body text.
- Brain chunks and memory nodes derived from that normalized text.
- Sync cursor/historyId when Gmail returns it.

Penny caps Gmail sync by message count, page count, encoded body size, normalized body size, and total Gmail `sizeEstimate`. Oversized messages are reported as partial sync failures and are not imported into Brain memory.

All Gmail imports use:

```text
trainingUse=false
rawRetention=false
visibility=private_user_memory
retrievalAccess=enabled until revoke or delete
```

## What Penny Does Not Store Or Do

Penny does not:

- Send email.
- Compose drafts.
- Modify labels, archive, delete, mark read, or otherwise mutate Gmail.
- Request full mailbox control.
- Fetch attachment bodies.
- Store Gmail data for global model training.
- Claim human review.
- Claim hidden or background Gmail access before consent.
- Search across another user's Gmail connection or Brain memory.
- Store keyword search results as Brain memory unless `sync=true` is explicitly requested.

## Raw Retention

Gmail import sets `rawRetention=false`. The connector imports normalized content into private Brain memory but does not intentionally keep raw source files or raw email blobs as retained user uploads.

Connector source refs keep enough provenance to explain retrieval and support delete/revoke. Production logs must not include raw email body text, Gmail API payloads, headers, HTML, metadata/provenance blobs, snippets, subjects, sender/recipient fields, or token-shaped values. Logs may include safe operational facts such as counts, source ids, job ids, status, and error codes.

Create prompt export must not include raw Gmail body markers, connect links, session tokens, hidden-access claims, global-training claims, or human-review claims beyond the allowed `No human review` privacy copy.

## Search Behavior

Keyword search uses Gmail's `users.messages.list` query string and returns message refs/snippets. Supported filters:

- `text`
- `from`
- `to`
- `subject`
- `label`
- `after`
- `before`
- `hasAttachment`
- `maxResults`

Keyword search does not store new content unless the request includes `sync=true`.

Semantic search searches only synced Penny Brain memory whose connector source surface is `google_gmail`. Normal UI responses must hide raw numeric scores and return:

- subject
- sender
- date
- snippet
- messageId
- threadId
- sourceRef
- memoryRef
- grounded/inferred label
- scoreReason

If there is no synced Gmail memory, the user-facing state is `Sync Gmail first.`

## Delete And Revoke

Revoke:

- Calls Nango revoke for the Gmail connection.
- Marks the Gmail connector connection revoked.
- Stops future sync/search for that connection.
- Removes retrieval access for synced Gmail connector source refs.

Delete Gmail source:

- Deletes the selected private Brain source and its chunks/memory nodes from retrieval.
- Marks the connector source ref deleted or unavailable.
- Prevents deleted Gmail evidence from appearing in Brain retrieval, Create evidence, and prompt export.

## User-Facing Copy

The Brain Gmail panel must show:

```text
Penny reads Gmail only after consent. No human review. trainingUse=false. Delete/revoke removes retrieval access.
```

Do not add broader claims such as "we never store email" or "Google verified" unless the implementation and compliance status make those claims true.

## Compliance Risk

Before public production Gmail use:

- Complete Google OAuth app verification for `gmail.readonly`.
- Confirm whether a third-party security assessment is required for the chosen release posture.
- Publish/verify privacy policy and app domain with Google.
- Keep least-privilege scope review documented.
- Keep delete/revoke behavior test evidence.
- Keep production auth, rate limits, and structured safe logging enabled.
- Keep no-training and no-human-review claims aligned with actual subprocessors and operations.
