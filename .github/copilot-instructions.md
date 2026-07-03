# Copilot Instructions For This Repository

When creating new frontend pages (especially inside `public/`), apply these defaults unless the user explicitly asks otherwise:

## Layout Defaults
- Keep the main page container centered exactly on the viewport.
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
