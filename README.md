# Lao Citizen Center — Admin Dashboard

Back-office admin dashboard for the **Lao Citizen Center** (LCC) e-government platform.
It is the counterpart to the citizen-facing app (`lcc-frontend`) and lets staff review and
process Civil Registration applications across the six Phase-1 services.

Shares the same design template as `lcc-frontend`: Tailwind CSS v4, shadcn/ui, brand color
`#344EAD`, and the LCC logo.

## Stack
- React 18 + TypeScript + Vite 6
- Tailwind CSS v4 (`@tailwindcss/vite`)
- shadcn/ui + Radix + lucide-react
- recharts (dashboard analytics)

## Getting started
```bash
npm install
npm run dev
```

## Scripts
- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run typecheck` — TypeScript check (no emit)
