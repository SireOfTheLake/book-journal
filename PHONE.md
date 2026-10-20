# Book Journal on your iPhone

The phone version is a web page that works like an app. It keeps its own copy of your journal on the phone, so it opens instantly and works with no signal, and it syncs through the same Supabase project as the computer.

## What it does
- Home: what you are reading, your Up Next list, and recently edited books. Search is one tap away.
- Book log: every field except the series and author pages. Status, rating, dates, format, genres, tropes, themes, heat level, characters, notes, reading log, source, narrators, point of view, owned copies, favorites. The optional cards (mood and pace, content warnings, why I stopped, recommended by) follow the switches you set on the computer.
- Characters: role in each book, gender, age, occupations, tags, notes. Relationships can be read on the phone and edited on the computer.
- Add a book: title, author (it matches "AJ Sherwood" to "A.J. Sherwood"), series, where to put it, cover.
- Sync: status, changes waiting, covers, install help.

Series, authors, quotes, reading orders and the dashboards stay on the computer for now.

## One-time setup
1. **Put the page online.** The easiest way is GitHub Pages: in your repository open **Settings > Pages**, set **Source** to **GitHub Actions**. The next release (`npm run release -- X.Y.Z`) then publishes the phone page automatically, or run **Actions > Phone web app > Run workflow** to publish it now. The address is shown on that workflow run, and looks like `https://YOURNAME.github.io/book-journal/`.
   - GitHub Pages is free for public repositories only. If yours is private, run `npm run build:phone` and drag the `dist-phone` folder onto Netlify Drop (app.netlify.com/drop), or use Cloudflare Pages. Nothing private is in the page: your journal data is only ever in Supabase and on your own devices.
2. **On the computer**, open **Settings > Sync** and press **Copy phone setup code**. Send it to yourself (a note, a message).
3. **On the iPhone**, open the address from step 1 (for example `https://YOURNAME.github.io/book-journal/`; it is also shown on the successful "Phone web app" run under Actions) in Safari, tap **Share > Add to Home Screen**, then open Book Journal from the Home Screen.
4. Paste the setup code, enter your Supabase email and password, and tap Sign in. The first sync brings your journal across (about 17 MB; keep the screen open for a minute).
5. On the Sync screen, tap **Download covers** while on Wi-Fi (about 76 MB). iPhone web apps cannot tell Wi-Fi from mobile data, so covers only download when you ask. After that, new covers arrive on their own.

## Good to know
- Open it from the Home Screen icon, not from Safari. iPhone keeps a Home Screen app's saved data; a plain Safari tab can be cleared after a week without use. If the phone ever loses its copy, signing in again brings it all back from the cloud.
- Changes sync within a second or two when you are online, and wait on the phone when you are not.
- After an update that changes the database, run the new setup script in Supabase (as on the computer), update the desktop app, then open the phone app once with a connection. It updates itself; close and reopen it if it looks unchanged.
- A cover added on the phone is shrunk to a size that syncs quickly.
