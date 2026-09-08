# Kshironet (כשירונט)

**כשירות בזמן אמת** — brigade-level certification and course management for חטיבה 228:
requests, quotas, rosters, gaps and reporting in one place. The Hebrew display name is
**כשירונט** and the slogan is **כשירות בזמן אמת**; `Kshironet` / `kshironet` is the English
identifier used in code, docs and package metadata.

Brand strings live in [lib/config/app.ts](lib/config/app.ts) — name, slogan and logo are
defined once and imported everywhere. Logo assets are derived from `public/logo.jpeg` by
[scripts/make-logo.mjs](scripts/make-logo.mjs).

See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for what the system does and who uses it.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load [Heebo](https://fonts.google.com/specimen/Heebo) with the Hebrew and Latin subsets — the UI is Hebrew RTL throughout.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
