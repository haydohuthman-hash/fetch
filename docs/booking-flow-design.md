# Home booking flow — design reference

This document aligns product language with code: [`TripSheetPhase`](../src/lib/booking/tripSheetPhase.ts), [`BookingFlowStep`](../src/lib/assistant/types.ts), and [`HomeView`](../src/views/HomeView.tsx) sheet cards.

## Route phases (`building_route` / `confirm_route`)

| Phase | When it appears |
| --- | --- |
| `building_route` | `flowStep === 'route'` and driving directions are not yet merged into state (brief gap before provisional route, or edge cases). Map may still show a straight placeholder. |
| `confirm_route` | Addresses + route metrics exist, `jobDetailsStarted` is false, and the user has not been advanced to the photo step yet (e.g. slower path without auto-advance, or non–drop-off jobs). Uber-style card: optional **Continue to photo scan**. |

**UX intent:** These are **transitional**, not a separate “product step” users must memorize. Copy should say what is happening (getting directions / review map) not internal enum names.

## Quote → pay → dispatch (`quote_loading` → `review_price` → `pay_checkout` → `dispatch_pending`)

| Phase | User sees |
| --- | --- |
| `quote_loading` | Post–items confirmation, pricing not ready: skeleton + “Building your quote”. |
| `review_price` | **Your quote** with totals, breakdown, **Book now** (or opens Stripe embedded checkout). |
| `pay_checkout` | Stripe `PaymentElement` visible; title **Pay to confirm**. |
| `dispatch_pending` | Payment succeeded, `bookingStatus === 'confirmed'`, driver matching not started or not yet shown as live. |

**Narrative:** Confirm items → **quote** → **pay** → **find driver**. Errors retry in place; payment failure keeps the user on the quote card with a clear message.

## Job-type checkpoints (parity)

| Checkpoint | Moving / delivery / heavy (with drop-off) | Junk removal |
| --- | --- | --- |
| Pickup address | Required | Required (single stop) |
| Drop-off | Required when `requiresDropoff(jobType)` | N/A |
| Route | Provisional line + Directions; gates `routeComputedReady` | Pickup-only route metrics where applicable |
| Items | Photo scan + confirm list (`jobDetailsScanStepComplete`) | Scan + access details + disposal + quote ack steps via assistant state |
| Quote / pay | Same sheet post-scan when `readyForPricing` | Extra gates: `junkAccessStepComplete`, `junkQuoteAcknowledged`, `junkConfirmStepComplete` before payment mode |

Shared primitive: [`bookingReadiness.ts`](../src/lib/assistant/bookingReadiness.ts) (`isRouteTerminalPhase`, `isJobDetailsPhase`, `readyForPricing`, junk-specific phases).

## Brain vs home sheet (voice-led booking)

| Surface | Role |
| --- | --- |
| **Home sheet** | Map-first wizard: addresses, route preview, photo scan, quote, **Book now**, live trip card. |
| **Brain** (opened via **Help** / camera / orb) | Conversational layer: clarifications, neural-field price preview (`fieldVoice*`), optional courtesy discount — does **not** replace sheet checkout for payment. |

Opening Brain from a trip card (`openBrainFromHome`) closes the sheet to `closed` and starts the tunnel → brain flow; the user returns to the map + sheet to finish structured steps.

## Matching & `match_failed`

- **Pool mode:** Copy explains open job listing; elapsed timer from `matchingMeta.matchStartedAt`.
- **Sequential mode:** Explains ordered offers; when `activeDriverId` is set, show **offer countdown** from `offerSentAt` + `offerTimeoutMs` when available.
- **`match_failed`:** Payment remains valid; primary CTA **Try finding a driver again**; secondary **Cancel booking**.

---

For automated tests of phase derivation, see [`tripSheetPhase.test.ts`](../src/lib/booking/tripSheetPhase.test.ts).
