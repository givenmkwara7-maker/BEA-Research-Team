# BEA Research Team website

## Run the website and admin panel locally

The admin panel needs the Node server. Do not open the HTML files directly or use VS Code Live Server for admin edits.

1. Open PowerShell in this folder.
2. Set an admin username and a unique password of at least 12 characters:

   ```powershell
   $env:ADMIN_USERNAME = Read-Host "Admin username"
   $securePassword = Read-Host "Admin password" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
   node server.js
   ```

3. Open <http://localhost:3000>. Use the Admin link to sign in.

The server stores public content in `site-content.json`. The admin sign-in uses an HTTP-only session cookie, server-side password hashing, same-origin checks, and a temporary lock after repeated failed sign-in attempts. Sessions last up to eight hours. The password is not saved in the project files.

## Admin capabilities

- Edit the association identity, homepage heading and introduction, About section, contact email, and logo.
- Add, edit, and remove research projects, events, news stories, team roles, and gallery images.
- Changes are written to `site-content.json` and appear on the public site served by `server.js`.

## Hosting

The project now needs a Node.js host to provide authenticated editing and persistent API storage. A static-only host cannot run the admin login or save edited content. For a public deployment, use HTTPS, set `NODE_ENV=production`, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the hosting provider’s secret environment settings, keep `site-content.json` on persistent storage, and back it up.
