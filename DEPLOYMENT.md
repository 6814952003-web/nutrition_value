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
| `ADMIN_NAME` | Name used by the manual administrator provisioning command |
| `ADMIN_PASSWORD` | Operator-only password used by the provisioning command; never exposed to the browser |

Find the public origin in your Blob store's details or an object's URL. Never use
a `VITE_` prefix for secrets. `.env` files are ignored by Git. Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Signed-in users obtain short-lived, path-restricted upload tokens from
`/api/uploads` through the authenticated API helper, so authentication and
storage errors retain their HTTP status and user-facing message. The browser
uses that client token with `put` from `@vercel/blob/client`. File bytes go
straight from the browser to Blob; they do not pass through a Vercel Function or get written
to its filesystem. The browser then sends the URL with its profile/post save.
The API checks the Blob origin, owner, file metadata and size before saving the
URL to Atlas. The read/write token stays on the server.
Profile photos support PNG/JPEG/WebP up to 1.5 MB; posts support those formats,
GIF, MP4, WebM and MOV up to 100 MB per file (100,000,000 bytes). Larger community
files use multipart uploads directly to Blob, with parallel parts and retries.
Community upload tokens last 30 minutes; avatar/site tokens retain their
five-minute limit. Existing `avatarData` and `mediaData` fields now
store URLs; existing base64 records still render but are not migrated automatically.
Uploads completed before a failed/cancelled save can leave unused objects in Blob;
there is no automatic cleanup job.

Community hearts are recorded per account in `likedBy`. API responses expose
only the unique count and `likedByMe`; the list of account identifiers stays on
the server. Adding a heart uses an atomic MongoDB update, so repeated clicks or
concurrent requests from one account cannot increase the count twice. Old totals
without account records restart at zero, as requested, without deleting posts.

## Public profiles and privacy

The React route `/u/:username` and its public profile API expose a visitor DTO
containing only `avatarUrl`, `displayName`, `bio`, `joinedAt`, `streak` and
`posts`. Each public post exposes only `_id`, `content`, `category`, `mediaData`,
`mediaType`, `createdAt`, `likes` and `commentCount`. Email, health data,
account roles, author IDs, comment bodies and like identities are omitted by
explicit projections and serializers. The signed-in community API also uses
field allowlists, omits author email snapshots and never stores email on new
posts. Existing email snapshots in Atlas need no destructive data migration;
they are never serialized.

Profiles default to private. Missing and private profiles return the same
unavailable response, and profile API responses must not be cached. Members
edit their own username, display name, bio and visibility from their private
account page. Visitor preview uses saved settings: a saved private profile
is unavailable in the preview too. Changing visibility does not delete community
posts or revoke previously shared public Blob object URLs.

Deploy the client and server together. No new service or environment variable
is required. Usernames use a unique index and community posts have an
`author`/`createdAt`/`_id` compound index for profile feed ordering. Existing
accounts remain private until their owner configures a public profile. Verify a
private profile is unavailable anonymously, a public profile contains exactly
the visitor DTO, and an owner can save settings and preview the resulting view.

Food logs are stored in the `foodlogs` collection and every `/api/food-logs`
endpoint requires a valid session. Queries and mutations are scoped to the
authenticated account; the API never accepts a caller-supplied `userId`.
Nutrition and menu names are snapshotted by the server when a log is created.
The dashboard tracker reads the authenticated account's server-side logs for
the current local date and refreshes after a successful log. Logs can snapshot
either a recipe serving or a directly consumed catalog ingredient; ingredient
amounts are entered in grams and the snapshot uses the ingredient's 100 g basis.
Logs are private by default. Only a profile owner who explicitly enables
“Share food logs” can expose all logged menu names, servings, timestamps and
nutrition snapshots on a public profile; disabling the switch hides them again.
The public DTO omits account identifiers and internal per-serving snapshots.

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

The website now includes `/admin` for accounts with the `admin` role. Deploy the
frontend, API, and `shared/site-defaults.json` together. No new environment
variables are required. `ADMIN_EMAIL` still selects the initial administrator;
an existing account with that email receives its admin role on its next login.

To create a missing administrator, deliberately run the following from the
repository root with the intended Atlas `MONGO_URI`, `ADMIN_NAME`, `ADMIN_EMAIL`
and `ADMIN_PASSWORD` in the operator's environment:

```powershell
node server/scripts/provision-admin.cjs
```

The command loads `server/.env` quietly without overriding existing environment
variables. If that file enables local MongoDB, explicitly set
`USE_LOCAL_MONGO=false` for an Atlas operation. Verify the target database first.
The command hashes the supplied password using the normal scrypt account format,
creates only a missing administrator, and refuses identity/role/password
conflicts instead of resetting existing accounts. Re-running matching credentials
is safe. Importing the script or visiting the public API never runs provisioning.

An explicitly provisioned administrator may use a well-formed local-domain email
such as `admin@localhost`; production `ADMIN_EMAIL` must match that account.
Public registration still requires an ordinary dotted-domain email and a password
of at least six characters. Login always verifies the stored password hash and
does not authenticate against `ADMIN_PASSWORD`; changing that environment
variable does not change a stored password. `ADMIN_NAME` and `ADMIN_PASSWORD`
are needed for the operator command, not for normal runtime authentication.

The admin page manages branding, colors, page text, images/icons, nutrition
goals, meals, guides, users, and community moderation. Site settings use
`GET /api/site` and admin-only `PUT /api/site`; MongoDB stores the configuration
in one `sites` document. Existing default meals and text are preserved until
an administrator saves a change. Concurrent edits return HTTP 409 and retain
the editor's draft rather than replacing the other administrator's changes.

After this deployment, content changes saved through `/admin` appear on reload
and are checked by open pages every 30 seconds or when a tab regains focus.
Code/layout changes still require another deployment. Site image uploads use
the existing Blob store, accept PNG/JPEG/WebP up to 1.5 MB, and require an admin
account. Public HTTPS image URLs can also be entered directly.

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
  variables are enabled for the environment you are testing. Connecting a
  store automatically supplies its token/store identifiers, but this app's
  `BLOB_PUBLIC_ORIGIN` must also be set to that store's public HTTPS origin.
  Upload authorization validates that the token and origin identify the same
  store. Invalid/missing configuration returns HTTP 503; invalid sessions
  return 401. The client keeps the selected file available for retry and does
  not replace a failed upload with base64 JSON.
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
