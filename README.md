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

## Member elections and online voting

The Admin → Elections & voting panel keeps a private, persistent eligible-member roster in `elections.json`. Import a UTF-8 CSV with a `memberId` and `name` column; the Admin panel can download a blank roster template. Common columns such as `email`, `phone`, `programme`, and `yearJoined` are recognized (also accepts common variants such as `member number`, `full name`, and `email address`); other non-empty columns are retained in the private member record. Do not include passwords or secret credentials. You can add members individually, deactivate members who leave, reinstate them, reset passwords, or permanently delete their roster details. A deleted person's anonymous participation record remains so they cannot submit a second ballot for an election they already voted in. Candidate names remain in historical election records.

For each new member, the server creates a random temporary password and returns it once as a downloaded CSV. Share that file privately with the member; do not publish it or commit it to Git. Members sign in at `/vote.html` with their member ID and password, and may change the password after sign-in. The member roster, password hashes, participation log, and ballots are stored in the private, Git-ignored `elections.json` file. Keep this file on persistent storage and include it in secure backups.

An administrator creates a draft election with its schedule, positions, candidates, and quorum percentage, then opens voting. The eligible voter list is fixed when voting is opened. The server checks the schedule and records at most one ballot per eligible member ID per election. Participation uses a one-way hash of the member ID and is stored separately from ballots; ballots contain no voter identifier or submission time and are inserted in randomized order. Members must select one candidate for every position to submit. Admin results are available after the election is closed or its scheduled end time has passed. A tie is identified for the administrator, who can create a runoff election according to the association's rules. Set quorum to 0 when no quorum applies.

The election tools provide configurable timing and quorum, but do not contain BEA's constitution. Confirm eligibility, nominations, quorum, tie-breaking, run-off, and retention rules against the current constitution before opening a real election. Unique accounts prevent a member ID from submitting more than once; members must keep their passwords private.

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
- Import and maintain an eligible voter roster, set up executive elections, open/close ballots, and review turnout and results.
- Changes are written to `site-content.json` and appear on the public site served by `server.js`.

## Hosting

The project now needs a Node.js host to provide authenticated editing and persistent API storage. A static-only host cannot run the admin login, elections, or save edited content. For a public deployment, use HTTPS, set `NODE_ENV=production`, set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` in the hosting provider’s secret environment settings, keep `site-content.json`, private `inquiries.json`, and private `elections.json` on persistent storage, and back them up securely.
