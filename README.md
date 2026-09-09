# Imara File Portal

A login-gated file browser (Box.com-style) powered by a **Framer Code Component** with files stored in this GitHub repo.

## Quick Start

### 1. Push This Repo
Push all files to `https://github.com/JazzeeBlaze/imara` using GitHub Desktop.

### 2. Create a GitHub PAT (for activity logging)
1. Go to **GitHub → Settings → Developer Settings → Fine-grained Personal Access Tokens**
2. Click **Generate new token**
3. **Repository access** → Select **"imara"** only
4. **Permissions** → Contents → **Read and Write**
5. Generate and copy the token
6. Paste it into the `GITHUB_PAT` constant in `LoginPortal.tsx` (line 12)

### 3. Add the Code Component to Framer
1. Open your Framer project
2. Go to **Assets** panel → **Code** → click **+** → **New file**
3. Name it `LoginPortal`
4. Paste the entire contents of `LoginPortal.tsx`
5. Save, then drag the **LoginPortal** component onto your page
6. Resize it to **fill the page** (100% width × 100% height)

### 4. Add Your Logo
Place your logo as `assets/logo.png` in this repo. It will appear on both the login page and file browser header. If no logo exists, a "YOUR LOGO" placeholder shows instead.

---

## Managing Users

### Add a user (interactive)
```powershell
.\add-user.ps1
```

### Add a user (manual)
Compute the SHA-256 hash of the password:
```powershell
$p = "the-password"
$b = [System.Text.Encoding]::UTF8.GetBytes($p)
$h = [System.Security.Cryptography.SHA256]::Create().ComputeHash($b)
($h | ForEach-Object { $_.ToString("x2") }) -join ""
```
Then add an entry to `users.json`:
```json
{
  "username": "janedoe",
  "passwordHash": "<paste-hash-here>",
  "displayName": "Jane Doe"
}
```

### Sample credentials (for testing)
- **Username:** `demo`
- **Password:** `password123`

> ⚠️ **Change or remove the demo user before going live!**

---

## Managing Files

1. Add files and folders to the `Storage/` directory
2. Run the manifest generator:
   ```powershell
   .\update-manifest.ps1
   ```
3. Commit and push via GitHub Desktop

The `files.json` manifest is what the file browser reads to display the listing. **Always regenerate it** after adding or removing files.

---

## File Structure

```
├── LoginPortal.tsx        # Framer code component (login + file browser UI)
├── users.json             # User credentials (SHA-256 hashed passwords)
├── files.json             # Auto-generated file/folder manifest
├── activity-log.json      # Login & download activity tracking
├── update-manifest.ps1    # PowerShell: regenerate files.json
├── add-user.ps1           # PowerShell: add a new user
├── README.md              # This file
├── assets/                # Branding
│   └── logo.png           # Your brand logo (add manually)
└── Storage/               # All downloadable files go here
    ├── Floorplans/
    ├── Price Lists/
    └── ...
```

## Activity Log

All logins and file downloads are tracked in `activity-log.json` (requires a GitHub PAT). Each entry records:

| Field | Example |
|-------|---------|
| `username` | `johndoe` |
| `displayName` | `John Doe` |
| `action` | `login` or `download` |
| `detail` | `Floorplans/Unit-A.pdf` (downloads only) |
| `timestamp` | `2026-09-09T13:00:00.000Z` |

View the log directly on GitHub or pull the repo to inspect locally.

---

## Security Note

This system uses **client-side authentication** — it provides a "front door" lock for casual access control. It is **not** designed for highly confidential data. Adequate for sharing real estate project documents with specific clients.
