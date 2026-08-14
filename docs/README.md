# Documentation Index

| File | Purpose |
|---|---|
| `CLASSIFIER_GUIDE.md` | Explains the dataset-backed classifier, stored outputs, privacy rules, and evaluation limits. |
| `UAT_TEST_PLAN.md` | Manual end-to-end checks for Customers, Commercial Department Staff, ECMD Staff, System Supervisors, Maintenance Personnel, security, and data integrity. |
| `OPERATIONS_GUIDE.md` | Explains departments, crews, shifts, service targets, escalations, imports, approvals, inventory, archival, and external notifications. |
| `keyword-dataset.xlsx` | Formatted dataset for review and thesis documentation. |
| `keyword-dataset.csv` | Editable dataset source. |
| `classifier-test-cases.csv` | Human-readable development test cases. |
| `classifier-evaluation-results.json` | Generated output from `npm run test:classifier`. |

The canonical runtime dataset and scoring configuration are stored under `server/src/data/` and `server/src/config/`. The frontend does not contain a duplicate classifier implementation; all authoritative classification is performed by the backend.
