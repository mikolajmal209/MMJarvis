# MMJarvis (Jarvis)

A free personal AI assistant for your phone and computer. Talk or type to it, and it answers questions, manages your tasks, remembers what you tell it, plans your day from Google Calendar, and tracks your job applications from Gmail.

- **App:** an installable web app (PWA) built with React, TypeScript and Vite. One app runs on Android, iPhone, Windows and Mac.
- **AI:** Google Gemini through its free API tier. The model in use is shown in the chat header and can be changed in Settings.
- **Voice:** the browser's built-in speech recognition and speech output (best in Chrome or Edge).
- **Storage:** chat history, tasks, remembered facts and applications are stored on your device (IndexedDB).
- **Gmail and Calendar:** a small Google Apps Script (`apps-script/Code.gs`) that runs free in your own Google account.

## 1. Get a Gemini API key (free)

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in with your Google account.
2. Click **Create API key** and copy it.
3. In Jarvis, open **Settings** and paste it into **Gemini API key**.

The free tier has daily limits. On the free tier Google may use the content you send to improve its products, so do not paste anything you would not want to share.

## 2. Run or install the app

Run it locally:

```bash
npm install
npm run dev
```

Publish it for free with GitHub Pages: push this repository to GitHub, then in the repository open **Settings > Pages** and set **Source** to **GitHub Actions**. Every push to `main` deploys the app to `https://<your-user>.github.io/<repo>/`.

To install it, open that address on your phone (Chrome: menu > **Add to Home screen**; Safari: Share > **Add to Home Screen**) or on your computer (the install icon in Chrome or Edge's address bar).

## 3. Connect Gmail and Google Calendar (optional, free)

1. Open [script.google.com](https://script.google.com) and create a **New project**. Name it "Jarvis bridge".
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs) from this repository and save.
3. Open **Project Settings** (gear icon) > **Script properties** and add:
   - `GEMINI_API_KEY`: your Gemini key (used to read job emails).
   - `GEMINI_MODEL` (optional): defaults to `gemini-flash-latest`.
4. Back in the editor, choose the `setup` function and click **Run**. Approve the permissions Google asks for (Gmail, Calendar, Sheets, external requests). Google warns that the app is unverified, because it is your own script: click **Advanced > Go to Jarvis bridge**.
5. Open **Execution log** and copy the **secret token** it printed.
6. Click **Deploy > New deployment**, type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy** and copy the **Web app URL**.
7. In Jarvis, open **Settings**, paste the URL and the token, and click **Test connection**.

"Anyone" only means the URL is reachable; every request must carry your secret token. Keep the token private.

### What the job tracker does

Every hour the script searches Gmail for application-related emails (English and Polish keywords) from the last two days, and on the first run the last 30 days. Only those emails are sent to Gemini, which works out the company, role and what happened (CV sent, reply, interview, offer, rejection). The results go into a **Jarvis job applications** spreadsheet in your Google Drive, which the **Jobs** screen reads.

- Interviews with a stated time are added to Google Calendar, with reminders a day before and an hour before.
- Applications with no answer for 14 days are marked **No reply**, and Jarvis suggests a follow-up.
- You can change any status yourself on the Jobs screen, or tell Jarvis ("I applied to Acme for a frontend role").

## Asking Jarvis

- "What's my plan for today?" checks your calendar and tasks.
- "Remind me to call mom tomorrow at six" adds a task.
- "Remember that I'm looking for junior frontend jobs in Warsaw" saves a lasting fact (see **Settings > Memory**).
- "How are my applications going?" and "Help me prepare for my next interview."

## Adding abilities later

Everything Jarvis can do is a tool in [`src/ai/tools.ts`](src/ai/tools.ts). To add something new, such as smart home control, add one entry with a name, description, parameters and a `run` function; the AI starts using it automatically.

## Project layout

```
src/ai/gemini.ts        conversation with Gemini, memory and tool calls
src/ai/tools.ts         everything Jarvis can do
src/google/             the Apps Script bridge client and job sync
src/components/         Chat, Voice, Tasks, Jobs and Settings screens
src/db.ts               on-device storage
apps-script/Code.gs     Gmail, Calendar and job tracking (runs in your Google account)
```
