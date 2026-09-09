# MRWD service accounts

Customer Billing now supports multiple verified service connections per login. Account numbers are text; leading zeros and dashes are preserved. There is no live connection to MRWD's billing software.

## Getting started

1. Commercial Services opens Accounts & Billing and imports the official customer account list. Keep account-number cells formatted as text when exporting spreadsheets. The included SAMPLE files are demonstration templates, not MRWD records.
2. Import billing CSVs for those accounts. The customer does not need to have registered. Matching account number + billing period updates the existing bill; it does not intentionally create another bill. Use a consistent period convention, such as YYYY-MM. Amount due must be the outstanding amount for that individual bill, not a cumulative account balance that repeats prior bills. Supported status values are paid and unpaid; partial-payment and adjustment ledgers are not implemented.
3. Customers open Billing → Link another service account. They enter their account number and relationship to the account. This creates a pending request, not billing access.
4. Commercial Services independently verifies ownership/authorization using MRWD records, records the verification method, then approves the request. An account already linked to another login cannot be reassigned by this approval flow.
5. Approved customers can select the connection in Billing and complaint submission. Selecting an account prefills its service address. General complaints remain available without verification. Complaint account references are fixed at submission and cannot subsequently be substituted.

## Staff tools

Accounts & Billing includes pending ownership requests and an account-number directory. Select an account to see up to 50 recent bills and account-linked complaints. Existing complaints are not retroactively assigned by matching a name or profile field.

## Deployment and data limitations

Deploy the frontend and Express API together and apply the repository schema/migrations to the target Supabase project. `service_account_requests` records account-number ownership requests; Commercial Services can approve or reject them only after independent MRWD verification. Requester lookup is restricted to the authorized Commercial billing workflow.

Customer-account and billing CSV imports are controlled report imports, not a live connection to MRWD billing software or payment providers. The included SAMPLE CSV files and any seeded/demo rows are demonstration data only and must not be presented as official balances or ownership evidence. Imported records display a source-update time; records without one are explicitly labelled as having no confirmed import time. Payment posting and service consequences must be confirmed through MRWD policy and official records.

## Verification

Run npm run lint, npm run build, and npm test. Run supabase/tests/service_accounts.sql through an authorized SQL connection: it uses a transaction and rolls back all test accounts, requests, bills, complaints, and audit entries. Explicit test complaint references avoid advancing the live complaint reference sequence.

Historical verification records are retained elsewhere in `docs/`. For the current source, use `npm run verify`, then perform the service-account SQL isolation test and browser checks in the target environment. The source-integrity command now excludes local gitignored `.env` files instead of failing solely because they exist; those files still must never be packaged or committed.
