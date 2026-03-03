# Gas Generation Dashboard

NSW & VIC gas power generation and spot price dashboard, powered by the Open Electricity API.

## Local Development

```bash
npm install
# Create .env.local with your API token:
echo "OE_API_TOKEN=your_token_here" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import the repo in [vercel.com](https://vercel.com)
3. Add an Environment Variable in Vercel project settings:
   - Key: `OE_API_TOKEN`
   - Value: your Open Electricity API token
4. Deploy

**Important:** Never commit `.env.local` — it's already in `.gitignore`.

## Features

- NSW & VIC tabs with separate views
- Line chart: one line per gas facility (units aggregated), spot price on secondary axis
- Summary stats: avg/max/min price, avg/peak generation
- Expandable raw data table
- Data auto-refreshes every 30 minutes on Vercel

## Tech Stack

- Next.js 14 (App Router)
- Recharts for charts
- Tailwind CSS
- API token kept server-side (never exposed to browser)
