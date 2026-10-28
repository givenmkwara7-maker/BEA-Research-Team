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

## Contact inquiries and Brevo replies

Public contact form submissions are saved privately in `inquiries.json` and appear in Admin → Inquiries. This private file is excluded from Git. To email replies to the person who submitted the inquiry, create a Brevo API key and verify the sender email in Brevo. Before starting `node server.js`, add these settings in the same PowerShell window:

```powershell
$secureBrevoKey = Read-Host "Brevo API key" -AsSecureString
$env:BREVO_API_KEY = [System.Net.NetworkCredential]::new("", $secureBrevoKey).Password
$env:BREVO_SENDER_EMAIL = Read-Host "Verified Brevo sender email"
$env:BREVO_SENDER_NAME = "BEA Research Team"
```

Keep the API key in the server environment only. For a public host, set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` in its secret environment settings. The sender must be verified in Brevo. Replies use Brevo’s transactional email API.

## Admin capabilities

- Edit the association identity, homepage heading and introduction, About section, contact email, and logo.
- Add, edit, and remove research projects, events, news stories, team roles, and gallery images.
- Upload a JPG, PNG, or WebP photo for each team role; photos appear above the position on the Team page.
- Set a separate blurred background photo for each interior tab: Research, Programs & Events, News, Team, and Gallery.
- Deleted content moves to the admin Trash, where it can be restored or permanently deleted.
- Changes are written to `site-content.json` and appear on the public site served by `server.js`.

## Hosting

The project now needs a Node.js host to provide authenticated editing and persistent API storage. A static-only host cannot run the admin login or save edited content. For a public deployment, use HTTPS, set `NODE_ENV=production`, set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` in the hosting provider’s secret environment settings, keep `site-content.json` and private `inquiries.json` on persistent storage, and back them up.
