# Copilot Instructions For This Repository

## Approved Connection Channels
- Local network server: use `http://PC-SERVER:5000`; its current IPv4 fallback is `http://169.254.61.2:5000`.
- Central/public server: use `http://37.34.208.209:5000`.
- Installed application clients: use `http://localhost:5000` for the locally served interface; this client must proxy API and archive requests to an approved server channel.
- `localhost` is a local interface channel only. Client devices must never start a local API server or database.
- `PC-SERVER` remains the only API/database owner.
- `LAPTOP-ABDULLAH` remains a network gateway only and must not run the local client, API, or database.
- `PC-Hessa` and `PC-Nora` are the two permanent subordinate data-entry clients. Their deployed client folders are `X:\MainProject.Api` (`\\PC-Hessa\Desktop\MainProject.Api`) and `Y:\MainProject.Api` (`\\PC-Nora\Desktop\MainProject.Api`).
- Do not rebuild or deploy updates to `PC-Hessa` or `PC-Nora` unless the user explicitly requests updating those devices. When explicitly requested, rebuild the portable local client and mirror the validated client-only package to both subordinate client folders. Each client must run `RUN_PROGRAM.bat`, serve the interface at `http://localhost:5000`, and proxy API/archive requests to `PC-SERVER`.
- Never deploy `server.js`, `database.js`, a database file, or backend ownership to `PC-Hessa` or `PC-Nora`; they are interface clients only.
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
- For main-interface navigation buttons, use the shared `العودة للرئيسية` label and `.home-nav-button` class. Keep it below the page title/description, aligned to the right, with the shared dark slate color from `/layout-defaults.css`.
- Use `/layout-defaults.css` as the shared typography source: Tahoma/Arial, 14px base text and controls, 28px page titles (24px on narrow screens), 20px section headings, 18px subsection headings, and 13px form labels. Preserve smaller sizes only for secondary metadata and compact status badges.
- Keep CRUD buttons text-only, using the shared `.btn.success`, `.btn.warning`, `.btn.danger`, and `.btn.primary` styles; do not add decorative emoji icons.

## Existing Interface Design
- On existing pages, preserve the original layout and visual design. Do not redesign, rearrange, or restyle interface elements beyond the specific requested change without the user's explicit approval.

## Unified Interface Defaults
- Use `/layout-defaults.css` as the single source for app typography, spacing, border radii, shadows, controls, panels, tables, and table toolbars across desktop and mobile application pages.
- Build new application pages with `body.app-shell`, `.page.app-page`, `.panel`, `.field`, `.toolbar`, `.table-tools`, `.table-wrap`, `.btn`, and the existing shared tokens instead of defining page-specific duplicates.
- Use the shared spacing and radius scale (`--ui-space-*`, `--ui-panel-radius`, `--ui-card-radius`, `--ui-table-radius`, `--ui-control-radius`, and `--ui-btn-radius`) and shared panel/control shadows. Preserve deliberate page structure and specialized content layouts.
- For record tables, use the shared table style. Put record count on its own row, then keep the search field on the RTL right and refresh/actions on the left in `.table-tools`; reuse `.table-tools-search-refresh` when its search-refresh pattern applies.
- Use text-only CRUD buttons with the standard `.btn.success`, `.btn.warning`, `.btn.danger`, and `.btn.primary` classes. Do not use decorative emoji icons.
- When a functional icon is needed, use a small monochrome SVG symbol from `/ui-icons.svg`; keep it `aria-hidden="true"` when adjacent text already provides its accessible name. Do not add icon fonts, emoji glyphs, or a new icon package.
- Keep icons limited to meaningful actions or navigation; do not decorate labels or status messages with emoji.

## Performance Defaults
- Use the server's slow-request and slow-database logs plus five-minute count/average/p95 summaries to identify bottlenecks before optimizing.
- `SLOW_REQUEST_MS` controls slow API request warnings (default 1000 ms); `SLOW_DB_QUERY_MS` controls slow database warnings (default 200 ms). Performance logs must not include request bodies, query parameters, or database parameter values.
- Cache only public static assets briefly; never add shared browser caching to authenticated API responses, archive files, or user-specific data.
- Keep table text filtering debounced and load archive previews only when they approach the viewport.
- Do not add database indexes, server pagination, or broad data-loading changes without measurements and tests showing the affected query and preserving data-scope behavior.

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

## Daily Status Catalog
- Keep daily status input options in this exact order: `حضور`, `غياب`, `حضور بعد غياب`, `أذن`, `تخفيف عمل`, `اجازة`, `دورة`, `تكليف`.
- Use `/status-catalog.js` as the shared frontend source for these values and their normalization rules.
- Treat historical `استئذان`, `إذن`, and `اذن` values as aliases of `أذن`; save all new permission records as `أذن`.
- `أذن` and `تخفيف عمل` use only `بداية الدوام` or `نهاية الدوام` as descriptions.
- Selecting `بداية الدوام` moves the original period start forward by two hours. Selecting `نهاية الدوام` moves the original period end back by two hours.
- Always recalculate from the period's original default times so switching descriptions never compounds the two-hour adjustment.

## Print Label Naming
- In all current and future print templates, use `اسم الموظف` as the field label instead of `الاسم الرباعي`.

## Table Sorting
- When the user requests a new table sort, make the relevant column header clickable and show an ascending/descending arrow in that header.
- Follow the existing interaction used by the start and end columns in the holidays table.
- Do not add a separate sort banner, dropdown, or control unless the user explicitly requests one.

## Empty Tables
- In all current and future tables, when a table has no rows, show exactly this text in the empty row: `لاتوجد بيانات حالياً.`
- Do not use page-specific or explanatory wording for empty tables.

## Table Search and Refresh Toolbar
- For current or future table sections with a record count, search field, and refresh button, use `.table-tools.table-tools-search-refresh` from `/layout-defaults.css`.
- Keep the count on its own row above the controls, right-aligned.
- Keep the search field wide on the right and the blue `.btn.primary` refresh button on the left in the same row.
- Do not add page-specific sizing or colors for this toolbar.

## Default CRUD Buttons
- For current and future CRUD table interfaces, use the project-standard toolbar in this order:
  - Green success button: `إضافة بيانات`
  - Orange warning button: `تعديل بيانات`
  - Red danger button: `حذف بيانات`
  - Blue primary button: `طباعة بيانات`
- Reuse the existing `.btn.success`, `.btn.warning`, `.btn.danger`, and `.btn.primary` styles instead of introducing page-specific CRUD button colors.

## Employee Name Search
- Employee name inputs show a suggestion list that narrows while typing; the user can pick a name from it (mouse or arrow keys + Enter).
- Suggested names must respect the user's data scope (department/section/subsection); admin is exempt.

## System Version
- Current system version: 3.3.4 (shown on public/login.html for regular and mobile, and in package.json).
- Bump only the last number (patch) when the user explicitly orders a version update at the end of a change; keep both places in sync.

## Release Finalization
- When the user explicitly orders final version/release completion, include the version number in the release commit message and push the validated commit to the configured Git remote.
- Name portable client archives using the program name, version, and build date: `MainProject-v<version>-<yyyy-MM-dd>.zip`.
- Keep the portable archive version synchronized with `package.json` and the version displayed on the login page.
