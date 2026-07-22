# MRWD Dataset-Backed Complaint Classifier

## What changed

The previous implementation used a small keyword dictionary mainly to adjust a priority score. This version adds a structured keyword dataset and an explicit classification stage.

After the complaint description is analyzed, the classifier now returns:

1. **Predicted complaint category** — for example, Water Leak or Billing Concern.
2. **Category confidence** — a transparent rule-based percentage based on the strongest and second-strongest category evidence.
3. **Sentiment/urgency label** — Neutral, Negative, or Urgent.
4. **Priority class** — Low, Medium, or High, based on the final score.

## Dataset

The dataset contains 129 initial keyword and phrase rows. Each row includes:

- keyword or phrase
- word/phrase matching type
- related complaint category
- category classification weight
- priority adjustment weight
- severity label
- sentiment label
- context, source, and rationale
- negation behavior

Files:

- `docs/keyword-dataset.xlsx` — formatted workbook for review and thesis documentation
- `docs/keyword-dataset.csv` — editable CSV copy
- `server/src/data/complaintKeywordDataset.json` — canonical backend dataset
- `src/data/complaintKeywordDataset.json` — frontend preview copy

The dataset includes English and selected commonly used Filipino complaint phrases. It is an **initial domain-informed seed dataset**, not a final validated MRWD dataset. Before final deployment or accuracy claims, MRWD personnel should review the terms, categories, and weights using anonymized historical complaints.

## Classification flow

1. Normalize the complaint text.
2. Match longer phrases before individual words.
3. Stem remaining words so variants such as `leak`, `leaks`, and `leaking` share one root.
4. Ignore negated terms such as “not dangerous” or “no flooding.”
5. Add category evidence from the matched dataset rows.
6. Select the category with the strongest evidence and calculate confidence.
7. Use the classified category's base severity when the description strongly contradicts the customer-selected type.
8. Add or subtract dataset priority weights and the photo-evidence bonus.
9. Classify the final score as Low, Medium, or High.

Priority thresholds remain:

- **Low:** below 30
- **Medium:** 30–59
- **High:** 60–100

## Stored database fields

Run `supabase/dataset-backed-classification.sql`. It adds fields for:

- classified category
- confidence
- sentiment
- mismatch flag
- classification basis
- matched and negated keywords
- human-readable reasons
- classifier version and method

The complete classifier breakdown is displayed only to administrators. Maintenance personnel receive only the final assigned category and priority needed for field work, while customers receive no classifier output. The Admin All Complaints screen also includes **Classify Existing**, which reruns the classifier for older records after the migration is installed.

## Evaluation

The project contains 25 labeled seed test cases and a repeatable evaluation command:

```bash
cd server
npm run evaluate:classifier
```

The included seed tests currently score 100% for both category and priority. This only confirms that the implementation behaves as expected on the designed test set. It must not be presented as real-world model accuracy. A proper thesis evaluation should use a separate set of anonymized complaints labeled independently by MRWD staff.

Recommended final evaluation:

1. Collect anonymized historical or staff-written complaint samples.
2. Ask at least one qualified MRWD evaluator to label category and priority without seeing the system result.
3. Keep evaluation complaints separate from keyword/weight development.
4. Report category accuracy, priority accuracy, confusion matrices, precision, recall, and F1-score.
5. Document disagreements and revise the dataset only after recording the initial results.
