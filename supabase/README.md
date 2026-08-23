# Supabase

## Fresh install

Run exactly one production SQL file on a new Supabase project:

```text
setup.sql
```

`setup.sql` is the fresh-release baseline. It replaces the historical chain of development migrations and installs the supported schema, policies, functions, reference data, operational features, production-readiness features, and security hardening. Obsolete SLA, task-acknowledgement, and maintenance completion-photo structures are not part of the fresh baseline.

**Do not run `setup.sql` against an existing populated MRWD database.**

See `../docs/DATABASE.md` for first-user/bootstrap instructions.
