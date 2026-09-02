# Supabase

## Fresh install

Run exactly one production SQL file on a new Supabase project:

```text
setup.sql
```

`setup.sql` is the fresh-release baseline. It replaces the historical chain of development migrations and installs the supported schema, policies, functions, reference data, operational features, production-readiness features, and security hardening. Obsolete SLA and task-acknowledgement structures are not part of the fresh baseline. Maintenance completion reports include a required proof photo.

**Do not run `setup.sql` against an existing populated MRWD database.**

## Existing install

Apply tracked files in `migrations/` with the Supabase CLI after linking the project:

```text
supabase db push
```

The direct-completion migration preserves finished records, removes the obsolete WDLCD verification queue, and adds the completion-photo field.

See `../docs/DATABASE.md` for first-user/bootstrap instructions.
