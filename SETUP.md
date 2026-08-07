# SwarnaSundari admin setup

## 1. Add Netlify environment variables
In Netlify, open your site dashboard and go to Site settings → Environment variables. Add these values:

- ADMIN_PASSWORD: the shared password for the admin login screen.
- ADMIN_TOKEN_SECRET: a long random secret string used to sign the short-lived browser token.
- GITHUB_TOKEN: a GitHub personal access token with `repo` access for the target repository.
- GITHUB_REPO: your GitHub repository in `owner/name` form.
- GITHUB_BRANCH: usually `main`.

> Keep the password and token secret private. They are never exposed to the browser.

## 2. Generate a GitHub token
1. Open GitHub → Settings → Developer settings → Personal access tokens.
2. Create a fine-grained token or classic token with `repo` scope.
3. Grant access only to this repository and enable Contents read/write permissions.
4. Copy the token into the Netlify environment variable `GITHUB_TOKEN`.

## 3. Deploy and use the admin panel
1. Commit these files to your GitHub repo and deploy the site on Netlify.
2. After deployment, visit `/admin.html` on your site.
3. Sign in with the shared password from `ADMIN_PASSWORD`.
4. Add, edit, or delete products from the dashboard.

## 4. Notes
- Every save writes to `products.json` and commits to the repo through Netlify Functions.
- Netlify will rebuild and deploy automatically after the GitHub commit.
- The admin page stores the signed token in session storage only, so it is not persisted across browser restarts.
