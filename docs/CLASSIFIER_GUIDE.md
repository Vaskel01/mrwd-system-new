# MRWD Dataset-Backed Complaint Classifier

The Hybrid Sentiment-Aware Priority Scoring Algorithm is an explainable, server-side decision-support component. It does not use a trained machine-learning language model.

## Outputs

For every submitted complaint, the backend can generate:

1. **Predicted complaint category** — such as Water Leak or Billing Concern.
2. **Category confidence indicator** — a transparent rule-based percentage derived from the strongest category evidence.
3. **Sentiment/urgency label** — Neutral, Negative, or Urgent.
4. **Priority score and class** — Low, Medium, or High.

The confidence value is a rule-based indicator, not a calibrated statistical probability.

## Canonical files

- `server/src/data/complaintKeywordDataset.json` — runtime keyword and phrase dataset
- `server/src/config/scoringConfig.json` — base scores, adjustments, caps, and thresholds
- `server/src/lib/priorityScoring.js` — authoritative classifier implementation
- `server/src/lib/textPreprocessor.js` — normalization, tokenization, stemming, and matching support
- `docs/keyword-dataset.xlsx` — formatted review copy
- `docs/keyword-dataset.csv` — editable review copy

The frontend does not contain a duplicate classifier. It submits the complaint to the API, and the backend calculates and stores the authoritative result.

## Dataset contents

The dataset contains 149 initial canonical entries. The added entries expand Filipino, Hiligaynon, synonym, and suggestive-phrase coverage. Each entry may include:

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
4. Normalize common word variants through deterministic stemming.
5. Ignore configured negated issues, such as “there is no leak.”
6. Preserve domain phrases in which “no” expresses the issue, such as “no water.”
7. Sum category evidence and select the strongest category.
8. Use the predicted category base severity when the mismatch threshold is reached.
9. Add the configured dataset, sentiment, and photo-evidence adjustments.
10. Bound the final score from 0 to 100.
11. Classify the result as Low, Medium, or High Priority.

## Formula and thresholds

```text
Final Priority Score = Base Severity
                     + Dataset Match Adjustment
                     + Sentiment Adjustment
                     + Photo-Evidence Bonus
```

- Neutral sentiment: `+0`
- Negative sentiment: `+5`
- Urgent sentiment: `+10`
- Attached complaint photo: `+10`
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

## Role visibility

- **Customer:** no classifier fields are returned.
- **Maintenance Personnel:** only the operational category and priority are returned.
- **Commercial Department Staff:** complete classifier analysis and controlled override controls are available for review.
- **System Supervisor:** complete classifier analysis remains available for oversight.

Commercial Department Staff may apply a controlled operational priority override. The override:

- requires a reason;
- preserves the latest classifier-generated score;
- clearly identifies the current score as manually overridden;
- records the previous and new values in the audit log; and
- can be restored to the classifier recommendation.

This is human decision support, not silent modification of the classifier output.

## Development evaluation

Run:

```bash
npm run test:classifier
```

The command evaluates the 25 labeled development cases and regenerates `docs/classifier-evaluation-results.json`.

The current development cases confirm deterministic behavior on the designed examples. They must not be presented as real-world classifier accuracy. Formal evaluation should:

1. Use a separate set of anonymized complaints.
2. Obtain independent category and priority labels from qualified MRWD reviewers.
3. Keep the evaluation set separate from dataset refinement.
4. Report category and priority results honestly.
5. Record disagreements before revising terms or weights.
