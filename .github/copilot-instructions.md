# Copilot Instructions For This Repository

## Approved Connection Channels
- Local network server: use `http://PC-SERVER:5000`; its current IPv4 fallback is `http://169.254.61.2:5000`.
- Central/public server: use `http://37.34.208.209:5000`.
- Installed application clients: use `http://localhost:5000` for the locally served interface; this client must proxy API and archive requests to an approved server channel.
- `localhost` is a local interface channel only. Client devices must never start a local API server or database.
- `PC-SERVER` remains the only API/database owner.
- `LAPTOP-ABDULLAH` remains a network gateway only and must not run the local client, API, or database.
- Do not introduce temporary domains, Cloudflare Tunnel, or other tunnel URLs unless the user explicitly reverses this decision.
- External browser-only devices must connect to the central/public server channel.

When creating new frontend pages (especially inside `public/`), apply these defaults unless the user explicitly asks otherwise:

## Layout Defaults
- Keep the main page container centered exactly on the viewport.
- For all current and new pages inside `public/`, keep `/layout-defaults.css` as the shared source of layout defaults.
- Use `body.app-shell` with `.page.app-page` for standard application pages unless a page has a deliberate override.
- Use `body.auth-shell` for compact centered entry pages such as login when full-page vertical centering is intended.
- Use a wide centered container pattern by default:
  - `body { display: flex; justify-content: center; overflow-x: hidden; min-height: 100vh; }`
  - `width: min(1600px, calc(100vw - 20px));`
  - `margin: 0;`
  - Keep top and bottom spacing equal (for example: `padding: 16px 0;`).
- Keep page content aligned to top using `align-content: start` for grid containers.
- Do not add visual footer sections or extra bottom spacer blocks unless explicitly requested.

## Date/Time Defaults
- Use date format: `yyyy/mm/dd`.
- For timestamps, use: `HH:mm:ss yyyy/mm/dd`.
- Time must be ordered as: hour, then minute, then second.
- Do not rely on locale output order for stored/displayed logs if order can vary; instead format timestamps explicitly in code.

## RTL Display Safety For Time
- In RTL pages, render time cells with LTR isolation so the time order remains stable.
- Recommended style for time fields in tables:

```css
.log-time {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

## Consistency Rule
- Reuse the same formatting helper for new pages that record or display activity logs.
- Keep formatting behavior consistent across `dashboard`, `login`, and future interfaces.

## Print Label Naming
- In all current and future print templates, use `اسم الموظف` as the field label instead of `الاسم الرباعي`.

## Table Sorting
- When the user requests a new table sort, make the relevant column header clickable and show an ascending/descending arrow in that header.
- Follow the existing interaction used by the start and end columns in the holidays table.
- Do not add a separate sort banner, dropdown, or control unless the user explicitly requests one.

## Empty Tables
- In all current and future tables, when a table has no rows, show exactly this text in the empty row: `لاتوجد بيانات حالياً.`
- Do not use page-specific or explanatory wording for empty tables.

## Employee Name Search
- Employee name inputs show a suggestion list that narrows while typing; the user can pick a name from it (mouse or arrow keys + Enter).
- Suggested names must respect the user's data scope (department/section/subsection); admin is exempt.

## System Version
- Current system version: 3.3.0 (shown on public/login.html for regular and mobile, and in package.json).
- Bump only the last number (patch) when the user explicitly orders a version update at the end of a change; keep both places in sync.
