# Deploy to Vercel

This project is Vercel-ready with static pages and serverless API functions.

## Required Vercel Environment Variables

Set these in Vercel Project Settings > Environment Variables:

```env
DATABASE_URL=postgresql://your-neon-or-postgres-url
TICKET_PRICE=50000
TICKET_QUOTA=800
```

Do not upload `.env`.

## Pages

- Registration form: `/`
- Admin page: `/admin.html`

## API

- `GET /api/health`
- `GET /api/config`
- `GET /api/registrations`
- `POST /api/registrations`
- `GET /api/registrations/:id`
- `PATCH /api/registrations/:id`
- `DELETE /api/registrations/:id`
- `GET /api/payment-proofs/:filename`

## Database Migration

Run this locally when changing the database schema:

```powershell
$env:DATABASE_URL="postgresql://your-database-url"
npm run migrate
```

The current migration stores payment proof files in PostgreSQL so uploads work on Vercel.
