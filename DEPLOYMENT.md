# Deploy Nouri to Vercel

## Vercel project

Push this project to GitHub using the commands below, then import
`6814952003-web/nutrition_value` in Vercel. Use these settings:

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (`.`; leave the default) |
| Framework Preset | Other |
| Node.js Version | 24.x |
| Install Command | From `vercel.json`: `npm ci && npm ci --prefix client && npm ci --prefix server` |
| Build Command | `npm run build` |
| Output Directory | `client/dist` |

The repository root contains `vercel.json`, `api/`, `client/` and `server/`.
Do not select `client` or `server` as the Root Directory. The configuration builds
the Vite frontend and routes `/api/*` to the exported Express function in
`api/index.js`. Existing static assets are served by Vercel; other frontend URLs
serve the React app. API responses are not cached.

## MongoDB Atlas

Create an Atlas cluster and a database user with read/write access to
`nutrition_value`. Copy its Drivers connection string into Vercel's `MONGO_URI`,
including `/nutrition_value` before the query string. URL-encode special characters
in the database password. Configure Atlas Network Access to permit your Vercel
deployment's outbound connections. Use fixed egress IPs when available; allowing
`0.0.0.0/0` permits connections from anywhere and requires strong database credentials.
Set `MONGO_URI` in Vercel, even if it is already set in your local `server/.env`.
Local files do not configure Vercel environment variables. Vercel always uses the
Atlas URI and ignores `USE_LOCAL_MONGO` and local DNS overrides. Warm function
instances reuse their connection pool. Existing local MongoDB data is not
automatically copied to Atlas.

## Vercel Blob and environment variables

Create/connect a **public** Blob store in the project's Storage tab. Avatars and
community media are publicly viewable by URL. Connect the store to Production
and any Preview environments that should support uploads.

Set these server-only variables in Vercel, then redeploy:

| Variable | Value |
| --- | --- |
| `MONGO_URI` | Atlas connection string |
| `JWT_SECRET` | Long random secret, unique to this app |
| `BLOB_READ_WRITE_TOKEN` | Token supplied by the connected Blob store |
| `BLOB_PUBLIC_ORIGIN` | `https://YOUR-STORE.public.blob.vercel-storage.com` (origin only) |
| `ADMIN_EMAIL` | Optional email of the initial administrator |

Find the public origin in your Blob store's details or an object's URL. Never use
a `VITE_` prefix for secrets. `.env` files are ignored by Git. Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Signed-in users obtain short-lived, path-restricted upload tokens from
`/api/uploads`. File bytes go straight from the browser to Blob using
`@vercel/blob/client`; they do not pass through a Vercel Function or get written
to its filesystem. The browser then sends the URL with its profile/post save.
The API checks the Blob origin, owner, file metadata and size before saving the
URL to Atlas. The read/write token stays on the server.
Profile photos support PNG/JPEG/WebP up to 1.5 MB; posts support those formats,
GIF, MP4, WebM and MOV up to 4 MB. Existing `avatarData` and `mediaData` fields now
store URLs; existing base64 records still render but are not migrated automatically.
Uploads completed before a failed/cancelled save can leave unused objects in Blob;
there is no automatic cleanup job.

## Local development

From this project directory:

```powershell
npm.cmd ci
npm.cmd ci --prefix client
npm.cmd ci --prefix server
# If no server/.env exists, copy server/.env.example to server/.env and fill it in.
npm.cmd run dev
```

Configure the same Atlas and Blob variables in `server/.env` for local use.
Open `http://localhost:5173`; Vite forwards `/api` to the local server on port
5000. New uploads do not request a completion callback, so local uploads do not
require a tunnel. Signed completion events from older upload tokens can still
be acknowledged without querying MongoDB.

## Verification

Run `npm.cmd test` and `npm.cmd run build`. Tests use mocks for Atlas and Blob;
they do not create cloud data. After deploying, check `/api/health`,
register/sign in, upload an avatar and a post image/video, then reload. Confirm
objects exist in Blob and Atlas contains HTTPS URLs. `/api/health` checks API
liveness; login and the feed exercise the database. Check unauthenticated uploads
are refused and files over the limits show an error.

## Push to the existing repository

Run in PowerShell from this project, which is the Git repository root:

```powershell
Set-Location 'C:\Users\CSIT\Downloads\Nutrition value'
git add .
git diff --cached --stat
git commit -m "Configure Vercel deployment with Blob uploads and MongoDB Atlas"
git push -u origin main
```

`origin` is already `https://github.com/6814952003-web/nutrition_value.git`.
Do not run `git init` again. Inspect the staged filenames before committing;
environment files and dependencies should be absent.

## Troubleshooting

- **API returns 503:** check `MONGO_URI`, the Atlas database user's credentials,
  and Atlas Network Access. `/api/health` alone does not verify Atlas.
- **File storage is not configured:** connect a public Blob store, set
  `BLOB_READ_WRITE_TOKEN` and `BLOB_PUBLIC_ORIGIN`, and redeploy. Check that the
  variables are enabled for the environment you are testing.
- **Upload succeeds but the post/profile save fails:** check that
  `BLOB_PUBLIC_ORIGIN` is the origin of the same public store as the token, with
  no object path. The API intentionally rejects URLs from a different store.
- **Build cannot find the frontend or API:** use the repository root as Vercel's
  Root Directory, and ensure all source folders and three lockfiles were pushed.

References: [Vercel client uploads](https://vercel.com/docs/vercel-blob/client-upload),
[Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json),
[Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[Atlas connections](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/),
[Atlas connection reuse](https://www.mongodb.com/docs/atlas/manage-connections-aws-lambda/).
