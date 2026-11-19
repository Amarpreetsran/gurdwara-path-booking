# Automatic WhatsApp messages — setup guide

The website sends three automatic WhatsApp messages:

| When | Message |
|---|---|
| Right after a booking | Booking confirmed: path, dates, reference, bheta status, link |
| When the committee confirms a payment (UPI or at the gurdwara) | Bheta received: amount, receipt number, balance, receipt link |
| 9:00 AM the day before the aarambh | Reminder: path, dates, reference, balance, office phone |

**Test mode:** while `WA_TEST_TO` is set (Step 5), every message goes **only to 9996056369**,
whatever number the devotee typed. Nothing reaches the sangat until you remove it.

Costs: setting up and testing with Meta's free test number costs nothing. When you go live,
Meta charges per message delivered (about ₹0.15–₹0.25 each in India for these messages).

---

## Step 1 — Move the website to GitHub (needed once)

Netlify can only run the WhatsApp part (the "functions") when the site comes from GitHub,
not from drag-and-drop.

1. Make a free account at **github.com**.
2. Click **+ → New repository**. Name: `gurdwara-path-booking`. Choose **Private**. Click **Create repository**.
3. On the new page click **uploading an existing file**.
4. Unzip `gurdwara-path-booking.zip`, open the **gurdwara-path-booking** folder, select **everything inside it**
   (`public`, `netlify`, `netlify.toml`, `firestore.rules`, the `.md` files) and drag it onto the GitHub page.
   Click **Commit changes**.
5. In **Netlify**: open your site **babajeonsinghpathbooking** → **Site configuration → Build & deploy →
   Continuous deployment → Link repository** → **GitHub** → allow access → pick `gurdwara-path-booking`.
   Leave build command empty; publish directory `public`; functions directory `netlify/functions`. **Deploy**.

From now on, to update the site: upload changed files to GitHub (Add file → Upload files). Netlify
redeploys by itself in about a minute. **Don't use drag-and-drop on Netlify any more** — it would remove the WhatsApp part.

## Step 2 — Firebase server key

1. Firebase console → ⚙️ **Project settings → Service accounts** → **Generate new private key** → **Generate key**.
2. A `.json` file downloads. Open it in Notepad and copy **everything**.
3. Keep this file private. It gives full access to the booking database. Don't email it or put it on GitHub.

## Step 3 — Meta WhatsApp (free test number)

1. Go to **developers.facebook.com**, log in with Facebook, click **My Apps → Create App**.
2. Choose **Other → Business** (or "Connect with customers through WhatsApp"), name it `Gurdwara Path Booking`, create.
3. On the app page, find **WhatsApp → Set up**. Create or choose a Meta Business account when asked.
4. Open **WhatsApp → API Setup**. You'll see:
   - a **Test number** (Meta's, free),
   - **Phone number ID** (copy it),
   - **Temporary access token** (copy it; it works for 24 hours — fine for the first test).
5. Under **To**, click **Manage phone number list → Add phone number**, enter **+91 9996056369**, and
   type the code WhatsApp sends you. (You can add up to 5 test numbers.)

## Step 4 — Create the three message templates

Meta → **WhatsApp Manager → Message templates → Create template**. For each one:
Category **Utility**, Language **English**, the exact name below, paste the body, and fill the sample
values Meta asks for (use the examples). Submit. Approval usually takes minutes to a day.

**1. `path_booking_confirmed`**
```
Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh. Your booking for {{1}} on {{2}} at {{3}} for {{4}} parivar is confirmed. Booking reference: {{5}}. Bheta status: {{6}}. To see your booking, pay or open receipts, visit {{7}} and tap My booking. Thank you.
```
Samples: Akhand Path Sahib · Fri, 20 Nov, 2026 (bhog Sun, 22 Nov, 2026) · Gurdwara Baba Jeon Singh Ji · Sra · K7MQ2D · advance of ₹1,020 due now · https://babajeonsinghpathbooking.netlify.app

**2. `path_bheta_received`**
```
Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh. We have received your bheta of {{1}} for {{2}} on {{3}} (reference {{4}}). Receipt number: {{5}}. {{6}}. Your receipt: {{7}} Thank you.
```
Samples: ₹1,020 · Akhand Path Sahib · Fri, 20 Nov, 2026 · K7MQ2D · GBJS/2026-27/0001 · Balance due: ₹3,580 · https://babajeonsinghpathbooking.netlify.app/receipt.html?ref=K7MQ2D&n=1

**3. `path_aarambh_reminder`**
```
Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh. Reminder for {{1}} parivar: your {{2}} begins tomorrow, {{3}}, at {{4}}. Booking reference: {{5}}. Bheta status: {{6}}. For any help, call {{7}}. Waheguru Ji Ki Fateh.
```
Samples: Sra · Akhand Path Sahib · Fri, 20 Nov, 2026 · Gurdwara Baba Jeon Singh Ji · K7MQ2D · ₹1,020 received, balance ₹3,580 due before the bhog · 98765 00000

## Step 5 — Put the keys into Netlify

Netlify → your site → **Site configuration → Environment variables → Add a variable** (one by one):

| Key | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole content of the `.json` file from Step 2 |
| `FIRESTORE_DATABASE` | `default` |
| `WA_TOKEN` | the access token from Step 3 |
| `WA_PHONE_ID` | the Phone number ID from Step 3 |
| `WA_TEST_TO` | `919996056369` |
| `SITE_URL` | `https://babajeonsinghpathbooking.netlify.app` |

Then **Deploys → Trigger deploy → Deploy site**, so the functions pick up the keys.

## Step 6 — Test

1. Open `https://babajeonsinghpathbooking.netlify.app/.netlify/functions/wa-test`.
   It should say **Sent**, and 9996056369 gets Meta's "Hello World" message. If it says *Could not send*,
   the message explains why (usually an expired token or a wrong Phone number ID).
2. Once the three templates are **approved**, make a test booking on the site. 9996056369 gets
   **Booking confirmed** within seconds.
3. Report a payment, confirm it on the committee page → **Bheta received** arrives.
4. Book a date for tomorrow (or wait for a real one): the **reminder** goes at 9:00 AM the day before.
   Netlify → **Logs → Functions → reminders** shows what was sent each morning.

Firestore keeps a record of every message in the `notices` collection (sent / failed and why), and a
message is never sent twice.

## Step 7 — Go live (later)

1. Get a **dedicated number** for the gurdwara (a new SIM not used on the WhatsApp app).
2. Meta → WhatsApp → **API Setup → Add phone number**, verify it, set the display name (gurdwara name),
   and add a **payment method** (WhatsApp Manager → Payment settings).
3. Create a **permanent token**: Meta Business settings → **System users** → add a system user (Admin) →
   **Generate token** for your app with `whatsapp_business_messaging` and `whatsapp_business_management`.
4. In Netlify, update `WA_TOKEN` (permanent token) and `WA_PHONE_ID` (the new number's ID),
   **delete `WA_TEST_TO`**, and trigger a deploy. Messages now go to each devotee's own number.
