# UPPERCASE Function Security Notes (SQL RPCs)

When creating PostgreSQL functions for admin checks (for example `is_admin` and
`is_platform_admin`):

- Set `search_path = ''` explicitly and keep all references schema-qualified.
- Set `SECURITY DEFINER` only when required for privileged reads.
- Set explicit `OWNER` for each function.
- Apply deny-by-default ACLs:
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
  - Grant only required roles.
- Keep UUID-based overloads tight:
  - Grant only `service_role` (or other explicit service-facing role).
  - Do not grant UUID overloads to `anon`/`authenticated`.
- Keep auth-context wrappers (`()`) on least-privilege roles that should be able to
  call them from client code (typically `authenticated`).
- Keep platform-admin logic and legacy admin logic separate and avoid adding RBAC
  checks to the legacy path unless explicitly required.
