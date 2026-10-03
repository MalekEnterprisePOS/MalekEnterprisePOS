# Hosting the website and the POS app separately

```
  GitHub repo A (website)                GitHub repo B (POS app) - PRIVATE
  MalekEnterprisePOS/MalekEnterprisePOS   MalekEnterprisePOS/pos-app
  website code only                       Java source + Releases (the installer .exe)
          |                                        ^
          v                                        | read-only token (server only)
  Firebase App Hosting  <----------------------- asks GitHub for a short-lived link
  (website, admin, payments, licences)
          |
          v
  Customer: Download page -> (sign-in, if you switched that on) -> installer comes from GitHub
```

The installer is **not** in the website repo and **not** in Firebase Storage (which needs a paid plan). The website only
holds a pointer to it. Visitors never get the token, and the link they receive stops working after a few minutes.

## One-time setup

### 1. Put the POS app in its own private repository
GitHub > New repository > name `pos-app` > **Private**. Then, in the Java project folder (Windows CMD):
```
git init
git add .
git commit -m "POS app"
git branch -M main
git remote add origin https://github.com/MalekEnterprisePOS/pos-app.git
git push -u origin main
```
The included `.gitignore` keeps build output, installers and local settings out of the repo.
Do not put the website code or any private key in this repo.

### 2. Make a read-only token for the website
GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token.
- Resource owner: the account or organisation that owns `pos-app`
- Repository access: **Only select repositories** > `pos-app`
- Permissions: **Contents: Read-only** (nothing else)
- Expiry: 1 year. Put a reminder in your calendar: when it expires, downloads stop until you replace it.

(An organisation may need an owner to approve the token.)

### 3. Give the token to the website
Set `GITHUB_TOKEN` on the host the website runs on: Firebase Console > App Hosting > your backend > Environment, and in
Vercel > Settings > Environment Variables if you also use it. Redeploy. Admin > Notifications > Delivery setup should now
say "A GitHub token is set".

### 4. Decide who may download
Admin > Settings > **Downloads** > "Require sign-in to download" (ON: Google or email sign-in with a verified email first).

## Every time you release a new version of the POS
1. Raise the version (`pom.xml` and `AppVersion`), build the JAR and EXE, then the installer with Inno Setup
   (`Output\MalekEnterprisePOS_Setup.exe`).
2. Get its SHA-256: `certutil -hashfile Output\MalekEnterprisePOS_Setup.exe SHA256`
3. GitHub > `pos-app` > Releases > **Draft a new release** > tag `v1.0.1` > attach the installer > Publish.
   (Release files can be up to 2 GB.)
4. Website Admin > Releases > **New release**: version, notes. Under files use "Add from GitHub": enter
   `MalekEnterprisePOS/pos-app` and the tag, click the installer, keep **Send them to the link**, Add.
5. Paste the SHA-256 into the checksum field, then publish the release.
6. Test as a customer: signed out (you should be asked to sign in if the switch is ON), then signed in. The download
   should start from GitHub's servers.

## Good to know
- **Cost and speed:** with "Send them to the link" the installer comes straight from GitHub, so it uses none of your Firebase
  bandwidth and a slow connection can't hit your server's request time limit. "Hide the link" streams the file through your
  server instead; it only suits small files.
- **Private link lifetime:** each visitor gets a fresh link made on the spot; it expires after a few minutes. GitHub decides
  the exact time.
- **If downloads fail** with "temporarily unavailable": the token is missing, expired, or can't read `pos-app`. The server
  log line starts `[releases] GitHub didn't give a download link`.
- **Your website repo is public** (GitHub's secret alert said so). Nothing secret should be in it, but you may prefer to make it
  private: repo > Settings > Danger zone > Change visibility. Firebase App Hosting and Vercel both work with private repos
  as long as their GitHub app still has access.
- **Which site hosts the website:** the POS talks to ONE address (`WebsiteDomain.CURRENT`). Keep the licence, payment and
  email variables on that deployment. See `POS_ALIGNMENT.md`.
- Not tested against GitHub itself: the delivery code is covered by tests with GitHub's answer simulated. Your first real
  download is the final check.
