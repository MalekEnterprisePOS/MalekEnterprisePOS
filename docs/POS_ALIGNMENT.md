# POS (Java) and website: how they fit together

Both zips were changed together. This file is the contract between them and the checklist before you ship.

## Do these before giving the POS to a customer

1. **Fix the licence signing key on the website.** The value that was in `LICENSE_SIGNING_PRIVATE_KEY` (64 hex characters)
   is not a key; the website now reports that in Admin > Notifications > Delivery setup > "Licence signing key".
   Run `npm run signing-key` and put the **PRIVATE KEY** line into the host's environment, then redeploy.
2. **Put the matching PUBLIC key into the POS.** After step 1 the same page shows the public key as one line. Paste it
   between the BEGIN/END lines in `LicenseConfig.java` (or run `npm run signing-key` and paste its PUBLIC block). Until
   this is done the POS refuses every licence with a message saying so.
3. **Decide which website address the POS uses.** `WebsiteDomain.CURRENT` now points at the Firebase address
   (`...hosted.app`). Your site is also on Vercel. Each deployment has its own environment variables, so make sure the one
   the POS talks to has the signing key, Yoco keys and Resend keys. Changing it later is that one line.
4. Rebuild the installer (`mvn clean package`, then Inno Setup).

## What was wrong, and what changed

| # | Problem | Side | Fix |
|---|---------|------|-----|
| 1 | `admin_dashboard.fxml` pointed at two button handlers that don't exist in the controller. JavaFX resolves these when it loads the file, so the Admin Dashboard would fail to open | POS | Removed the two attributes (the buttons are already wired in code) |
| 2 | Two different website addresses in the app (Vercel for licence checks, Firebase for the account button) | POS | One address, `WebsiteDomain`; the account link follows it |
| 3 | A fresh licence from the server was saved without checking its signature; a bad setup only showed up after a restart | POS | Verified immediately, with a clear message for: no public key in the build, server not signing, signature mismatch |
| 4 | Tamper reports sent `hardwareId: ""`, which the website rejected (400), so the report was lost | Both | POS omits it when empty; website also tolerates `""`; reasons are cut to the 300-character limit |
| 5 | The website's per-till limit and "disable till" were never enforced: approving a client PC ignored the website's answer | Both | Website answers with codes (`terminal_limit`, `terminal_disabled`); the POS refuses the approval on those two only, and rejects a disabled till at the next sync. Offline or any other error: approval proceeds as before |
| 6 | The Admin "Licence & Plan" tab showed the business name under "Plan name" | Both | The signed lease now carries `plan`; the tab shows "Standard - Business name" |
| 7 | A till disabled on the website showed the generic "isn't allowed to operate" text | POS | Specific "disabled by the administrator" message |
| 8 | A shop with more than 19 tills would hit the website's 20-registrations-a-minute limit every sync, so the last ones never registered | POS | Registration calls are paced after the first 10 |
| 9 | A malformed signing key produced a mystery 500 | Website | Clear 503 with code `server_misconfigured`, and a plain-English problem on the status page |

## The contract

All calls are JSON over HTTPS to `WebsiteDomain.CURRENT`. Errors look like `{ "error": "text for a person", "code": "optional_machine_code" }`.

| Call | Purpose | Notes |
|------|---------|-------|
| `POST /api/pos/terminals/register` | Activate the server PC, and register each approved client | Body: `token, hardwareId (8-200), deviceName, version, localIp, shopName`. 403 codes: `terminal_limit`, `terminal_disabled`, `licence_inactive` |
| `POST /api/pos/license/verify` | Periodic check (server PC only) | Body: `token, hardwareId, version` |
| `POST /api/pos/license/flag` | Report tampering (clock moved back) | Body: `token, hardwareId (optional), reason (1-300)`. Blocks the licence on the server until an admin clears it |

Success body: `{ valid, state, message, lease, signature }`. `lease` is a JSON **string**; `signature` is Ed25519 (base64)
over those exact bytes. Lease fields the POS reads: `v, licenseId, licensee, plan, state, subscriptionStatus, terminalLimit,
expiryDate, issuedAt, validUntil, operational, terminalStatus, flagged`. New fields are always safe to add; the POS ignores
ones it doesn't know.

## What was tested, and what was not

Tested: the website's real code signs leases that the POS's real `LicenseSignature` and `LicenseLease` classes verify and
parse (active, grace, suspended, flagged, disabled till); an edited lease is rejected; the POS's real API client against a
local server returning the website's responses (success, each refusal code, tamper reports); the website's routes with
the database faked (181 tests); the whole Java project compiles with no new errors.

Not tested: the JavaFX screens were not opened (no display available), so the Admin Dashboard fix is a code-level fix
that follows how JavaFX loads FXML, not something I watched run. Nothing was run against your live Firestore, Yoco or
Resend. The PDF, Excel, QR and password-hash libraries could not be downloaded here, so four unrelated files could not be
compiled; they are unchanged.
