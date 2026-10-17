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

**"The project folder"** below always means the folder that contains `package.json`, `src` and `src-tauri`, for example `C:\Users\bmiku\Documents\Book Journal\book-journal`.
**"Open a terminal in the project folder"** means: open that folder in File Explorer, click the address bar at the top, type `cmd` and press Enter. A black Command Prompt window opens already pointed at the folder (type `dir`; you should see `package.json`).

### Step 1. Accounts and tools
1. Make a free account at https://github.com if you do not have one. Your **GitHub user name** is the name shown in your profile address (github.com/**name**).
2. Install **Git for Windows** from https://git-scm.com/download/win. Accept every default. Close and reopen any terminal afterwards.
3. Tell Git who you are (once). In any terminal:
   ```
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

### Step 2. Create the (empty) repository on GitHub
1. On github.com click the **+** at the top right, then **New repository**.
2. **Repository name:** `book-journal`.
3. **Visibility: Public.** (The app has to be able to download updates without a password. Your reading data is never in the repository, see Step 6.)
4. Under "Initialize this repository", **leave everything off**: do **not** tick "Add a README file", leave **Add .gitignore** on **No .gitignore**, and leave **Add license** on **No license**. The project already has its own `.gitignore` and README, and a repository that already contains files would reject the first upload.
5. Click **Create repository**. Leave that page open; you will come back to it.

### Step 3. Make the signing key
This key proves an update really came from you.
1. Open a terminal in the project folder (see above).
2. Run:
   ```
   npx tauri signer generate -w "%USERPROFILE%\.tauri\book-journal.key"
   ```
3. It asks for a password. Pick one and remember it (or just press Enter for none; then you can skip the password secret in Step 5).
4. It creates two files in `C:\Users\bmiku\.tauri` (that is the `.tauri` folder inside your user folder; it may be hidden, but the commands below still work):
   - `book-journal.key`: the **private** key. Never share it and never put it in the project folder.
   - `book-journal.key.pub`: the **public** key.
5. **Back both files up** somewhere safe (a USB drive, or a password manager note) together with the password. If you lose the private key or password, installed copies of the app can never be updated again; you would have to install a fresh copy.

### Step 4. Tell the app where to look for updates
1. In the project folder open `src-tauri` and right-click `tauri.conf.json`, then **Open with**, then **Notepad**.
2. Find the `"plugins"` section near the bottom. Change two lines:
   - `"pubkey": "..."`: delete everything between the quote marks after `"pubkey": ` and paste the **entire contents** of `book-journal.key.pub`. To see and copy it, in a terminal run `notepad "%USERPROFILE%\.tauri\book-journal.key.pub"`, press Ctrl+A, Ctrl+C, close Notepad, and paste. It is one long line of letters and numbers.
   - In the `"endpoints"` line replace `YOUR-GITHUB-NAME` with your GitHub user name.
3. Save the file (Ctrl+S). Keep the quote marks and commas as they were.

### Step 5. Give GitHub the private key
1. On your repository page on github.com click the **Settings** tab (far right of the tab row).
2. In the left menu click **Secrets and variables**, then **Actions**.
3. Click **New repository secret**. Name: `TAURI_SIGNING_PRIVATE_KEY`. Secret: the **entire contents** of `book-journal.key` (in a terminal run `notepad "%USERPROFILE%\.tauri\book-journal.key"`, Ctrl+A, Ctrl+C, then paste). Click **Add secret**.
4. Click **New repository secret** again. Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Secret: your password. Click **Add secret**. (Skip this one if you used no password.)
5. In the left menu click **Actions**, then **General**. Scroll to **Workflow permissions**, choose **Read and write permissions**, and click **Save**.

### Step 6. Upload the project (first time only)
1. Open a terminal in the project folder.
2. Run these one at a time, pressing Enter after each (replace `YOUR-GITHUB-NAME`):
   ```
   git init
   git add -A
   git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/YOUR-GITHUB-NAME/book-journal.git
   git push -u origin main
   ```
   The first push should open a browser window asking you to sign in to GitHub; approve it. Messages about "LF will be replaced by CRLF" are normal.
   **If you get "Invalid username or token. Password authentication is not supported"**, Git did not get a proper sign-in. Use a token instead (see "If the push is refused" at the end of this file), then run `git push -u origin main` again.
3. **About the `.gitignore` file:** the project already includes one. You do not need to do anything with it. It keeps out `node_modules`, build output, key files and the `tests/fixtures` folder (sample reading data the tests use, so none of your real reading history is uploaded). To check, run `git ls-files tests/fixtures`. It should print nothing. If it prints file names, tell me before going further.
4. Refresh the repository page on github.com. You should see your files.

### Publishing a version (every time, including the first)
1. Put the project files you want to publish in the folder (what I send you).
2. Open a terminal in the project folder and run: `npm run release -- 0.1.1` (use the next number each time: 0.1.2, 0.1.3 ...). This sets the version, uploads the files and starts the build.
3. On github.com open the **Actions** tab. A run called "Release" appears; it takes about 10 minutes. A green tick means it worked. A red cross means it failed: open it and send me the red error text.
4. When it is done, open the **Releases** section (right side of the repository page). Download `Book Journal_0.1.1_x64-setup.exe` and install it. The first release is how you get the installer; later releases arrive as the update notice inside the app.

## If the push is refused ("Invalid username or token")

GitHub no longer accepts your account password for uploads. Git needs either a browser sign-in or a **personal access token** (a long password-like code you make once). The token route:

1. On github.com click your **profile picture** (top right), then **Settings** (the account settings, not the repository's).
2. At the bottom of the left menu click **Developer settings**, then **Personal access tokens**, then **Tokens (classic)**.
3. Click **Generate new token**, then **Generate new token (classic)**. Sign in again if asked.
4. **Note:** `book-journal`. **Expiration:** choose *No expiration* (or a long one; when it runs out you make a new one the same way).
5. Tick **repo** and also **workflow** (needed because the project includes the build instructions in `.github/workflows`). Leave the rest off.
6. Click **Generate token** at the bottom. **Copy the token now** (it starts with `ghp_`); GitHub shows it only once. Keep it somewhere safe.
7. Clear any wrong saved login. In a terminal run: `cmdkey /delete:git:https://github.com` (a message that it was not found is fine).
8. Run `git push -u origin main` again. When it asks for a **username**, type your GitHub user name. When it asks for a **password**, paste the **token** (nothing appears as you paste; just press Enter). Windows remembers it, so you will not be asked again, including for `npm run release`.

If a sign-in window opens instead of asking in the terminal, choose **Token** (or "Sign in with your browser") and follow it.
