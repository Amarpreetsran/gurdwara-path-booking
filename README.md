# Gurdwara Path Booking — setup guide

A website where the sangat books **Akhand Path Sahib, Sehaj Path bhog and Sukhmani Sahib**
for any free date, and the committee manages bookings. It runs free on Google Firebase.

**Try it first:** open `public/index.html` on a computer. Until Step 3 is done it runs in
**demo mode** (bookings saved only on that computer). The committee page is `public/admin.html`;
in demo mode the password is `demo`.

## What's in the folder

| File | What it is |
|---|---|
| `public/index.html` | Booking page for the sangat (no login needed) |
| `public/admin.html` | Committee page: all bookings with phone numbers, cancel, closed dates, gurdwara details |
| `public/firebase-config.js` | Where you paste your Firebase keys (Step 3) |
| `public/js/common.js` | Path types, timings and occasions; edit here to change them |
| `firestore.rules` | Security rules (Step 2). They stop double booking and keep phone numbers private |
| `firebase.json`, `.firebaserc` | Only needed for Option A in Step 6 |

You need a Gmail account and, for Step 6, a computer (a phone is hard for uploading a folder).

---

## Step 1 — Create the Firebase project
1. Go to **console.firebase.google.com** and sign in with Gmail.
2. **Create a project**. Name it, for example, `gurdwara-path-booking`. You can turn Google Analytics off.
3. Stay on the free **Spark** plan. It is enough for a gurdwara (thousands of bookings a day).

## Step 2 — Create the database and paste the rules
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: **asia-south1 (Mumbai)**. Start in **production mode**.
3. Open the **Rules** tab, delete what is there, paste the full contents of `firestore.rules`, click **Publish**.

## Step 3 — Connect the website to Firebase
1. Project Overview (home icon) → click the **`</>` (Web)** icon → give it a nickname → **Register app**.
   Do not tick Firebase Hosting here.
2. Firebase shows a block called `firebaseConfig` with `apiKey`, `authDomain`, `projectId` and so on.
3. Open `public/firebase-config.js` and replace each `PASTE_...` value with yours. Save.
   (These keys are safe to put on a website; the rules from Step 2 protect the data.)
4. Also put your `projectId` in `.firebaserc` in place of `PASTE_PROJECT_ID` (only for Option A below).

## Step 4 — Create the committee login
1. **Build → Authentication → Get started → Email/Password → Enable → Save.**
2. **Users** tab → **Add user** → enter the committee email and a strong password.
3. **Settings** tab → **User actions** → untick **Enable create (sign-up)** → Save.
   This makes sure nobody else can create a login.
4. Copy the **User UID** shown next to the new user (a long code).

## Step 5 — Mark that login as a committee member
1. **Firestore Database → Data → Start collection**. Collection ID: `admins`.
2. Document ID: paste the **User UID** from Step 4. Add a field `role` = `committee`. Save.
3. Repeat Steps 4.2 and 5 for each extra committee member.

## Step 6 — Put the website online (choose one)

**Option A: Firebase Hosting (address like `gurdwara-path-booking.web.app`)**
On a computer with Node.js installed (nodejs.org), open a terminal in this folder and run:
```
npm install -g firebase-tools
firebase login
firebase deploy
```
It prints your website address when done. Run `firebase deploy` again after any change.

**Option B: Netlify Drop (no installing anything)**
1. On a computer, go to **app.netlify.com/drop** and drag the **`public`** folder onto the page.
2. Netlify gives you an address like `something.netlify.app` (make a free account to keep it and rename it).
3. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** and add that
   netlify address, or the committee login will not work.

A custom address such as `bookpath.yourgurdwara.in` can be added later in either Hosting or Netlify.

## Step 7 — First setup on the live site
1. Open `your-address/admin.html`, sign in with the committee login.
2. Fill in **Gurdwara details** (name, office phone, address) and **Save**. The phone number is
   shown to the sangat for changes and cancellations.
3. Set **Places at the same time** for each path (how many families can book the same date and time,
   1 to 10). Use the − and + buttons and tap **Save places**. You can raise or lower these any time.
4. Add any **Closed dates** (gurpurabs, other programmes).
5. Share the main address with the sangat on WhatsApp, the notice board, or as a QR code.

## For the sangat: add it to the phone like an app
Open the link in Chrome → menu **⋮** → **Add to Home screen** (on iPhone: Safari → Share → Add to Home Screen).
It then opens full-screen with its own icon.

---

## How it works
- **Bookings open from tomorrow up to six months ahead.**
- **Akhand Path** takes a place on two days (the 48-hour path), with bhog on the third morning.
  Sehaj Path bhog is in the morning diwan; Sukhmani Sahib has a 7 AM and a 5 PM slot.
- **Places at the same time:** each path starts at 1 place per date. The committee can raise or lower
  it (up to 10) on the committee page. The booking page then shows "2 of 3 places left" and lists the
  families already booked. Lowering a number keeps existing bookings and only stops new ones above it.
- The calendar shows only the **family name and occasion**. Phone numbers and notes are visible only
  on the committee page.
- Each booking gets a **6-letter reference**. People call the gurdwara office to change or cancel;
  the committee cancels from the committee page.
- Two people can never book the same slot: the database rejects the second one, and that person is
  asked to choose another date.

## Changing timings or paths
Edit `TYPES` in `public/js/common.js` (labels, timings, how many days a path blocks).
If you add a new path type, also add its key to the list in `firestore.rules`
(`['akhand', 'sehaj', 'sukh-am', 'sukh-pm']`) and publish the rules again.

## Good to know
Updated keys
- Anyone with the link can book, without logging in. That keeps it easy for elders. If someone makes
  fake bookings, cancel them from the committee page. If it becomes a problem, Firebase **App Check**
  (free) can be added later to block bots.
- Back up bookings any time from the Firebase console (Firestore → Data).
Updated keys

## Later: Android app
Once the website is online, go to **pwabuilder.com**, enter your website address and download the
Android package. It can be published on the Google Play Store (one-time US$25 Google developer fee)
with the gurdwara's name and icon. No extra coding is needed.
