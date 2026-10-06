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
Community attachments retain their original aspect ratio and support files up
to 100 MB, with multipart uploads for large files. Hearts count once per account
and post; legacy totals without account records restart at zero.

Public profiles are available at `/u/:username` after a member chooses a username
and makes their profile public in their private account settings. Profiles are
private by default. The visitor view contains only the photo, display name, bio,
join date, daily activity streak and community posts. Public profile responses
use explicit field allowlists and never include email, health records, author
identifiers, comment bodies or the identities of accounts that liked a post.
The preview button opens the saved visitor view; a saved private profile is
unavailable to visitors. Making a profile private hides that profile without
removing its posts from the signed-in community. Already shared public Blob
media URLs remain accessible to people who hold the URL.

Community author photos and names link to the author's public profile when that
member has opted in. Hovering or focusing the link, or holding it on a touch
screen, opens a compact profile card; a quick tap opens the full profile.
Cards fetch the current public profile each time they open, without caching
email, health data or community posts. Private profiles have no public link or
profile details; their author identity opens only an unavailable notice without
requesting a profile. The public card endpoint returns the same unavailable
response for private and missing accounts.

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
