# ARCHIVE PRO — Artist Edition | Release policy preflight
2026-11-24 KST · Lumera · REVIEW ONLY — not a release authorization

## Baseline and evidence
Preserve current production main, all artwork records and existing UI. No production deployment, live data changes, signing, paid CI or store submission authorized by this audit.
ELSOL screenshot reports 2,526 artworks / 7 sections, payment UI 11/11, Functions 187/187, additional screen combinations 60/60; these are reported results, not independently rerun. Latest laptop patches, signed binaries and test evidence were not accessible in this session. Never use earlier unsigned binary as proof of later payment patch.

## Findings from current main
- privacy/index.html, support/index.html, delete-account/index.html exist. Public HTTP status was not verifiable from this environment.
- terms/index.html and app/terms/index.html are absent from current main; exact canonical terms URL must be reconciled with latest laptop draft.
- Privacy and account deletion pages explicitly state in-app subscriptions are unavailable; privacy also describes web-only Stripe processing. Reconcile these with actual release billing implementation before publishing.
- Support has a mail-based content report category and a published 24-hour review commitment. Verify staffing, in-app reporting, blocking and moderation independently.
- Privacy states no signups under 14. Reconcile minimum account age, store age rating, actual age gating and jurisdictional requirements; do not confuse age rating with signup eligibility.
- Current main app/index.html did not expose literal terms/privacy/delete-account/support route strings or subscription/report/block keywords in static inspection. Latest native/local patch may differ; inspect actual release candidate.

## Release gates
1. Import existing ELSOL KR/EN terms draft and versioned consent UI; do not overwrite latest laptop changes. Terms and community rules must clearly prohibit objectionable content and specify reporting and moderation. Record consent before UGC upload. Publish only after owner approval. Check canonical URL, locale variants, accessibility, HTTP 200, app and listing links.
2. Reconcile privacy, account deletion, support and terms with final billing architecture. Disclose only actual processors/data, retention, purpose, cancellation/refund procedures, and pricing at point of purchase. Preserve mandatory consumer rights. If native billing is enabled, describe relevant Apple/Google subscription management; deletion does not automatically cancel platform subscriptions. Verify data deletion from inside app and via web pathway.
3. Test actual in-app content/user report, blocking and objectionable content filtering/moderation. Verify authorization, privacy, rate limits and deletion paths. Do not claim support email alone suffices.
4. Verify server-authoritative entitlement for valid/invalid/expired/revoked transactions, replay, duplicate callbacks, account mismatch, offline/reconnect and restore. Ensure subscription cancellation retains only the approved Once Artist Always Artist functionality (Bio, existing PDF and QR use; upload/manage locked), subject to account deletion and lawful moderation. Confirm actual store billing vs permitted exceptions by storefront.
5. Rebuild Android from the exact verified payment/consent patch; record commit, artifact SHA-256, bundletool validate, target SDK, 16KB checks, signing status. Test actual Google sandbox purchase/restore/cancel; do not mark simulated tests as actual purchase.
6. Build iOS on approved Xcode/macOS, confirm current SDK, signing, PrivacyInfo.xcprivacy and StoreKit sandbox flows. No claims of successful iOS build without evidence.
7. Real device VoiceOver/TalkBack, keyboard and large text checks; screen matrix includes older and current iPhone, iPad, Android phones/tablets/foldables, landscape and major browsers. Preserve Golden Baseline; record PASS/FAIL/BLOCKED/NOT RUN individually.
8. Prepare final store review materials, review demo account, data safety/privacy answers, age/content rating, pricing/subscription disclosure, support and account deletion URLs; reconcile against actual build and SDKs.
9. Owner-only final batch: legal/billing/moderation approval; account authentication/signing/Mac access; approved operational deployment and actual submission. Never request secrets in chat. Do not submit incomplete or unverified binary.

## Official references checked 2026-11-24
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/ (1.2 UGC, 3.1 payments, account deletion and review requirements)
- Apple subscriptions: https://developer.apple.com/app-store/subscriptions/
- Apple review access: https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- Google UGC: https://support.google.com/googleplay/android-developer/answer/9876937
- Google subscriptions: https://support.google.com/googleplay/android-developer/answer/9900533/
- Google account deletion: https://support.google.com/googleplay/android-developer/answer/13327111

Current disposition: BLOCKED pending exact latest laptop candidate, policy approval, implementation verification, signing and real-device/store sandbox evidence. This document is not approved terms or a claim of compliance.
