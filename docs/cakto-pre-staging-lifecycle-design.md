# Cakto pre-staging lifecycle and persistence design

Status: `OFFICIAL_CAKTO_STAGING_ACCESS_MISSING`. This is design-only material.
It does not authorize a Cakto call, checkout, database write, migration,
entitlement change, or Premium activation.

## Current architecture and flow

| Step | Current classification | What exists today |
|---|---|---|
| Authenticated checkout request | IMPLEMENTED AND PRODUCTION | `POST /billing/checkout` validates one of three internal plans. |
| Checkout response | IMPLEMENTED BUT FAIL-CLOSED | `prepareCheckout` always returns `CHECKOUT_CORRELATION_NOT_VERIFIED`; no hosted checkout URL is returned. |
| CheckoutAttempt creation | IMPLEMENTED, NOT WIRED TO CONTROLLER | A tested helper generates a 32-byte Base64URL token, stores only SHA-256, sets 15-minute expiry, and can build a correlated URL. |
| Controlled script | LOCAL, PROTECTED | Can call the helper under its own controls, but must not be run, changed, or promoted now. |
| Hosted checkout and Cakto transaction | DEPENDS ON STAGING | No official staging URL or credentials exist locally. |
| Webhook authentication | IMPLEMENTED AND PRODUCTION | Shared secret is compared with length check and `timingSafeEqual`. |
| Webhook validation/persistence | IMPLEMENTED AND PRODUCTION | A sanitized event record is inserted; unknown events are marked processed. |
| Webhook correlation | IMPLEMENTED BUT FAIL-CLOSED | `sck` may find a pending, unexpired CheckoutAttempt, but the result is only a boolean candidate. |
| Provider read-back | IMPLEMENTED, NOT WIRED TO WEBHOOK | GET-only client validates Order, Subscription, and Offer with timeout, size limit, no retry, and redirect rejection. |
| Billing preparation | LOCAL CLASS C | Orchestrates injected GET methods and returns candidates/blocks; it has no persistence or Premium path. |
| Subscription lifecycle write | NOT IMPLEMENTED | Webhook never creates or updates Subscription. |
| ProviderOrder/payment ledger | NOT IMPLEMENTED | No model or relation exists. |
| UsageControl/Premium | IMPLEMENTED INDEPENDENTLY | Access is derived from existing Subscription status/period; webhook does not mutate it. |

The intended future flow is:

`checkout request -> CheckoutAttempt -> hosted staging checkout -> Cakto -> webhook -> authenticated capture -> identity/correlation -> provider GET read-back -> PaymentWebhookEvent + ProviderOrder -> Subscription transition -> effective entitlement`

Every arrow after CheckoutAttempt remains blocked until the corresponding
staging evidence and transactional design are approved.

## Fact matrix

`PROVEN_DOCUMENTATION` below means the locally encoded provider contract, not a
claim that staging behavior has been observed.

| Fact | Status | Source | Can be assumed? | Blocker | Evidence needed |
|---|---|---|---|---|---|
| Raw `sck` is generated locally | PROVEN_LOCAL | `generateCheckoutCorrelationToken` | Only for local generation | Provider transport unknown | Controlled staging comparison in memory |
| Only SHA-256 is persisted in CheckoutAttempt | PROVEN_LOCAL | `createCorrelatedCheckoutAttempt` tests | Yes, locally | None for local behavior | Regression tests remain required |
| CheckoutAttempt ownership is `userId` | PROVEN_LOCAL | Prisma schema/helper | Yes, locally | Provider association unknown | Staging `sck` round trip |
| CheckoutAttempt expires after 15 minutes | PROVEN_LOCAL | Billing service/tests | Yes, locally | Race at provider delivery | Observe realistic staging latency |
| Hosted checkout preserves `sck` | NEEDS_STAGING | None | No | Official staging missing | Initial checkout observation |
| Webhook returns the same `sck` | NEEDS_STAGING | None | No | Official staging missing | Sanitized webhook plus in-memory comparison |
| `webhook.data.id` type/shape | UNKNOWN | Webhook accepts bounded string; API Order requires UUID | No | Contract mismatch unresolved | Official schema and staging payload |
| `webhook.data.id == Order.id` | NEEDS_STAGING | None | No | Data ID semantics | GET Order by captured ID |
| `Order.sck == checkout sck` | NEEDS_STAGING | API schema contains optional `sck` | No | Transport semantics | In-memory hash-backed comparison |
| Order exposes a Subscription reference | PROVEN_DOCUMENTATION | Local API schema | Shape only | Runtime presence/meaning | Initial and renewal Order read-back |
| `Order.subscription == Subscription.id` | NEEDS_STAGING | Billing preparation assumption | No | Identity semantics | GET Subscription using Order reference |
| `Subscription.parent_order` exists | PROVEN_DOCUMENTATION | Local API schema | Shape only | Meaning unknown | Initial plus renewal observation |
| `Subscription.orders[]` exists | PROVEN_DOCUMENTATION | Local API schema | Shape only | Completeness/order unknown | Initial plus multiple renewal observations |
| Initial purchase relationship semantics | NEEDS_STAGING | None | No | `parent_order`/`orders[]` | One controlled initial transaction |
| Renewal relationship semantics | NEEDS_STAGING | None | No | New Order identity/cycle | At least one controlled renewal |
| Subscription product field exists | PROVEN_DOCUMENTATION | Local API schema | Shape only | Real ID mapping | Read Subscription/Offer for every plan |
| Subscription offer field exists | PROVEN_DOCUMENTATION | Local API schema | Shape only | Real ID mapping | Read Subscription/Offer for every plan |
| Subscription amount field exists | PROVEN_DOCUMENTATION | Decimal-string schema | Shape only | Tax/discount/gross meaning | Official definition and staging values |
| Offer recurrence fields may exist | PROVEN_DOCUMENTATION | Optional Offer schema fields | No lifecycle assumption | Optionality/meaning | All three offers read in staging |
| `currentPeriodStart` source | UNKNOWN | No authoritative mapping | No | Period semantics | Official field definition plus initial/renewal evidence |
| `currentPeriodEnd` source | UNKNOWN | No authoritative mapping | No | Period semantics | Official field definition plus initial/renewal/cancel evidence |
| Native event identity exists | UNKNOWN | Not in current webhook schema | No | Idempotency | Official webhook schema and redelivery sample |
| Provider event timestamp exists | UNKNOWN | `occurredAt` local column is nullable/unpopulated | No | Ordering | Official timestamp/version definition |
| Exact duplicate delivery behavior | NEEDS_STAGING | Local unique key handles only current composition | No | Identity not proven | Re-delivery observation/documentation |
| Divergent replay behavior | UNKNOWN | Current P2002 path does not compare prior hash | No | Conflict handling absent | Same identity/different payload test or official rule |
| Out-of-order behavior | UNKNOWN | No productive transition exists | No | Occurrence semantics | Documented ordering plus controlled scenarios |
| Refund semantics | NEEDS_STAGING | Event recognized; candidate only in class C | No | Order/cycle effect | Refund of initial and older renewal Order |
| Chargeback semantics | NEEDS_STAGING | Event recognized; candidate only in class C | No | Order/cycle effect | Chargeback of initial and older renewal Order |
| Cancellation semantics | NEEDS_STAGING | Event recognized; no business transition | No | Immediate vs period end | Provider state/period after cancellation |
| Pause/resume | UNKNOWN | Events recognized fail-closed | No | Business/provider semantics | Official behavior plus product policy |
| `late` status | PROVEN_DOCUMENTATION | API Subscription enum | No entitlement policy | Business rule missing | Provider behavior and business decision |
| `trial` status | PROVEN_DOCUMENTATION | API Subscription enum | No entitlement policy | Business rule missing | Provider behavior and business decision |
| Renewal refusal | UNKNOWN | Event recognized fail-closed | No | Retry/grace semantics | Official retry lifecycle and business rule |

## Future ProviderOrder ledger

`ProviderOrder` is preferable to a generic `Payment` initially because the
provider exposes Orders and a single Subscription can accumulate multiple
renewal Orders. A separate immutable payment-attempt ledger should be considered
only if the provider proves distinct payment/capture/refund objects that cannot
be represented by Order state and events.

| Proposed field | Classification | Rationale |
|---|---|---|
| `id` internal UUID | SAFE_NOW | Internal identity; no provider assumption. |
| `provider` | SAFE_NOW | Existing `SubscriptionProvider` supports Cakto. |
| `providerOrderId` | REQUIRES_STAGING | Field exists for API Order, but webhook identity/format must be proven. |
| `subscriptionId` nullable internal FK | OPTIONAL | Event quarantine may require null; whether every accepted Order must eventually have a Subscription depends on staging semantics. |
| `checkoutAttemptId` nullable FK | OPTIONAL | Initial Order may correlate to one attempt; renewals should normally be null. |
| `providerSubscriptionId` | REQUIRES_STAGING | Useful denormalized audit key only after Order/Subscription semantics are proven. |
| `providerProductId` / `providerOfferId` | REQUIRES_STAGING | Preserve commercial evidence per Order only if values are stable and useful. |
| `plan` snapshot | OPTIONAL | Internal interpretation at processing time; avoids historical config ambiguity. |
| provider `status` | REQUIRES_STAGING | Do not invent exhaustive transitions or map unknown status silently. |
| provider `type` | REQUIRES_STAGING | Expected subscription Order, but real initial/renewal values must be observed. |
| `amount` decimal | REQUIRES_STAGING | Meaning, sign, tax, discount, and refund representation are unresolved. |
| `currency` | REQUIRES_STAGING | Offer exposes optional currency; Order currency is not in the current contract. |
| `providerCreatedAt` | REQUIRES_STAGING | Current Order contract does not expose a proven creation timestamp. |
| `paidAt`, `refundedAt`, `chargedbackAt`, `canceledAt` | REQUIRES_STAGING | Fields exist in the local contract but semantics/time source require proof. |
| `firstSeenAt`, `lastSeenAt` | SAFE_NOW | Local audit timestamps, explicitly not provider occurrence time. |
| `lastEventOccurredAt` | REQUIRES_STAGING | Only valid with a provider-defined occurrence timestamp/version. |
| `lastPayloadHash` | OPTIONAL | Conflict detection aid; not an event identity or raw payload substitute. |
| raw payload | DO_NOT_STORE | Unnecessary PII/secret exposure. |
| raw `sck` or its hash | DO_NOT_STORE | CheckoutAttempt already owns the correlation hash; ledger need not duplicate it. |
| customer/payment instrument fields | DO_NOT_STORE | PII/PCI risk without lifecycle necessity. |

Candidate constraints, subject to migration review:

- `unique(provider, providerOrderId)` is justified once providerOrderId semantics are proven.
- Optional `unique(checkoutAttemptId)` prevents one attempt from owning multiple initial Orders, but is BLOCKED_BY_STAGING until retransmission/duplicate behavior is known.
- Index `(subscriptionId, paidAt)` supports ordered ledger reads.
- Index `(provider, providerSubscriptionId)` supports association/read-back if the provider ID is stable.
- Money must use a decimal/integer-minor-unit representation, never floating point.
- Provider status must be preserved separately from internal lifecycle status.

## Future cardinalities

| Relation | Proposed cardinality | Confidence |
|---|---|---|
| User -> CheckoutAttempt | 1 to 0..N | Existing and proven locally |
| User -> Subscription | 1 to 0..N | Existing and proven locally |
| User -> UsageControl | 1 to 0..1 | Existing and proven locally |
| Subscription -> ProviderOrder | 1 to 0..N; Order side initially nullable for quarantine | Architecture justified; exact requiredness depends on staging |
| CheckoutAttempt -> initial ProviderOrder | 0..1 to 0..1 | Depends on `sck` and initial-Order staging evidence |
| ProviderOrder -> PaymentWebhookEvent | 1 to 0..N; each event links to 0..1 Order | Depends on whether each event family is Order-scoped |
| Subscription -> PaymentWebhookEvent | 1 to 0..N; each event links to 0..1 Subscription | Depends on provider event semantics; nullable while quarantined |
| Subscription -> UsageEvent | 1 to 0..N optional attribution | Existing locally |

The event-to-Order link is nullable because some provider events may prove to be
subscription-level. This needs staging confirmation. The event-to-Subscription
link is also nullable while an event is quarantined/unassociated. ProviderOrder
must be the full initial-plus-renewal ledger; `initialProviderOrderId` on
Subscription alone would be insufficient for older refunds and chargebacks.

## Idempotency options

| Option | Advantages | Risks | Staging dependency | Duplicate/divergent/renewal behavior |
|---|---|---|---|---|
| A. Native provider event ID | Clean delivery identity; simple unique constraint | May be absent, scoped unexpectedly, or unstable | Prove presence, scope, and redelivery stability | Same ID+same hash = no change; same ID+different hash = conflict; every renewal event needs a distinct ID |
| B. `providerOrderId + eventType + cycle identity` | Ties effects to ledger entry | Cycle identity may be absent; multiple legitimate same-type events can collide | Prove Order and BillingCycle semantics | Duplicate only when all semantic components match; renewal uses its own Order/cycle |
| C. Versioned semantic key | Can support subscription-level events | Easy to invent an unsafe composition | Prove stable subscription ID, occurrence/version, and event cardinality | Must distinguish repeated pause/resume/cancel actions and never use `receivedAt` as identity |

Two idempotency layers are required:

1. Delivery idempotency: the same provider delivery is recorded once.
2. Business-effect idempotency: different event types referring to the same paid
   Order cannot activate/renew twice.

For an existing identity, equal canonical `payloadHash` is an identical
redelivery candidate. A different hash is `DIVERGENT_REPLAY`: record a conflict,
do not overwrite prior evidence, do not silently mark it as a normal duplicate,
and do not change entitlement.

## Ordering and replay decision machine

1. Authenticate and validate the bounded envelope.
2. Resolve a proven delivery identity; otherwise BLOCK.
3. If identity exists, compare canonical hash: equal -> NO_CHANGE; different -> REVIEW.
4. Resolve ProviderOrder/Subscription association; otherwise quarantine/BLOCK.
5. Resolve provider `occurredAt` or version; `receivedAt` is audit-only.
6. Compare against the last applied provider occurrence/version and Order effect.
7. Stale or out-of-order events cannot reverse newer state; REVIEW or perform an authorized GET-only read-back.
8. If provider current state disagrees with the event, require read-back and BLOCK mutation.
9. Apply a transition only inside one transaction after all evidence and business policies pass.

Examples:

- Refund/chargeback of an old Order updates that ledger entry first; its effect
  on current entitlement depends on a separately proven Order-reversal effect
  plus provider and business rules. Without that proof the result is REVIEW.
- Cancellation arriving after renewal must not erase the renewed period merely
  because it arrived later.
- Renewal arriving before purchase/subscription-created may create/associate a
  ledger candidate, but cannot skip ownership and initial-state validation.
- Pause/resume/refusal stay REVIEW until their provider and business semantics are defined.

## Lifecycle matrix

| Event | Required provider state | Required local state/evidence | Candidate action | Executable today? | Reason |
|---|---|---|---|---|---|
| `purchase_approved` | Verified eligible state | New verified Order, ownership, commercial mapping, authoritative period | ACTIVATE | NO | Staging semantics and persistence absent |
| `subscription_created` | Verified eligible state | Same business effect not already applied | ACTIVATE or NO_CHANGE | NO | Cross-event business idempotency unresolved |
| `subscription_renewed` | Verified active/current state | New renewal Order/cycle and authoritative period | RENEW | NO | Renewal evidence absent |
| `subscription_canceled` | Verified canceled state | Ordering and authoritative paid-through period | CANCEL_AT_PERIOD_END | NO | Cancellation/period semantics absent |
| `refund` | Verified refunded Order | Exact ProviderOrder and effect policy | REVOKE/REVIEW | NO | Old-Order refund effect unresolved |
| `chargeback` | Verified chargeback Order | Exact ProviderOrder and effect policy | REVOKE/REVIEW | NO | Old-Order chargeback effect unresolved |
| `subscription_paused` | Verified paused state | Defined pause entitlement policy | REVIEW/BLOCK | NO | Business rule absent |
| `subscription_resumed` | Verified active state | Prior pause and resume ordering | REVIEW/BLOCK | NO | Business rule absent |
| `subscription_renewal_refused` | Verified retry/late state | Retry/grace policy | REVIEW/BLOCK | NO | Provider and business rules absent |

Internal status guidance:

| Status | Current access behavior | Future lifecycle position |
|---|---|---|
| ACTIVE | Premium currently allowed | Only create/update from fully proven transactional processing |
| CANCELED | Premium until verified `currentPeriodEnd` | Requires authoritative paid-through boundary |
| EXPIRED | No Premium | Transition semantics require provider evidence |
| PAST_DUE / provider `late` | No Premium locally | Keep BLOCK until grace/retry policy exists |
| PAUSED | No internal enum today | BLOCK/REVIEW; do not map silently |
| TRIAL | No internal enum today | BLOCK/REVIEW; do not invent trial entitlement |
| INACTIVE | No internal enum today | BLOCK/REVIEW; mapping requires evidence |

## Billing-period matrix

| Candidate | Classification | Required proof before use |
|---|---|---|
| `Subscription.createdAt` | SUPPORTING | Provider definition that it equals first entitlement boundary |
| `Subscription.updatedAt` | UNSAFE | Generic mutation time must never define a period |
| `next_payment_date` | SUPPORTING | Prove timezone, inclusivity, retry/pause/cancel behavior; not automatically period end |
| `recurrence_period` | SUPPORTING | Cadence only; do not synthesize dates |
| `current_period` | UNKNOWN | Official type/unit/meaning plus initial and renewal samples |
| `BillingCycle.due_date` | SUPPORTING | Prove whether it is a boundary and which cycle it names |
| `BillingCycle.completed_at` | SUPPORTING | Completion is not automatically period start/end |
| `Order.paidAt` | SUPPORTING | Payment time is not automatically period start |
| BillingAttempt timestamps | UNSAFE | Retries/failures do not define entitlement |

Future options are: a documented explicit start/end pair; documented BillingCycle
boundaries; or a documented provider-current-period object. Each requires
matching observations for initial purchase, renewal, cancellation, and all plan
cadences. `paidAt + recurrence_period` and `next_payment_date = currentPeriodEnd`
remain prohibited assumptions.

## Class C billing-preparation audit

Correct and reusable pieces:

- pending/unexpired CheckoutAttempt validation;
- hash format and timing-safe in-memory correlation;
- exact Order identity/status/type checks;
- injected GET-only API interface;
- Order/Subscription/Offer identity checks;
- strict product+offer plan allowlist and deterministic price comparison;
- explicit authoritative-period input rather than inferred dates;
- provider failure normalization to BLOCKED;
- candidate-only output with no Prisma import or Premium write.

Assumptions/blockers:

- webhook `data.id` is assumed to be the Order lookup ID by the caller;
- `parent_order === order.id OR orders.includes(order.id)` does not distinguish
  initial purchase from renewal semantics;
- eligible Order statuses are caller policy and not yet proven per event;
- Offer type/interval/recurrence and Subscription amount are not validated;
- native event identity, divergent duplicates, ordering, and ProviderOrder
  business-effect idempotency are absent;
- refund/chargeback candidates require only checkout+Order confirmation in the
  current class-C decision, which is insufficient for production ledger effects;
- cancellation depends on a provider-state snapshot but no occurrence/version ordering exists.

Functions likely to remain: CheckoutAttempt validation, hash-backed Order
correlation, Offer/Subscription identity validation, explicit period validator,
and injected client orchestration. Lifecycle mapping and the combined
initial/renewal relation validator require redesign after staging. There is no
accidental Premium path today: the module only returns values and is not wired
to the webhook. It has no direct production host dependency, though a future
caller could inject the general configured client; that integration must be
guarded separately. Adding persistence now would be overengineering and unsafe.

## Future transaction boundary

One database transaction should eventually:

1. insert or lock the event identity;
2. compare the existing canonical hash on conflict;
3. lock the ProviderOrder by `(provider, providerOrderId)`;
4. lock the Subscription and associated CheckoutAttempt when applicable;
5. verify User ownership and commercial association;
6. verify provider occurrence/version and business-effect idempotency;
7. apply the permitted ProviderOrder transition;
8. apply the permitted Subscription/period transition;
9. complete CheckoutAttempt only for the proven initial Order;
10. make entitlement-visible state changes atomically;
11. mark the event processed with its outcome;
12. commit.

Any mismatch rolls back or leaves an explicitly quarantined event without an
entitlement mutation. Use unique constraints plus row locks/serializable checks
to handle simultaneous webhooks, duplicate renewal, concurrent refund, expiry
at correlation time, and an event arriving while the same Order is processing.
Network read-back must occur outside a long-held database transaction; its
result needs freshness/version checks when the short write transaction begins.

## Future migration proposal — design only

| Item | Classification | Notes |
|---|---|---|
| Add `ProviderOrder` model with internal ID/provider | SAFE_TO_DESIGN | No migration created now |
| Add provider Order identity and unique constraint | BLOCKED_BY_STAGING | Must prove ID scope/stability |
| Add Subscription 1:N ProviderOrder relation | SAFE_TO_DESIGN | Null quarantine path needs review |
| Add optional CheckoutAttempt relation | BLOCKED_BY_STAGING | Initial/renewal association semantics required |
| Add optional PaymentWebhookEvent -> ProviderOrder/Subscription FKs | BLOCKED_BY_STAGING | Some events may not be Order-scoped |
| Add provider status/type/amount/currency columns | BLOCKED_BY_STAGING | Exact semantics and nullability unknown |
| Add provider occurrence/version columns | BLOCKED_BY_STAGING | Authoritative source absent |
| Add conflict/outcome fields to webhook events | SAFE_TO_DESIGN | Prefer bounded enums/codes, not raw errors |
| Add lifecycle state/version for optimistic ordering | BLOCKED_BY_STAGING | Version/occurredAt strategy unresolved |
| Expand internal statuses for PAUSED/TRIAL/INACTIVE | BLOCKED_BY_BUSINESS_RULE | Do not map provider states automatically |
| Change UsageControl counters for Premium | NOT_NEEDED | Access already derives from Subscription; preserve free counters |
| Store raw webhook payload | NOT_NEEDED | Avoid PII/secret retention |
| Backfill ProviderOrder from historical events | BLOCKED_BY_STAGING | Existing `data.id` meaning is unproven; unsafe to infer |
| Backfill periods from existing dates | NOT_NEEDED | Would fabricate entitlement boundaries |

Compatibility strategy: add nullable relations first, keep existing Subscription
reads working, process only newly verified staging/production events after an
explicit cutover, and quarantine legacy rows that cannot be proven. No historical
Premium should be granted by backfill inference.

## Guard rails for a future sandbox run

The existing playbook already requires an official allowlisted staging host,
separate credentials, explicit staging flag and confirmation, production-host
and redirect rejection, normal TLS validation, GET-only read-back, zero retry,
timeouts, bounded bodies, no automatic browser, sanitized output, and no
Premium. Credential rejection must be fail-closed without logging the value.
Any future CheckoutAttempt write needs separate authorization and a staging-
isolated store; the evidence reader itself remains offline/GET-only and must
have no Prisma write capability.

If staging URL, credentials, simulator instructions, signing rules, or host
identity are absent or ambiguous: STOP. Production is never a fallback.

## WHAT WE NEED FROM CAKTO

1. Official staging API URL.
2. Official staging hosted-checkout URL.
3. Staging credential issuance and rotation process.
4. Official procedure for a simulated transaction without real payment.
5. Staging webhook registration/delivery procedure.
6. Staging webhook signature/authentication specification.
7. Exact semantics and type of `webhook.data.id` for every supported event.
8. Whether a native, globally/scoped unique event ID exists and how redelivery preserves it.
9. Authoritative event occurrence timestamp or monotonic version semantics.
10. Whether hosted checkout/webhook/Order preserve `Order.sck` unchanged.
11. Exact semantics and nullability of `Order.subscription`.
12. Exact initial and renewal semantics of `Subscription.parent_order`.
13. Completeness, ordering, and retention semantics of `Subscription.orders[]`.
14. How renewal creates Orders/BillingCycles and updates Subscription.
15. Staging product and offer IDs for MONTHLY, QUARTERLY, and ANNUAL.
16. Offer recurrence semantics for `type`, `intervalType`, `interval`, `recurrence_period`, and `quantity_recurrences`.
17. Authoritative fields for current-period start/end, including timezone and boundary inclusivity.
18. Duplicate-delivery guarantees and retry policy.
19. Replay behavior and whether the same event identity can carry a changed payload.
20. Event-ordering guarantees across purchase, renewal, cancellation, refund, chargeback, pause/resume, and refusal.

### Ready-to-send support message (Portuguese)

Olá, equipe Cakto. Estamos preparando uma integração segura e precisamos das
informações oficiais do ambiente staging: URLs da API e do hosted checkout;
processo de credenciais; procedimento de transação simulada; configuração e
assinatura do webhook; semântica de `webhook.data.id`, event ID nativo e
timestamp/versão de ocorrência; preservação de `sck`; relações entre Order,
Subscription, `parent_order` e `orders[]` na compra inicial e renovação; IDs de
produto/oferta staging e recorrência dos planos mensal, trimestral e anual;
campos autoritativos de início/fim do período; e garantias de duplicate, replay
e ordering para compra, renovação, cancelamento, refund e chargeback. Não
precisamos que enviem credenciais por esta mensagem—apenas o procedimento seguro
para obtê-las. Obrigado.
