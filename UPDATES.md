# Installing the app and getting updates

There are two ways to get a real app (no terminal needed to open it). Both put **Book Journal** in the Start menu, and the installer also offers a desktop shortcut. If you do not see a desktop shortcut afterwards, find Book Journal in the Start menu, right-click it, choose *Open file location*, then drag the shortcut onto your desktop.

Your books and settings live in your user folder (`%APPDATA%\com.personal.bookjournal`), not in the app, so installing, updating or removing the app never touches them. The app also backs up the database before any upgrade changes it.

## Option 1: build the app on this computer (no GitHub)

1. Double-click **Build Book Journal.bat** in this folder. The first build takes several minutes.
2. When it finishes, double-click **Book Journal Setup.exe** (it appears in this folder) and install.
3. Open Book Journal from the Start menu from now on.

Windows may say "Windows protected your PC" because the installer is not signed by a company. Click **More info**, then **Run anyway**. You made the app yourself.

To get a newer version this way, replace the project files with the new ones and double-click the .bat file again, then run the new Setup.exe over the old one.

## Option 2: automatic updates through GitHub (one-time setup)

After this, the app checks for a newer version when it starts and shows a small notice in the corner: **Update and restart** or **Later**. You publish a new version with one command; GitHub builds the installer for you.

### One-time setup

1. **Accounts and tools.** Create a free account at github.com. Install **Git for Windows** from git-scm.com (accept the defaults).
2. **Create the repository.** On GitHub choose *New repository*, name it `book-journal`, and make it **Public** (the app downloads updates from it; a private one would need a secret key inside the app). Your reading data is never in the repository: the database lives in your user folder, and the sample data used by the tests (`tests/fixtures`) is left out by `.gitignore`.
3. **Make the signing key** (this proves an update came from you). In a terminal in this folder run:
   `npx tauri signer generate -w "%USERPROFILE%\.tauri\book-journal.key"`
   Choose a password when asked (and remember it). This creates `book-journal.key` (private) and `book-journal.key.pub` (public) in `C:\Users\<you>\.tauri`. **Keep a copy of the private key and the password somewhere safe.** If you lose them, installed copies can no longer be updated and would need a fresh install.
4. **Tell the app where to look.** Open `src-tauri\tauri.conf.json` and change two things under `plugins` → `updater`:
   - `pubkey`: paste the whole contents of `book-journal.key.pub`.
   - `endpoints`: replace `YOUR-GITHUB-NAME` with your GitHub user name.
5. **Give GitHub the key.** In your repository: *Settings → Secrets and variables → Actions → New repository secret*. Add `TAURI_SIGNING_PRIVATE_KEY` (the whole contents of `book-journal.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (your password).
6. **Put the project on GitHub (first time only).** In a terminal in this folder:
   ```
   git init
   git add -A
   git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-NAME/book-journal.git
   git push -u origin main
   ```
   A browser window asks you to sign in to GitHub the first time.
7. In the repository: *Settings → Actions → General → Workflow permissions* → choose **Read and write permissions** → Save.

### Publishing a version (every time)

1. Put the new project files in the folder (what I send you).
2. In a terminal in this folder: `npm run release -- 0.1.1` (use the next number each time: 0.1.2, 0.1.3 ...).
3. GitHub builds the installer in about 10 minutes (watch *Actions* in your repository). It appears under *Releases* as `Book Journal_0.1.1_x64-setup.exe`.
4. Install that file once to get the app. After that, every installed copy shows the update notice by itself.

The first release is also how you get the installer on your computer; later ones just arrive as updates.
