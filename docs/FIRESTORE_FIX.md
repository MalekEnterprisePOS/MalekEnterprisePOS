# Fix: "Native mode API is disabled" and "Google sign-in isn't enabled for this website address"

## Problem 1: the database can't be used (red items in /api/health)

**Cause.** `firebase.json` contained `"edition": "enterprise"`. When you ran `firebase deploy --only firestore`, the Firebase CLI
created a database called `default` as **Enterprise edition**, and Enterprise databases are created with the normal Firestore API
switched OFF (they default to MongoDB-compatible mode). That setting is fixed when the database is created, so no setting on
the website can fix it. The site needs a **Standard edition** database in **Native mode**.

`firebase.json` is already corrected in this zip (standard edition, database `(default)`), so this can't happen again.

### Steps (about 5 minutes)

1. **Create the right database.** Firebase Console > project `malek-enterprise-pos` > Firestore Database > **Add database**
   (or Create database if the list is empty).
   - Edition: **Standard**
   - Database ID: **(default)** (keep the brackets)
   - Location: pick one and keep it (it can't be changed later). `us-east4` is next to your App Hosting backend.
   - Mode: **Production mode** (your rules are deployed in step 3)
2. **Delete the old one.** In the same Firestore page open the database list, choose `default` (the Enterprise one) and delete it.
   The website never managed to use it, so nothing of yours is in it.
3. **Deploy your security rules and indexes to the RIGHT project.** In the website folder:
   ```
   firebase deploy --only firestore --project malek-enterprise-pos
   ```
   The `--project` part matters: your earlier deploy went to a different project (`malekenterprisepos`).
4. **Tell the website the database is `(default)`.**
   - Firebase App Hosting: this zip's `apphosting.yaml` already sets it. Also delete `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`
     from the Console environment if it is there as `default`.
   - Vercel (if you use it): delete `NEXT_PUBLIC_FIRESTORE_DATABASE_ID`, or set it to `(default)`.
   - Local: in `.env.local` delete the `NEXT_PUBLIC_FIRESTORE_DATABASE_ID=default` line (or set it to `(default)`).
5. **Redeploy / restart** (`npm run dev` again locally, or push and create a rollout), then open `/api/health`. Every line should be green.
6. If the admin account is missing afterwards: `npm run admin:grant -- you@example.com`.

## Problem 2: Google sign-in says the address isn't enabled

**Cause.** Firebase only lets Google sign-in run on addresses listed under Authorized domains. Your list has `localhost`,
`malek-enterprise-pos.firebaseapp.com`, `malek-enterprise-pos.web.app` and `google.com`. It does **not** have the address the
site actually runs on.

1. Firebase Console > Authentication > Settings > **Authorized domains** > **Add domain**, one at a time, hostname only
   (no `https://`, no path):
   - `malek-enterprise-pos--malek-enterprise-pos.us-east4.hosted.app`
   - `malek-enterprise-pos.vercel.app` (only if you also use Vercel)
   - your own domain later, when you buy one
2. Authentication > Sign-in method > **Google** must be **Enabled** (it asks for a support email).
3. Testing on your own PC? Open **http://localhost:3000**. `127.0.0.1` and your PC's network address (192.168...) are different
   addresses and are not authorised.
4. The error message on the sign-in page now ends with "The address to add is: ..." showing the exact address that was refused.
   The `google.com` entry in your list is unnecessary but harmless.

## Check it worked
- `/api/health` all green, including "Firestore via server credentials".
- The contact form saves, the admin dashboard loads data, and "Continue with Google" opens Google's window.
