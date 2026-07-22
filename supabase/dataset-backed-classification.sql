-- ═══════════════════════════════════════════════════════════════
-- Dataset-backed complaint classification
-- Run once in the Supabase SQL Editor before using this version.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

alter table public.complaints
  add column if not exists classified_category text,
  add column if not exists classification_confidence numeric(5,2),
  add column if not exists classification_sentiment text,
  add column if not exists classification_mismatch boolean not null default false,
  add column if not exists classification_basis text,
  add column if not exists classification_keywords jsonb not null default '[]'::jsonb,
  add column if not exists classification_negated_keywords jsonb not null default '[]'::jsonb,
  add column if not exists classification_reasons jsonb not null default '[]'::jsonb,
  add column if not exists classifier_version text,
  add column if not exists classification_method text;

alter table public.complaints
  drop constraint if exists complaints_classification_confidence_check;

alter table public.complaints
  add constraint complaints_classification_confidence_check
  check (classification_confidence is null or classification_confidence between 0 and 100);

alter table public.complaints
  drop constraint if exists complaints_classification_sentiment_check;

alter table public.complaints
  add constraint complaints_classification_sentiment_check
  check (classification_sentiment is null or classification_sentiment in ('neutral', 'negative', 'urgent'));

comment on column public.complaints.classified_category is
  'Complaint category predicted from the description by the dataset-backed classifier.';
comment on column public.complaints.classification_confidence is
  'Transparent rule-based confidence percentage for the predicted category.';
comment on column public.complaints.classification_keywords is
  'JSON list of dataset terms matched during text analysis.';
comment on column public.complaints.classification_reasons is
  'Human-readable explanation of the classifier result.';
