# Final-defense and production evidence gates

This file separates source-code/documentation fixes from evidence that must come from MRWD reviewers, respondents, hosted providers, or a controlled production-like environment. These items must not be invented or inferred from development tests.

## Final-defense evidence still requiring people/data

1. **Formal respondent evaluation** — administer the actual Google Forms to the planned IT/software validators, MRWD administrative/maintenance personnel, and customer respondents. Insert the actual respondent counts, response rates, weighted means, verbal interpretations, and discussion into Chapter 4.
2. **Independent classifier validation** — collect complaints not used to create the rules/dataset. At least two authorized MRWD reviewers independently label primary category, secondary issue, expected priority, and language features without seeing classifier output. Adjudicate disagreements before final-test scoring. Report per-category precision/recall/F1, macro/weighted measures, confusion matrices, high-priority recall, and challenging-language subsets.

The 35/35 development regression result is useful engineering regression evidence only; it is not an independent accuracy estimate.

## Completed controlled-environment verification

- The private-photo/FK-index migrations were applied to the configured Supabase project on September 9, 2026.
- The live private-photo policy check passed on September 10, 2026: anonymous public access denied; owner signed access allowed; cross-user signed/read/delete access denied; JPEG/PNG/WebP and 6 MB limits enforced; generated QA object removed.
- The post-migration Performance Advisor reported zero remaining unindexed foreign keys.

## Environment-dependent production evidence

- Enable Supabase leaked-password protection and record the hosted setting.
- Rerun Supabase Security and Performance Advisors; review any remaining multiple-permissive-policy finding without weakening RLS.
- Configure the MRWD-approved email/SMS provider and hosted scheduler; send only to controlled recipients and record receipt.
- Run and record one real browser → API → Supabase Storage completion-photo transaction, including authorized signed-photo read-back.
- Conduct an isolated backup restoration rehearsal using `docs/RECOVERY.md` and record the recovery evidence.

Until the remaining checks are complete, describe external notifications as **implemented and configuration-ready**, deployment as a **controlled demonstration**, and formal evaluation results as **pending**.
