# Table Hub

`table-hub.cjs` is the program that runs on the technician's laptop (see HANDOFF.md, "Table Screens Phase 2"). Two ways it is delivered, both from the technician's link (`/api/public/screens/<code>/tables/program?file=…`):

- **`exe`** — one Windows file, nothing to install. It is Node.js with the program injected (Node "single executable"); the link is the long code in the file name (`TableHub-<code>.exe`).
- **`hub` + `bat`** — `table-hub.cjs` with the link baked in, plus a launcher; needs Node.js.

## Rebuilding the .exe (after changing table-hub.cjs)
The exe stored in the assets bucket is a copy of the program, so rebuild and re-upload it whenever `table-hub.cjs` changes, and bump `PROGRAM_VERSION` (and `MIN_PROGRAM_VERSION` in `app/lib/screens/table-live.ts` only if the console needs the new behaviour).

```
cp table-hub.cjs /tmp/sea/ && cd /tmp/sea
echo '{ "main": "table-hub.cjs", "output": "sea.blob", "disableExperimentalSEAWarning": true }' > sea-config.json
node --experimental-sea-config sea-config.json
curl -L -o TableHub-win.exe https://nodejs.org/dist/v<NODE VERSION OF THIS MACHINE>/win-x64/node.exe     # same Node version as the machine making the blob
npx postject TableHub-win.exe NODE_SEA_BLOB sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
gzip -9 -k TableHub-win.exe        # upload to bucket event-stakeholder-assets as tools/table-hub/TableHub-win-x64-v1.exe.gz (bump v1 and EXE_PATH in the route for a new version)
```
The Windows exe is not code-signed, so Windows shows "Windows protected your PC — More info — Run anyway" the first time.
