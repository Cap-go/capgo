# Capgo Builder Promo Banner + Presentation — Design Spec

*Date: 2026-05-29 · Status: Draft for review*

## 1. Summary

An expansion (not acquisition) feature that drives existing paying Capgo
customers to try **Capgo Builder** (native iOS/Android cloud builds), a
capability already included in every paid plan but used by almost none of our
long-term customers.

It has two parts:

1. **A dismissible dashboard banner** shown only to long-paying customers who
   have never run a native build.
2. **A 5-slide animated presentation modal** that opens when the banner is
   clicked, explaining what Builder is, that it's already in their plan, how
   easy it is, the outcome, the security model, and a soft-but-assumptive close
   that drops them into the build flow.

The whole feature is **read-only** against customer data (it only reads
plan/eligibility and writes analytics events + a local dismissal flag).

## 2. Motivation & Audience (validated against production)

Queried prod (`stripe_info` + `orgs` + `build_requests`, project
`xvwzpoazmxkqosrdewyv`) on 2026-05-29:

- **624** orgs currently paying (`status='succeeded'`, `is_good_plan=true`, not
  canceled).
- **381** of those have been paying **≥ 3 months** (267 ≥ 6mo, 178 ≥ 12mo).
- **Of those 381, only 15 have ever run a native build — 366 have never tried
  Builder.** That ~96% gap is the opportunity.

The load-bearing marketing claim ("it's already in your plan, $0 extra") is
**true on every paid tier** — all include build minutes and concurrency ≥ 2:

| Plan | $/mo | Build time included / cycle | Concurrency |
|------|------|-----------------------------|-------------|
| Solo | 14 | 30 min | 2 |
| Maker | 39 | 60 min | 3 |
| Team | 99 | 5 hr | 4 |
| Enterprise | 249 | ~16.7 hr | 6 |

This resolves the factual caveat flagged in the source brainstorm
(`curated_ideas.md` #11/#13/#15/#16/#17): the "free to try within your plan"
premise holds across tiers.

## 3. Goals / Non-Goals

**Goals**
- Surface Builder to the precise segment most likely to convert (long-paying,
  never-built).
- Educate on advantages (ease, outcome, security) rather than pushing a CLI
  command mid-presentation.
- A/B/C test the highest-leverage copy via PostHog to learn what converts.
- Match existing console look, patterns, and the no-animation-library house
  style.

**Non-Goals**
- No acquisition/marketing-site work; this is in-console only.
- No changes to Builder itself (backend build pipeline, CLI, Builds tab).
- GSAP is added as a new dependency for the presentation's motion (see §8); no
  other new runtime deps.
- The presentation never asks the user to run a command inside the modal; the
  only action is the final CTA, which navigates into the existing Builds flow.

## 4. Targeting / Eligibility

The banner shows when **all** are true:

1. `currentOrganization.paying === true`
2. Org has been paying **≥ 3 months** — measured server-side from
   `stripe_info.paid_at` (fall back `COALESCE(paid_at, subscription_anchor_start)`).
   The frontend `get_orgs_v7.subscription_start` is the *billing-cycle anchor*
   (resets each cycle) and must NOT be used for this.
3. Org has **never run a native build** — no `build_requests` row for any of the
   org's apps.
4. Not dismissed on this device (localStorage flag — see §9).

### 4.1 Backend: eligibility endpoint

Signals 2 and 3 do not exist on the frontend today. Add a dedicated, low-traffic
private endpoint rather than expanding the hot `get_orgs_v7` RPC:

- **`GET /private/builder_promo?org_id=<uuid>`** (auth required; called once on
  dashboard mount).
- Returns:
  ```json
  {
    "eligible": true,
    "plan_name": "Maker",
    "build_minutes_included": 60,
    "primary_app_id": "com.acme.app"   // most-recent app, for CTA routing; nullable
  }
  ```
- Server computes `eligible` = paying ≥ 3 months AND never built. Plan name +
  minutes come from `plans` (via `stripe_info.product_id`; `build_time_unit`
  seconds → minutes).
- Must follow repo RLS/least-privilege conventions (see AGENTS.md). This path is
  NOT a plugin hot path; normal Supabase/primary access is acceptable. Do not
  query credits-ledger views from replicas.

> Personalization is **Lite**: real plan name + included minutes only. No live
> "minutes used" query, no command-with-app-id shown in the deck.

## 5. Architecture / Components

Follow existing patterns identified in the console:

- **Banner** — new `src/components/dashboard/BuilderPromoBanner.vue`, mirroring
  `src/components/dashboard/TrialBanner.vue` (azure house style, PostHog events
  on show/click/dismiss). Rendered in `src/pages/dashboard.vue` next to the
  existing `<TrialBanner />`.
- **Presentation modal** — new
  `src/components/dashboard/BuilderPresentationModal.vue`, mirroring
  `src/components/dashboard/DemoOnboardingModal.vue` (self-contained
  `open` prop + `close` emit, internal slide index, prev/next, dot indicators,
  Esc + arrow-key nav, mobile swipe, scoped `@keyframes` + `<Transition>`).
- **Slide sub-components** — one component per slide under
  `src/components/dashboard/builder-slides/` (Slide1Switch.vue …
  Slide5Rocket.vue) to keep each file small and focused.
- **Data** — banner + modal read plan name / included minutes / primary app id
  from the `/private/builder_promo` response (cached in a small Pinia getter or
  passed as props). No writes except analytics + dismissal.

### 5.1 Banner → Modal flow

```
dashboard.vue mount
  └─ fetch /private/builder_promo
       └─ eligible && !dismissed(localStorage)
            └─ render <BuilderPromoBanner>
                 ├─ click  → open <BuilderPresentationModal> (PostHog: opened)
                 └─ dismiss(×) → set localStorage flag, hide (PostHog: dismissed)
```

## 6. The 5 Slides (locked copy)

All slides use the split layout (branded visual left / copy right) for
consistency, except where noted. Animations are scoped CSS.

### Slide 1 — Hook: the switch
- **Left:** a large toggle labeled "Native builds", initially **OFF**, with a
  red hand-drawn curved arrow + "Click here to learn more" pointing at the
  knob (gentle bob). Clicking the switch (or Next) flips it **ON** (glow +
  ripple), then an expanding-circle ("iris") reveal originating from the switch
  transitions to slide 2.
- **Right (copy) — A/B/C test these three variants:**
  - **C (default):** *There's more in your plan than you're using.* — "Native
    iOS & Android builds are already part of your {Plan} subscription — {N} min
    every cycle. No Mac, no Fastlane, no extra bill."
  - **A:** *You're paying for native builds. You're not using them.* — "Capgo
    already ships your OTA updates. The same subscription also builds and signs
    your native iOS & Android apps — {N} min every cycle, no extra cost."
  - **F:** *You're paying for native builds. You're not using them.* — "It's the
    same subscription, doing more: build and sign native apps in the cloud, {N}
    min every cycle, included in your {Plan} plan."

### Slide 2 — Ease of setup
- **Left:** branded panel with a large animated checkmark (draw-on) + caption
  "Handled for you".
- **Right:** **"Nothing to set up. Capgo does the heavy lifting."** Lead: "All
  the machinery a native build normally needs — handled for you." Four
  green-check rows: Build machine & Xcode · Signing & certificates · Fastlane &
  tooling · CI pipeline. Footer: "Your only step: connect your app once."
- No command shown (teaches the benefit, not "do it now").

### Slide 3 — Outcome ("it just works")
- **Left:** two realistic **flat** phone mockups (iOS with dynamic island + tab
  bar + home indicator; Android with punch-hole + gesture pill), each running a
  sample app UI; platform pills ( iOS /  Android) below; caption
  **"Both platforms, one tool."** (Accurate: builds are per-platform but one
  tool/account/workflow — never "one build, both platforms".)
- **Right:** **"From code to a real app — in minutes."** Lead: "No pipeline to
  babysit. Capgo builds and signs your app in the cloud and hands back the
  result." Three checks: Signed for iOS & Android · Install on a real device
  with a QR code · Or ship straight to the App Store & Play.

### Slide 4 — Security (Shield visual)
- **Left:** shield + keyhole with a checkmark, glow, and a slowly rotating
  dashed "ephemeral" ring; caption "Used once, then gone."
- **Right:** **"Your signing keys never stick around."** Lead: "They're the most
  sensitive thing you'll ever hand us — so here's exactly how yours are
  handled:" Four checks, in this order:
  1. Never stored on our servers
  2. Used only during your build
  3. Inside an isolated, single-use environment
  4. Deleted automatically after each build

### Slide 5 — Soft close (rocket launch)
- **Left:** an inline **flat Noto rocket SVG** (yellow flame paths removed,
  engine bell kept), ~30% larger than default, centered. A CSS exhaust renders
  **behind** the rocket (lower z-index) so the fins overlap it for realism: a
  warm flame (white→orange→red gradient, chosen so it stays visible on the blue
  panel rather than blending) plus neutral smoke puffs. At idle the flame +
  smoke emerge from the engine bell between the fins, angled down-left along the
  rocket's axis (not vertical). On CTA click it plays a ~0.7s launch: the flame
  elongates smoothly (~0.55s ease-in, matching the rocket's acceleration), the
  jet swings further down-left (opposite travel), the rocket flies to the
  top-right corner with the trail behind it, and a smoke blast lingers at the
  pad — then it navigates to the Builds flow. Honor `prefers-reduced-motion`
  with a static rocket.
- **Right:** **"Everything's in place."** Lead (fixed first sentence): "Builds,
  signing, and delivery are handled for you. **{closing line}**"
  - **Closing line — A/B test (5 variants):**
    1. All that's left is your first build.
    2. Your first build is two minutes away.
    3. Time to run your first build.
    4. Start your first build now.
    5. Let's get your first build out.
  - **CTA button — A/B test (3 variants), white text on blue gradient:**
    A. Start my first build → · B. Build my app → · C. Start a build →
  - CTA behavior: play launch animation, then route to the **Builds tab**
    (`/app/<primary_app_id>/builds`, or the apps list if no primary app). The
    presentation never requires running a command itself.

## 7. PostHog Experiments

Ship all variants; let PostHog allocate and measure.

- **Experiment A — Slide 1 copy:** variants `C` (control) / `A` / `F`.
- **Experiment B — Slide 5 closing line:** 5 variants.
- **Experiment C — Slide 5 CTA label:** 3 variants.
  (B and C can run as independent single-factor experiments.)

**Events** (via existing `pushEvent`/`sendEvent` service):
`builder_promo_banner_shown`, `builder_promo_banner_dismissed`,
`builder_promo_opened`, `builder_promo_slide_viewed` (with index),
`builder_promo_cta_clicked` (with closing-line + CTA variant), and the eventual
conversion `native_build_started` (already trackable via `build_requests`).
Each event carries the assigned variant keys for attribution.

## 8. Animation Approach

**GSAP** drives the presentation's motion (added as an npm dependency:
`npm i gsap`, imported in the modal component — no CDN/SRI). The console ships
no animation library today, so this is a new, intentional dependency chosen for
the richer, sequenced "attention-grabbing" motion the deck needs. Idle ambient
loops (phone float, glow breathe, shield ring spin, switch ripple, rocket
flame flicker) stay as lightweight scoped CSS `@keyframes`; GSAP handles
*orchestrated* motion.

Key orchestration rules (validated in the prototype):

- **Transitions are crossfade + slight x-drift**, not a full block-slide. The
  outgoing slide fades out (~0.24s), then the incoming slide fades in (~0.4s)
  **and its content staggers in afterward** — so content never animates
  mid-transition (this was a real bug in the CSS-only version).
- **Per-slide entrance** runs once the slide lands: right-column items stagger
  (`gsap.from`, `y:14`, `stagger:.07`, `power3.out`); slide-2 checklist + drawn
  checkmark (`strokeDashoffset` 327→0); slide-3 phones pop (`back.out(1.5)`,
  staggered) then pills/caption; slide-4 shield scales in (`back.out`);
  slide-5 rocket scales in.
- **Always `clearProps`** transform/opacity after GSAP entrances so the CSS
  ambient loops (float/bob) resume — verified the phone/rocket transforms are
  cleared post-entrance.
- **Slide 1 switch**: knob flip ~0.22s; advance to slide 2 only *after* it
  settles (~360ms) so the flip and the transition never overlap.
- **Rocket launch** (slide 5 CTA): the launch itself can stay CSS keyframes
  (translate + flame elongation) or be a GSAP timeline; either way the jet
  swings down-left and the flame ramps over ~0.55s.
- **`prefers-reduced-motion`**: skip all GSAP entrances/transitions (instant
  slide swap), freeze the rocket, no flip animation.

## 9. Dismissal

localStorage flag (matches how the app already persists `lang` /
`capgo_current_org_id`); no schema change. Key:
`capgo_builder_promo_dismissed_v1`. Per-device by design (acceptable for v1). If
cross-device persistence is wanted later, migrate to a per-user/org column —
out of scope here.

## 10. i18n

All strings live in `messages/en.json` as flat kebab-case keys
(`builder-promo-*`); no inline `t()` fallbacks (repo rule). Interpolate plan name
and minutes (`t('builder-promo-s1c-sub', { plan, minutes })`). The three slide-1
copy variants and slide-5 line/CTA variants each get their own keys.

## 11. Testing against production (local)

The feature is read-only (reads plan/eligibility; writes only a PostHog event +
localStorage), so running the local frontend against the prod Supabase project
is low-risk.

- **Preview UI + Lite personalization against prod:** the `paying_since` /
  `has_native_build` signals require the new endpoint (not deployed pre-merge),
  so add a dev-only `?builderPromo=force` query override that renders the banner
  + modal with the current org's real plan data for visual QA against prod.
- **Validate the real gate:** seed a local org that is paying ≥ 3 months with no
  builds and confirm the banner shows; confirm it hides for never-paid, <3mo,
  and already-built orgs.
- **Impersonation:** to see it as a specific qualifying prod org, use
  platform-admin spoofing (read-only path) — never a write path.
- **E2E:** add a Playwright journey under `playwright/e2e` covering banner shown
  → open → navigate all 5 slides → CTA routes to Builds → dismissal persists.

## 12. File / Change List

- `src/components/dashboard/BuilderPromoBanner.vue` (new)
- `src/components/dashboard/BuilderPresentationModal.vue` (new)
- `src/components/dashboard/builder-slides/Slide1Switch.vue` … `Slide5Rocket.vue` (new)
- `src/pages/dashboard.vue` (render banner)
- `supabase/functions/_backend/private/builder_promo.ts` (new endpoint) + route wiring
- `messages/en.json` (new `builder-promo-*` keys, incl. all variants)
- PostHog experiment + event wiring via existing analytics service
- `gsap` added to `package.json` dependencies (imported in the modal component)
- `playwright/e2e/builder-promo.spec.ts` (new)

Visual reference mockups (HTML, not shipped) live under
`.superpowers/brainstorm/.../content/` — the end-to-end deck (GSAP) is
`slides-only.html`; individual slides are `slide1`–`slide5` (final rocket =
`slide5-rocket-v3.html`).

## 13. Open Questions

- **CTA destination when an org has multiple apps:** route to the most-recent
  app's Builds tab vs. an app picker. Default proposed: most-recent app; apps
  list if none/ambiguous.
- **Banner re-show policy:** dismissal is permanent per-device for v1. Do we
  ever want it to reappear (e.g., after N months if still never-built)? Out of
  scope unless requested.
