# Supabase

## Fresh install

Run exactly one production SQL file on a new Supabase project:

```text
setup.sql
```

`setup.sql` is a squashed release snapshot. It replaces the historical chain of development migrations and includes the required core schema, policies, functions, reference data, operational features, production-readiness features, and security hardening.

**Do not run `setup.sql` against an existing populated MRWD database.**

See `../docs/DATABASE.md` for first-user/bootstrap instructions.
