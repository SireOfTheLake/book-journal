# Setting up Supabase for Book Journal

1. In Supabase, open your project, then **SQL Editor > New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and press **Run**.
   It is safe to run again; do it after any Book Journal update that says the database changed.
3. **Authentication > Users**: add yourself (email and password). Under **Authentication > Sign In / Providers**, turn off new sign-ups.
4. **Project Settings > API**: copy the Project URL and the `anon` public key.
5. In Book Journal: **Settings > Sync**. Paste both, press Save, sign in, press Sync now.

Never paste the `service_role` key anywhere in the app.
