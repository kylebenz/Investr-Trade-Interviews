# Investr Trades · Closer application

A single-page application form (`index.html`) for high-ticket closer candidates. When a candidate submits, a Netlify Function emails the application to your Gmail:

- **Email body:** every answer, in form order, as plain text and as a formatted HTML table.
- **Attachment:** a PDF of the full application, with each interview question printed above its Vocaroo link.
- **Reply-To:** set to the candidate's address, so pressing Reply in Gmail writes to them.

If the function is unavailable or can't send, the page falls back to FormSubmit (formsubmit.co), so applications are not lost.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole page: HTML, CSS and JS. `CONFIG` sits at the top of the `<script>`. |
| `netlify/functions/submit-application.mjs` | `POST /api/submit-application`. Validates the application and sends it through Gmail. |
| `netlify/lib/application-email.mjs` | Builds the text email, HTML email and PDF. |
| `netlify.toml` | Build settings. Only `index.html` is published; the function code stays private. |

## Deploy on Netlify (about 10 minutes)

### 1. Create a Gmail App Password

Google won't let an app sign in with your normal password, so you need an App Password.

1. Turn on 2-Step Verification for kylebenzduhilag0@gmail.com: <https://myaccount.google.com/signinoptions/twosv>
2. Open <https://myaccount.google.com/apppasswords>, name it `Netlify applications`, and click **Create**.
3. Copy the 16-character password. Google only shows it once.

### 2. Import the repo into Netlify

1. Go to <https://app.netlify.com>, then choose **Add new project** > **Import an existing project** > **GitHub**.
2. Pick `kylebenz/Investr-Trade-Interviews` and the branch you want live, such as `main` once this branch is merged.
3. Leave the build settings alone. `netlify.toml` fills them in.

### 3. Add the environment variables

Go to **Project configuration** > **Environment variables** and add:

| Key | Value |
| --- | --- |
| `GMAIL_USER` | `kylebenzduhilag0@gmail.com` |
| `GMAIL_APP_PASSWORD` | the 16-character App Password (spaces are fine) |
| `MAIL_TO` | optional. Where applications go. Defaults to `GMAIL_USER`. |

Mark `GMAIL_APP_PASSWORD` as a secret if Netlify offers the option. Then go to **Deploys** > **Trigger deploy** > **Deploy site**, because new variables only take effect after a redeploy.

### 4. Send a test application

Open the live URL and submit a test application. Within a minute you should get an email titled **"New Closer Application: {name}"** with the PDF attached. If nothing arrives:

- Check spam the first time.
- In Netlify, go to **Logs** > **Functions** > `submit-application`. A line such as `sendMail failed: Invalid login` means the App Password or `GMAIL_USER` is wrong.

## FormSubmit fallback

`CONFIG.FORM_ENDPOINT` in `index.html` is only used if the Netlify Function is missing, not configured, or can't send. Opening `index.html` straight from your computer also uses it. The first FormSubmit submission sends a one-time **activation email** to the inbox, and you must confirm it before FormSubmit delivers anything. After activating, you can replace the address in `FORM_ENDPOINT` with FormSubmit's random-string alias to hide it. Set `FORM_ENDPOINT: ""` to turn the fallback off.

## Limits

- Gmail allows about 500 sent emails a day on a personal account, which is plenty for applications.
- The PDF uses built-in PDF fonts. Common accented letters print correctly and a few others are transliterated (Ł → L). Characters from non-Latin alphabets print as `?` in the PDF only. The email body always shows them correctly.
