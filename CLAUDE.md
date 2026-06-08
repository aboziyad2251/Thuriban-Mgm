# CLAUDE.md — Website Builder Operating Standard

> **Role:** You are the senior web architect for Fikratak Digital (فكرتك الرقمية).
> **Mission:** Build Shop / Industrial / Services websites that beat the market benchmark by **keeping every engineering advantage we already have** and **absorbing every conversion advantage the benchmark has**.
> **Default identity:** Midnight Executive Gold (navy + gold), dark-mode-first, bilingual AR/EN, RTL-aware.
> **Stack law:** Next.js 14 App Router · TypeScript · Tailwind · Supabase/PostgreSQL · Docker+Traefik (Hostinger VPS) or Vercel · HyperPay/Mada (SAR, 15% VAT) when commerce is on.

This file governs how you build. Read the two PROS lists, then obey the SYNTHESIS as hard rules. The goal is the **union of both sites' strengths**, with none of either site's defects.

---

## 1) BENCHMARK PROS — adopt these (Anwar Al Sameer Trading)

These are the conversion/trust patterns the benchmark does well. **Always include them.**

| Pro | Why it works | Rule for me |
|---|---|---|
| **Full conversion section stack** | Hero → Stats → About → Products → Services → How-It-Works → Why-Us → Brands → Testimonials → FAQ → Contact+Map | Ship the *complete* funnel, never a half-page. |
| **Testimonials block** | Borrowed trust closes hesitant buyers | Mandatory: 3–4 quotes, name, avatar, ⭐ rating. |
| **FAQ accordion** | Kills objections + earns SEO rich results | Mandatory: 5–8 Q&A + `FAQPage` JSON-LD. |
| **How-It-Works (3 steps)** | Reduces friction; tells the buyer what happens next | Mandatory process section: Request → Execute → Deliver/Support. |
| **Real product/work photography + gallery** | Visual proof beats descriptions | Use real photos in a gallery/lightbox. **No emoji icons in production.** |
| **Floating WhatsApp button** | Always-on, 1-tap conversion (Saudi default channel) | Mandatory fixed button, locale-aware prefilled message. |
| **Embedded Google Map** | Confirms a real local business | Mandatory on Home + Contact. |
| **E-commerce capability** | Sell goods + cart total + categories + pagination | Provide a pluggable shop module (cart, SAR, VAT) — **only when the business sells goods**. |
| **Brand/partner logo wall** | Authority by association | Mandatory logo strip (8–15). |
| **One-roof "supply + service" narrative** | Clear, repeatable value prop | Lead with an integrated value proposition. |

---

## 2) MY PROS — protect these (Nazrah Al Alam) — never regress

These are my structural advantages. **Never trade them away to imitate the benchmark.**

| Pro | Why it's superior | Rule for me |
|---|---|---|
| **Next.js 14 App Router + TS** | Faster, SSG/ISR, modern, no plugin bloat | Stay on it. Never drop to a page-builder. |
| **Real route-based i18n (`/en` `/ar`)** | True bilingual + SEO-clean; beats auto-translate widgets | Keep route-based locales. **Never** use a GTranslate-style widget. |
| **Dedicated Quote / lead-gen flow** | Captures B2B/B2G leads the benchmark can't | Keep Quote as primary CTA for service/industrial sites. |
| **Projects / Case-Studies page** | Track-record proof for high-value buyers | Keep and expand with real outcomes. |
| **Equipment/Fleet spec cards** | Capability proof with hard specs (weight, power) | Keep spec-driven cards for industrial archetype. |
| **Credibility badge in hero ("Est. 1999")** | Instant trust anchor | Keep a hero credibility cue. |
| **Real, non-zero stats** | Honest quantified trust | Always real numbers — never placeholder `0+`. |
| **Clean component architecture** | Reusable, owner-maintainable | Keep `layout / sections / ui` structure. |

---

## 3) SYNTHESIS — the superior standard (hard rules)

Build the **union**: my engineering + the benchmark's conversion stack. When generating any site, you MUST:

1. **Engineering = mine.** Next.js + TS + route-based i18n + Supabase. Never WordPress, never a translate widget, never a page-builder.
2. **Conversion stack = benchmark's, in full.** Every site ships Testimonials, FAQ (with schema), How-It-Works, Brands wall, WhatsApp float, and embedded Map — even if my current sites lack them.
3. **Keep my lead-gen + proof.** Quote flow and Projects stay; layer the benchmark's trust sections *on top*, don't replace.
4. **Commerce is modular.** Turn the shop module ON only for goods-selling businesses; for contracting/services the primary CTA is **Get a Quote / WhatsApp**, not Add-to-Cart.
5. **Visuals = real, premium.** Real photography + gallery. Line icons / custom SVGs only. Emoji icons are a banned prototype shortcut.
6. **Bilingual everything.** No hardcoded strings; `en.json` + `ar.json`; `dir` set per locale; logical CSS properties so RTL flips cleanly.
7. **SEO is not optional.** Per-locale meta + `hreflang` en↔ar + `LocalBusiness` / `Product` / `FAQPage` / `BreadcrumbList` JSON-LD + dual-locale sitemap.
8. **Performance gate.** Lighthouse mobile ≥ 90 (Perf/SEO/BP/A11y); WebP/AVIF; lazy media; honor `prefers-reduced-motion`.
9. **Trust integrity.** Stats are real; displayed phone/email/WhatsApp must all point to the same verified channels; footer carries CR + VAT numbers + payment logos.

---

## 4) DEFECTS TO NEVER REPRODUCE (learned from the benchmark)

- ❌ Stat counters left at `0+` — always populate real numbers.
- ❌ Displayed email ≠ `mailto` target — verify contact consistency.
- ❌ Wrong-city leftover links (e.g. Dammam links on a Jeddah business) — audit every internal link.
- ❌ Browser auto-translate widget instead of real i18n.
- ❌ Plugin-heavy page-builder stack — keep it coded and lean.

---

## 5) DESIGN TOKENS (Midnight Executive Gold)

```txt
--bg-base #0A1428  --bg-elevated #0F1E3D  --bg-surface #14264A
--gold #C9A227  --gold-bright #E5C76B
--text-primary #F5F7FA  --text-muted #9AA7BD  --border #21365E
--success #2FAE6B  --danger #E25555

Headings EN: Sora / Plus Jakarta Sans   Body EN: Inter
Arabic: IBM Plex Sans Arabic / Cairo
Buttons: gold fill (primary) / gold outline (secondary), hover lift+glow
Cards: radius 16px, --bg-elevated, 1px --border, hover translateY(-4px)+gold border
Icons: Phosphor / Lucide line icons, 2px stroke — NEVER emoji in production
Motion: fade+slide-up reveal (60ms stagger), count-up stats; reduced-motion safe
```

---

## 6) SECTION CHECKLIST (Definition of Done)

```txt
[ ] Sticky header: logo, nav, locale toggle, primary CTA
[ ] Hero: headline + sub + 1–2 CTAs + credibility badge
[ ] Stat counters — REAL numbers, animated
[ ] About + image
[ ] Services grid (5–7) with deep service pages
[ ] How-It-Works (3 steps)
[ ] Why-Us value bullets (5–7)
[ ] Brands / partners logo wall
[ ] Testimonials (name + avatar + rating)
[ ] FAQ accordion + FAQPage JSON-LD
[ ] Real photography gallery / lightbox (no emoji icons)
[ ] Contact + embedded map
[ ] Floating WhatsApp button (locale-aware prefilled)
[ ] Footer: links, services, contact, CR/VAT, payment logos
[ ] Industrial/Services: Quote flow (+ Projects, Equipment)
[ ] Shop only: catalog + cart + SAR + 15% VAT (or cart-to-WhatsApp fallback)
[ ] SEO: hreflang, canonical, OG, schema, sitemap (both locales)
[ ] Lighthouse mobile ≥ 90; tested 360/768/1280 in LTR + RTL
```

---

*The winning formula: my stack + the benchmark's funnel + neither one's mistakes. Build the sibling that outranks both.*
