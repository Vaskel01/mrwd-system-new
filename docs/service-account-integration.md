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

## Deployment

The active source is C:/Users/Karl Adrian/MRWD-system. Deploy the frontend and Express API together. The live Supabase project has the verified_service_accounts_and_account_billing and service_account_request_least_privilege migrations applied. The fresh setup.sql installer includes the same service-account definitions. The Supabase CLI was unavailable when this feature was developed; remote migration history is recorded by Supabase.

No production hosting deployment or Git push is performed by these source edits. The existing six billing rows are preserved. Imported records display a source update time; records without one are labelled as having no confirmed import time. This is report-based integration, not automatic payment synchronization.

## Verification

Run npm run lint, npm run build, and npm test. Run supabase/tests/service_accounts.sql through an authorized SQL connection: it uses a transaction and rolls back all test accounts, requests, bills, complaints, and audit entries. Explicit test complaint references avoid advancing the live complaint reference sequence.

Verification on 2026-09-06: lint and build passed; all 29 existing server tests passed; service-account database isolation and workflow tests passed and rolled back. Customer and Commercial Services screens were checked in a real browser at desktop and 390-pixel mobile widths. No sample data was submitted through the UI. The source-distribution check still flags the existing local .env and server/.env files; those files must remain local and must not be packaged or committed. Supabase's security advisor reports only the existing disabled leaked-password protection setting; see https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No new database security advisory was reported.
