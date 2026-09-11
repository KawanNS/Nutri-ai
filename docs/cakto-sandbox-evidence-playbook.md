# Cakto sandbox/staging evidence playbook

Status of this preparation: `OFFICIAL_CAKTO_STAGING_ACCESS_MISSING`.

This document prepares a future, explicitly authorized experiment. It is not
authorization to run it. Never substitute `api.cakto.com.br` or
`pay.cakto.com.br` for staging, and never infer a staging URL.

**SE NÃO HOUVER URL E CREDENCIAL OFICIAIS DE STAGING: STOP. Não substituir
staging por produção.**

## Scope and sanitized output

The experiment must produce only the enum/boolean report represented by
`CaktoSandboxEvidence`. `UNKNOWN` means not tested, `TRUE` means directly
verified, and `FALSE` means tested and refuted. A missing observation is never
converted to `FALSE` or `TRUE`.

The public report must not contain names, email addresses, phone numbers,
documents, card data, authorization headers, access tokens, webhook secrets,
JWTs, raw `sck`, an `sck` hash, raw payloads, query strings, real provider IDs,
or exact timestamps that could identify a transaction. Raw values may only be
compared in memory by a future purpose-built tool; they must not be logged or
written to an evidence file.

The current validator returns only `BLOCKED` or
`READY_FOR_LIFECYCLE_DESIGN`. It can never return readiness for Premium.

## Billing-period evidence matrix

No candidate is currently authoritative. The classifications below remain
conservative until official documentation and controlled observations establish
precise semantics for initial purchase, renewal, cancellation, refund, and
chargeback.

| Candidate | Current class | Reason / evidence still required |
|---|---|---|
| `Subscription.createdAt` | SUPPORTING | May identify record creation, not entitlement-period start. Compare with provider-defined cycle boundaries. |
| `Subscription.updatedAt` | UNSAFE | A generic mutation timestamp can change for unrelated reasons. |
| `Subscription.next_payment_date` | SUPPORTING | A future charge date is not necessarily the current period end. Confirm timezone, inclusivity, pauses, retries, and cancellation semantics. |
| `Subscription.current_period` | UNKNOWN | The local response contract does not establish its shape or semantics. Obtain official schema and observe initial plus renewal cases. |
| `Subscription.recurrence_period` | SUPPORTING | Describes cadence at most; must never be used to synthesize period boundaries. |
| `Order.createdAt` | UNSAFE | Order creation can precede payment and entitlement. |
| `Order.paidAt` | SUPPORTING | Useful payment evidence, but not proven as the provider's period start. |
| `BillingCycle.due_date` | SUPPORTING | May be a due date rather than either current boundary. Confirm cycle identity and timezone. |
| `BillingCycle.completed_at` | SUPPORTING | May prove processing completion, not an entitlement boundary. |
| `BillingAttempt` timestamps | UNSAFE | Attempts can retry or fail and do not define subscription entitlement. |

Promotion to `AUTHORITATIVE` requires an official definition, a stable field or
pair of fields, and matching controlled evidence across the three configured
plans and lifecycle scenarios. No arithmetic based on `recurrence_period` is an
acceptable substitute.

## Event identity, idempotency, ordering, and replay

Production currently derives `providerEventId` as `eventType + ":" + data.id`.
That is safe only if the real semantics and stability of `data.id` are known for
every event family. This preparation does not alter that key.

The future decision must prefer a documented native unique event ID. If none
exists, an identity composition may be approved only after establishing which
stable provider identifiers exist for purchase, renewal, cancellation, refund,
and chargeback. Candidates to evaluate are provider Order ID, Subscription ID,
BillingCycle identity, event type, provider occurrence time, and a canonical
payload hash. `receivedAt` is useful for audit/order of receipt but cannot make a
redelivery idempotent. A payload hash can detect divergence but must not be used
alone when semantically identical deliveries can vary.

The policy must distinguish:

- exact redelivery: same verified identity and same canonical payload hash;
- divergent replay: same identity and a different canonical payload hash;
- new event: different verified identity representing a new provider action;
- stale event: older provider occurrence/version than already applied state.

Provider state fetched read-only must take precedence over webhook arrival order
where the provider documents it as current truth. A future persistence design
must use transactional uniqueness for identity, retain occurrence and receipt
times separately, reject divergent duplicates, and prevent an older event from
reversing a newer state. These criteria must be proven before changing the
production key or adding a ProviderOrder/payment ledger. No migration is part of
this preparation.

## Required staging configuration and guard rails

The current general API configuration is environment-injectable, but defaults
to the production API host. It therefore does not by itself safely separate an
evidence experiment from production. A future evidence-only runner should be a
new, offline-by-default entry point and require all of the following without a
bypass:

- an official Cakto staging API base URL supplied from an authorized source;
- separate official staging credentials;
- an explicit staging-only flag and an interactive explicit confirmation;
- exact rejection of `api.cakto.com.br`, `pay.cakto.com.br`, their subdomains,
  redirects to them, and any unapproved host;
- HTTPS with normal certificate and hostname validation; no `noproxy`, custom
  trust bypass, disabled TLS, or ignored certificate errors;
- no automatic browser opening;
- no POST/PUT/PATCH/DELETE through the evidence API client; only the documented
  GET queries after the simulated staging transaction;
- no payment submission by local tooling; the human uses only the official
  staging simulation documented by Cakto;
- timeouts, zero retries, redirect rejection, response-size limits, and
  sanitized error codes;
- in-memory comparison followed by a schema-restricted sanitized report.

Do not add the staging URL to source control. Until Cakto supplies its exact URL,
credential acquisition procedure, hosted-checkout URL, simulator/test-payment
instructions, webhook signing details, and data-retention rules, phase 0 must
STOP.

## Future experiment phases

Every command below is a descriptive placeholder. Replace it only from approved
project documentation after official staging access is received. Never paste a
secret into a shell command, screenshot, ticket, or report.

### Phase 0 — prerequisites

- Objective: prove that the environment is official staging and isolated from production.
- Future command: run the future evidence runner's local `preflight` action with
  configuration supplied through the approved secret store.
- Must appear: staging flag confirmed, official host allowlisted, production
  hosts rejected, TLS verification enabled, Git staging empty, and Premium
  mutation disabled.
- Never copy: URLs containing queries, credentials, tokens, webhook secrets, or
  secret-store output.
- PASS: all guard rails pass and the operator independently verifies the official source.
- FAIL: any preflight check reports an invalid or incomplete configuration.
- STOP: staging URL/credentials/instructions are absent, a production host is
  detected, or the protected script hash/checkpoint differs.

### Phase 1 — create a controlled CheckoutAttempt in the correct environment

- Objective: create one short-lived correlation attempt without granting entitlement.
- Future command: use the separately reviewed controlled-attempt procedure for
  the staging-isolated Nutri-AI environment; do not use the protected script
  until a later explicit authorization names it.
- Must appear: a success boolean, chosen plan classification, expiry present,
  and `premiumMutationOccurred: false`.
- Never copy: raw correlation token, its hash, database row, user identifiers,
  or connection details.
- PASS: exactly one pending, expiring attempt exists in the authorized staging-isolated store.
- FAIL: duplicate/expired attempt or non-sanitized output.
- STOP: the only available store is production, any entitlement changes, or
  write scope exceeds creation of the authorized attempt.

### Phase 2 — open the official staging hosted checkout

- Objective: determine whether hosted checkout preserves the controlled `sck`.
- Future command: none; the operator manually opens only the official staging
  checkout URL produced by the authorized procedure.
- Must appear: the official staging indicator and a sanitized observation state.
- Never copy: the full checkout URL, query string, raw `sck`, or customer data.
- PASS: staging identity is visible and later correlation can be compared in memory.
- FAIL: the checkout demonstrably discards or changes correlation.
- STOP: redirect to production, ambiguous environment, certificate warning, or
  automatic browser/tool navigation.

### Phase 3 — complete a simulated transaction

- Objective: generate one provider-defined test transaction without real money.
- Future command: none; follow Cakto's official staging simulator instructions manually.
- Must appear: explicit test/simulation status and no real charge.
- Never copy: card-like test input, payer data, receipt identifiers, or screenshots with PII.
- PASS: Cakto marks the operation as a staging simulation.
- FAIL: simulation is rejected while the environment remains safely staging.
- STOP: real payment method is requested, production branding/host appears, or
  test semantics are uncertain.

### Phase 4 — observe a sanitized webhook

- Objective: establish `sck`, `data.id`, native event identity, type, and timing semantics.
- Future command: run the future offline sanitizer against an ephemeral,
  access-controlled capture after signature verification; emit enum/boolean fields only.
- Must appear: signature-valid boolean, event class, `webhookSckPresent`,
  `webhookDataIdType`, and native-event-ID presence classification.
- Never copy: headers, signature, secret, raw body, payload hash, exact IDs,
  timestamps, or customer/payment fields.
- PASS: a valid staging webhook is reduced to the approved evidence schema.
- FAIL: expected fields are absent/refuted but the sanitized result is complete.
- STOP: signature cannot be verified, environment is ambiguous, or sanitizer
  attempts persistence/production delivery.

### Phase 5 — query Order read-only

- Objective: test whether webhook `data.id` retrieves the Order and whether
  Order correlation and Subscription reference match.
- Future command: invoke the reviewed staging evidence runner's `inspect-order`
  action; it may issue only the documented staging GET for the in-memory ID.
- Must appear: HTTP/schema success booleans and sanitized relation results.
- Never copy: request URL, bearer token, Order ID, `sck`, `sck` hash, response body, or PII.
- PASS: `data.id` retrieves the same Order and in-memory `sck` comparison succeeds.
- FAIL: a valid staging response refutes either relationship.
- STOP: redirect, non-GET attempt, oversized body, TLS failure, or production host.

### Phase 6 — query Subscription read-only

- Objective: verify Order-to-Subscription identity, initial/renewal membership,
  product/offer relations, and period candidates.
- Future command: invoke `inspect-subscription` in the future staging-only runner.
- Must appear: sanitized equality/membership states and presence/classification
  of period candidates.
- Never copy: Subscription/Order IDs, response body, dates, customer data, or access token.
- PASS: identity and documented relationship semantics are directly observed.
- FAIL: a relationship is tested and refuted.
- STOP: missing official endpoint semantics, production routing, write method, or raw logging.

### Phase 7 — query Offer read-only

- Objective: verify each configured plan's offer/product/price and real recurrence.
- Future command: invoke `inspect-offer` once per MONTHLY, QUARTERLY, and ANNUAL
  staging scenario using the future staging-only GET client.
- Must appear: equality booleans and presence/type classifications for `type`,
  `intervalType`, `interval`, `recurrence_period`, and `quantity_recurrences`.
- Never copy: real IDs, endpoint URL, response payload, token, or commercial private metadata.
- PASS: all three plan mappings and recurrence semantics are verified.
- FAIL: any tested mapping or expected price is refuted.
- STOP: a real transaction is required, endpoint redirects, or recurrence remains ambiguous.

### Phase 8 — validate relationships

- Objective: compare all transient values in memory and decide whether evidence is complete.
- Future command: invoke the local pure validator with the sanitized object.
- Must appear: `BLOCKED` plus blocker codes, or `READY_FOR_LIFECYCLE_DESIGN`.
- Never copy: the transient source objects or comparison operands.
- PASS: every critical field is `TRUE`/`VERIFIED`, including renewal and ordering/replay policy.
- FAIL: a tested relationship is `FALSE`.
- STOP: any field needed for a decision is unavailable; preserve it as `UNKNOWN` and remain blocked.

### Phase 9 — produce the sanitized report

- Objective: create a reviewable result containing only the fixed evidence schema.
- Future command: explicitly export validator output through a reviewed local
  serializer; automatic file writes remain prohibited unless separately authorized.
- Must appear: enum/boolean evidence, blocker codes, scenario counts if added to
  the schema, and no identifiers.
- Never copy: raw captures, logs, IDs, exact timestamps, URLs, secrets, hashes, or PII.
- PASS: schema validation succeeds and an independent secret/PII review finds nothing sensitive.
- FAIL: schema validation fails or critical evidence remains false/unknown.
- STOP: any forbidden field appears; destroy the unsafe draft according to the
  approved secure-data procedure and do not distribute it.

### Phase 10 — close without Premium

- Objective: end the experiment with no entitlement or production behavior change.
- Future command: run read-only postflight checks and the repository's safe unit tests.
- Must appear: `premiumMutationOccurred: false`, no Prisma/schema migration,
  production untouched, and final Git state reviewed.
- Never copy: database contents, secrets, external raw responses, or customer details.
- PASS: evidence is handed to design review and no entitlement was granted.
- FAIL: evidence is incomplete; retain `BLOCKED` and list exact blockers.
- STOP: any Premium/database/production mutation is detected; invoke the incident process.

## Objective readiness gate

`READY_FOR_LIFECYCLE_DESIGN` requires official staging verification; hosted and
webhook `sck` proof; UUID and Order semantics for webhook `data.id`; in-memory
Order correlation; correct Order/Subscription and initial/renewal relations;
product, offer, price, recurrence, and all-plan proof; a verified authoritative
period source; a native event ID or proven safe identity alternative; a verified
ordering/replay policy; and no Premium mutation. Any missing or refuted item is
`BLOCKED`. Even a passing report is only input to lifecycle and persistence
design; it is never authorization for Premium.
