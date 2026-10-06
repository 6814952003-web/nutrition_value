# Nouri - Nutrition Tracker

React/Vite frontend with an Express API, MongoDB Atlas for application data, and
direct browser uploads to Vercel Blob for profile photos and community media.

Administrators can edit site branding, colors, text, images/icons, nutrition
goals, meals and guides at `/admin`, and manage users and community posts.
Saved content lives in Atlas and updates the website without rebuilding it.
See [ADMIN_GUIDE.md](ADMIN_GUIDE.md) for the Thai administration guide.

The dashboard includes the community feed, which refreshes automatically every
two seconds while visible and on focus/reconnection. Members can delete their
own posts and comments; administrators can moderate all content. Existing
Atlas/Blob configuration supports these features without new services.

## Local development

Use Node.js 24. Install packages from the repository root:

```sh
npm ci
npm ci --prefix client
npm ci --prefix server
```

Copy `server/.env.example` to `server/.env`, fill in the Atlas and public Blob
store settings, then run `npm run dev`. Open <http://localhost:5173>.
In PowerShell, use `npm.cmd` if execution policy blocks `npm`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel configuration, required
environment variables, Atlas setup, Blob upload flow, and Git push commands.
Vercel's Root Directory is the repository root (`.`).

## Verification

```sh
npm test
npm run build
```
# nutrition_value
