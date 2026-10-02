# Legal review brief

This brief is for the lawyer reviewing Axia before launch. It lists what the product does **today**, the questions that need a legal answer, and what we will change depending on those answers.

The draft policies are live on the site, marked as drafts:
- [`/terms`](../apps/web/app/terms/page.tsx)
- [`/privacy`](../apps/web/app/privacy/page.tsx)
- [`/refunds`](../apps/web/app/refunds/page.tsx)

Company details (legal name, address, Grievance Officer, jurisdiction, hosting) live in one place: [`apps/web/lib/legal.ts`](../apps/web/lib/legal.ts). Until they are filled in, they show as highlighted placeholders. After sign-off, set `isDraft: false` in that file to remove the draft banner.

## The product today (closed beta)
- **Games:** five skill games (memory, rule-switching, deduction, mental-math "boss fight", multi-stage puzzle mission), plus daily and weekly challenges, leaderboards, and "challenge a friend" share links.
- **Money:** free. No payments, no prizes, no rewards, no ads.
- **Sign-in and age:** Google sign-in only. Year of birth is **self-declared**. Under 14 is blocked; 14–18 gets a "Teen" mode; 19+ gets the standard mode.
- **Access:** invite codes, or a friend's challenge link.
- **Data processed:** see the Privacy draft. In summary:
  - Google profile: name, email, photo, ID
  - year of birth
  - gameplay moves, timings and scores
  - usage events: sign-up, game start/complete, shares
  - acquisition source: invite code, UTM tags
  - feedback
  - IP address, held for up to 10 minutes for rate limiting only
- **Storage and backups:** data is hosted on one VPS (provider and region to be confirmed). Backups are nightly `pg_dump` files, kept 14 days.

## Questions

### A. Online gaming law (highest priority)
The **Promotion and Regulation of Online Gaming Act, 2025** ("PROGA") is in force from **1 May 2026**, together with the Online Gaming Rules, 2026.
- PROGA bans "online money games": games where a user pays fees, deposits money or other stakes **expecting to win money or other enrichment**, whether the game is skill or chance.
- "Online social games" that charge only a subscription or access fee, with no expectation of monetary return, are generally permitted.

The business plan calls for:
- ₹249/quarter and ₹399/year subscriptions (5 games a day)
- ₹49, ₹99 and ₹149 one-off special challenges and missions
- a **rewards/benefits programme** with partners (movies, food, coffee, shopping)

Questions:
1. If rewards are linked to performance or rank, and the player has paid a subscription or challenge fee, does that make Axia an **online money game**? What about rewards linked only to participation, or rewards for free players only?
2. Are the **₹49/99/149 special challenges** permissible at all if any reward or benefit is attached? What if no reward is attached?
3. Can a pure **subscription for access** (more games per day, no rewards) be offered as an online social game?
4. Do we need to **register** with the Online Gaming Authority of India, or can we rely on not being notified for registration? Does our scale or our under-18 users change that?
5. What may **sponsored brand missions** offer (coupons, discounts) without creating "enrichment" for paying users?
6. What wording do we need in the Terms, and in marketing and advertising, to describe Axia accurately?

### B. Children's data (DPDP Act, 2023 and DPDP Rules, 2025)
Under the DPDP Act, a child is anyone under 18:
- Processing a child's data needs **verifiable parental consent**.
- **Tracking and behavioural monitoring** of children are restricted.

These obligations apply from **13 May 2027**.

Questions:
1. Does our Teen mode (ages 14–18) need verifiable parental consent now, or only from 13 May 2027? Which consent and verification method is acceptable for a small company (e.g. a parent's DigiLocker token, a parent's verified email, a one-time payment-instrument check)?
2. Which of our processing counts as "tracking or behavioural monitoring" for children?
   - per-user retention analytics
   - leaderboards
   - first-game retention
   - planned personalised recommendations

   Should we switch these off or aggregate them for under-18s?
3. **Age boundary:** product strategy puts 18-year-olds in the Teen mode, but the DPDP Act treats them as adults. Should we keep that, or should Teen mode be 14–17?
4. Is a self-declared birth year acceptable for **age-gating** under-14s, or do we need stronger verification?

### C. Other data protection obligations
1. What must our **consent notice** contain (DPDP Rules, notice requirements)? Is "By continuing you agree…" enough, or do we need an explicit checkbox and a separate notice?
2. What retention periods should we set for each data type? Is "erasure within 30 days of request" and "backups roll over in 14 days" acceptable?
3. What is our **breach notification** process and timeline (to the Board and to affected users)?
4. Is there any obligation to keep data **in India**? Hosting region is to be chosen.
5. Do we need a Data Protection Officer, or only a contact person for grievances?

### D. Platform obligations
1. Under the IT Rules, 2021, as amended, do we need a **Grievance Officer**? Are "acknowledge in 24 hours, resolve in 15 days" the right timelines to publish?
2. Which **user-generated content** rules apply? Our only user content is feedback, plus first names and scores on leaderboards and share pages.

### E. Payments and consumer law (before any paid launch)
1. **Payment gateway eligibility:** which category and MCC do we apply under? Will gateways accept us under PROGA?
2. **Auto-renewal:** what are the RBI e-mandate requirements (pre-debit notification, cancellation)?
3. **Refunds:** what do the Consumer Protection (E-Commerce) Rules, 2020 require us to publish? Is the drafted refund policy acceptable?
4. **GST:** what rate and invoicing apply to subscriptions and one-off challenges?
5. Should there be a cooling-off or free-trial period?

### F. Company and brand
1. Can "Axia" be registered as a trademark? Are there any conflicts with existing marks?
2. Which governing law and jurisdiction city should the Terms use? Should there be an arbitration clause?

## What changes depending on the answers
| If the lawyer says… | We change… |
| --- | --- |
| Paid access + rewards = online money game | Rewards only for free or skill play with no fee, or drop rewards from paid tiers; rework the pricing page |
| Teen mode needs parental consent now | Add a parent-consent step to onboarding for 14–17s, or close Teen mode until it is built |
| Behavioural analytics not allowed for children | Exclude under-18s from per-user analytics and first-game retention; aggregate only |
| Explicit consent needed | Add a consent checkbox and a separate notice at sign-up; record the consent timestamp and version |
| Data must stay in India | Choose an India-region VPS (Mumbai/Bangalore) and say so in the Privacy Policy |

## Sources consulted (October 2026)
- [Promotion and Regulation of Online Gaming Act, 2025 (Wikipedia)](https://en.wikipedia.org/wiki/Promotion_and_Regulation_of_Online_Gaming_Act,_2025)
- [MeitY notifies enforcement of the Act from 1 May 2026 (SCC Online)](https://www.scconline.com/blog/post/2026/04/23/meity-notified-enforcement-of-promotion-regulation-online-gaming-act-2025/)
- [Promotion and Regulation of Online Gaming Rules, 2026 (PIB)](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2254606&reg=3&lang=1)
- [Bill text (PRS India)](https://prsindia.org/files/bills_acts/bills_parliament/2025/Bill_Text-Online_Gaming_Bill_2025.pdf)
- [India's online gaming reset: decoding PROGA and the 2026 Rules (Legal 500)](https://www.legal500.com/developments/thought-leadership/indias-online-gaming-reset-decoding-proga-and-the-2026-rules/)
- [Trilegal update on the Act](https://trilegal.com/knowledge_repository/trilegal-update-the-promotion-and-regulation-of-online-gaming-act-2025-redrawing-indias-online-gaming-landscape/)
- [DPDP Rules: children's data and real-time tracking exemption (MediaNama)](https://www.medianama.com/2025/11/223-dpdp-rules-real-time-child-tracking-without-consent/)
- [DPDP Rule 10: verifiable parental consent](https://www.dpdpa.com/dpdparules/rule10.html)
- [Parental consent and behavioural monitoring under DPDPA (Tsaaro)](https://tsaaro.com/blogs/safeguarding-minors-online-understanding-parental-consent-obligations-and-behavioural-monitoring-restrictions-under-the-dpdpa-and-dpdp-rules)

These are summaries for orientation only. The lawyer's reading of the primary texts governs.
