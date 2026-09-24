# BeatBond JioSaavn relay

JioSaavn shows different search results depending on the country the request comes from.
Outside India it hides many licensed originals. For example, "Espresso" returns only covers
instead of Sabrina Carpenter's song, and "Heeriye" misses Arijit Singh's version.

Render has no India region, so the BeatBond backend sends its JioSaavn calls through this
small relay. It runs as a free Vercel function in **Mumbai (`bom1`)**, so JioSaavn sees an
Indian IP. The relay only forwards to `https://www.jiosaavn.com/api.php`, and only for requests
that carry the secret key.

## Deploy (about 5 minutes, free)

1. **Create a secret key.** Run this and copy the output:
   ```
   node -e "console.log(crypto.randomUUID())"
   ```
2. **Create the Vercel project.** In [vercel.com](https://vercel.com), go to **Add New → Project**
   and import the BeatBond GitHub repo. Then set:
   - **Root Directory:** `saavn-relay`
   - **Framework Preset:** Other (no build command needed)
   - **Environment Variable:** `RELAY_KEY` = the key from step 1
3. **Deploy.** Then open **Settings → Functions** and check that the region is
   **Mumbai, India (bom1)**. `vercel.json` requests it, but confirm it.
4. **Test it.** Replace `<relay>` and `<key>`. The titles should say *Espresso* and the
   artist should be Sabrina Carpenter:
   ```
   curl -H "x-relay-key: <key>" "https://<relay>.vercel.app/api.php?__call=search.getResults&_format=json&api_version=4&ctx=web6dot0&n=3&q=espresso"
   ```
   Without the header you should get `403 Forbidden`.
5. **Point the backend at it.** In Render, open the BeatBond service → **Environment** and add
   the following, then redeploy:
   - `SAAVN_API_BASE` = `https://<relay>.vercel.app`
   - `SAAVN_RELAY_KEY` = the same key

Leave both variables unset locally. From India, the backend can call JioSaavn directly.

## Check it worked

On the live site, search **espresso**, **blinding lights** and **heeriye**. The original
artists (Sabrina Carpenter, The Weeknd, Arijit Singh) should now appear at the top.
