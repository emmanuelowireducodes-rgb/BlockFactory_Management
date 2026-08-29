# Phase 2A Google Apps Script setup

## 1. Configure Script Properties

In the Apps Script project, open **Project Settings** and add these **Script properties**:

| Property | Value |
| --- | --- |
| `MASTER_SPREADSHEET_ID` | The master spreadsheet ID: the portion of its URL between `/d/` and `/edit`. |
| `PASSWORD_PEPPER` | A unique, high-entropy random secret (at least 32 random characters). Keep it private and never put it in the React app or a `.env` file. |

The deployed script's executing account must have Editor access to the master spreadsheet. The Spreadsheet ID is read only by `Database.gs` through Script Properties and is never returned by the API.

## 2. Initialize the master database

In the Apps Script editor, select and run `initializeDatabase`. Authorize the script when Google prompts you. It safely creates `COMPANIES` and `USERS` with the headers defined in `Config.gs`; later runs preserve existing data and validate the headers instead of overwriting them.

## 3. Deploy the web app

Deploy **New deployment** → **Web app**:

- Execute as: **Me** (the account that can edit the master spreadsheet)
- Who has access: a setting that permits your PWA users to reach the endpoint. The current manifest uses `ANYONE_ANONYMOUS`; access is protected by application sessions.

Copy the deployment URL ending in `/exec`. Create a local `.env.local` from `.env.example` and set `VITE_API_URL` to that URL. Do not commit `.env.local`.

## 4. Verify without exposing secrets

`GET ?action=health` should return `{ "success": true, ... }`. All protected calls require the session token returned by `login`. For `getCompanies`, the frontend sends the token in the GET query because that is the established `api.js` contract; avoid sharing or logging that URL.
