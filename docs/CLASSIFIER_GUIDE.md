# MRWD Dataset-Backed Complaint Classifier

The Hybrid Sentiment-Aware Priority Scoring Algorithm is an explainable, server-side decision-support component. It does not use a trained machine-learning language model.

## Outputs

For every submitted complaint, the backend can generate:

1. **Predicted complaint category** — such as Water Leak or Billing Concern.
2. **Category confidence indicator** — a transparent rule-based percentage derived from the strongest category evidence.
3. **Sentiment/urgency label** — Neutral, Negative, or Urgent.
4. **Priority score and class** — Low, Medium, or High.
5. **Secondary issue evidence** — other supported complaint categories, category competition, and review guidance.

The confidence value is a rule-based indicator, not a calibrated statistical probability.

## Canonical files

- `server/src/data/complaintKeywordDataset.json` — runtime keyword and phrase dataset
- `server/src/config/scoringConfig.json` — base scores, adjustments, caps, and thresholds
- `server/src/lib/priorityScoring.js` — authoritative classifier implementation
- `server/src/lib/textPreprocessor.js` — normalization, tokenization, stemming, and matching support
- `server/src/lib/classifierEvaluation.js` — per-category and per-priority evaluation metrics
- `server/src/lib/labelledComplaintData.js` — validated CSV/JSON labelled-data intake
- `docs/keyword-dataset.xlsx` — formatted review copy
- `docs/keyword-dataset.csv` — editable review copy

The frontend does not contain a duplicate classifier. It submits the complaint to the API, and the backend calculates and stores the authoritative result.

## Dataset contents

The dataset contains 149 initial canonical entries. The added entries expand Filipino, Hiligaynon, mixed-language synonym, and suggestive-phrase coverage. Each entry may include:

- word or multi-word phrase
- synonyms and lexical alternatives
- suggestive phrases that imply an issue without naming it directly
- matching type
- related complaint category
- category classification weight
- priority adjustment weight
- severity label
- sentiment label
- context, source, and rationale
- negation behavior

The dataset includes English and selected commonly used Filipino complaint phrases. It is an **initial domain-informed dataset**, not a final MRWD-validated dataset. Formal review should use anonymized historical or staff-written complaints.

## Classification flow

1. Normalize the complaint text.
2. Expand each canonical entry into its configured synonyms and suggestive phrases.
3. Match longer phrases before individual words.
4. Normalize accents, contractions, and common word variants through deterministic stemming.
5. Expand a deliberately small list of unambiguous complaint abbreviations, such as `wtr` → `water`, `mtr` → `meter`, and `brgy` → `barangay`.
6. Allow one missing, substituted, inserted, or transposed character inside multi-word dataset phrases. Single words are not fuzzy-matched, which limits false positives.
7. Keep negation inside punctuation and contrast-clause boundaries.
8. Recognize English, Filipino, and Hiligaynon negation while preserving domain phrases in which “no” or “wala” expresses the issue, such as “no water.”
9. Continue scanning after a negated occurrence so a later positive report can still match.
10. Sum category evidence and select the strongest category.
11. Retain the customer-selected category when text evidence is below the configured confidence threshold, avoiding unsafe routing from one weak term.
12. Keep category confidence (absolute evidence strength) separate from category dominance (competition between the top two categories).
13. Report sufficiently supported secondary categories, ambiguity, and cross-workflow review guidance without silently replacing the primary category.
14. Use the predicted category base severity when a confident mismatch is found.
15. Add the configured dataset, sentiment, and photo-evidence adjustments.
16. Apply a small capped mitigation when a severe symptom is explicitly denied; this cannot erase stronger positive emergency evidence.
17. Bound the final score from 0 to 100 and classify it as Low, Medium, or High Priority.

## Formula and thresholds

```text
Final Priority Score = Base Severity
                     + Dataset Match Adjustment
                     + Negated-Evidence Mitigation
                     + Sentiment Adjustment
                     + Photo-Evidence Bonus
```

- Neutral sentiment: `+0`
- Negative sentiment: `+5`
- Urgent sentiment: `+10`
- Attached complaint photo: `+10`
- Explicitly denied severe symptom: up to `-5`
- Low Priority: `0–29`
- Medium Priority: `30–59`
- High Priority: `60–100`

## Stored database fields

Run `supabase/dataset-backed-classification.sql` before using stored classifier analysis. It adds fields for:

- predicted category
- confidence indicator
- sentiment
- mismatch flag
- classification basis
- matched and negated terms
- human-readable reasons
- classifier version and method

Secondary categories, ambiguity, dominance, and review recommendations are derived from the stored matched-term evidence when a complaint is read. This keeps existing installations compatible and does not require another database migration.

## Role visibility

- **Customer:** no classifier fields are returned.
- **Maintenance Personnel:** only the operational category and priority are returned.
- **Commercial Services Staff:** complete classifier analysis and controlled override controls are available for review.
- **System Supervisor:** complete classifier analysis remains available for oversight.

Commercial Services Staff may apply a controlled operational priority override. The override:

- requires a reason;
- preserves the latest classifier-generated score;
- clearly identifies the current score as manually overridden;
- records the previous and new values in the audit log; and
- can be restored to the system-suggested priority.

This is human decision support, not silent modification of the classifier output.

## Development evaluation

Run:

```bash
npm run test:classifier
```

The command evaluates the labelled development cases—including clause boundaries, contractions, local-language negation, mixed-language abbreviations, conservative typo matching, multi-issue evidence, repeated terms, and weak-evidence routing—and regenerates `docs/classifier-evaluation-results.json`.

The current development cases confirm deterministic behavior on the designed examples. They must not be presented as real-world classifier accuracy. Formal evaluation should:

1. Use a separate set of anonymized complaints.
2. Obtain independent category and priority labels from qualified MRWD reviewers.
3. Keep the evaluation set separate from dataset refinement.
4. Report category and priority results honestly.
5. Record disagreements before revising terms or weights.

The development report now includes per-class precision, recall, F1, confusion matrices, expected-label distribution, macro F1, weighted F1, and warnings for small or imbalanced category samples. Macro F1 should be emphasized when one complaint category is much more common than another.

## Independent labelled-data evaluation

Prepare a UTF-8 CSV or JSON array with these fields:

```text
id,split,selected_type,description,has_photo,expected_category,expected_priority
```

- `id` must be unique.
- `split` must be `development`, `validation`, or `test`.
- category labels must exactly match the configured MRWD complaint types.
- priority must be `low`, `medium`, or `high`.
- labels should be assigned independently by qualified reviewers before looking at classifier output.
- descriptions should be anonymized before they enter the evaluation file.

Evaluate the labelled file with:

```bash
npm run evaluate:labelled -- path/to/labelled-complaints.csv path/to/evaluation-report.json
```

The generated report deliberately omits complaint descriptions. It reports overall results and separate results for every supplied split.

## Threshold calibration

After the labelled file contains a non-empty `validation` split, run:

```bash
npm run calibrate:classifier -- path/to/labelled-complaints.csv path/to/calibration-report.json
```

The calibration command searches conservative alternatives for the Low/Medium/High thresholds, a global dataset-weight scale, sentiment adjustments, photo bonus, and negated-evidence mitigation. It selects candidates using validation priority macro F1, then evaluates the chosen candidate once on the optional held-out `test` split. It never changes `scoringConfig.json` automatically.

Keyword and category weights still require qualified MRWD judgement and enough independently labelled examples per category. If any category has fewer than five examples, its metric is explicitly flagged as unstable; substantially more examples are recommended before operational calibration.

Because this classifier is rule-based, it does not learn category popularity from the input dataset and does not automatically favor a category merely because it appears more often. Uneven real-world categories still affect evaluation, so reports include support counts, imbalance ratios, macro F1, weighted F1, and per-category confusion matrices. Validation and test sets should preserve realistic frequencies while still containing enough examples to judge every category.
