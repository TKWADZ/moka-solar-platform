# SEMS+ authorized report captures

This folder is for local, user-authorized SEMS+ report captures only. Raw JSON and generated XLSX files are ignored by Git because they can contain plant names, station IDs, and inverter serials.

The capture must contain rendered report data only. Never include credentials, cookies, authorization headers, tokens, browser storage, or session data. The converter rejects common authentication field names before writing an import preview.

Create a local system-link file only after reviewing each SEMS+ station against a
Moka system. The file is ignored by Git and must use this shape:

```json
{
  "schemaVersion": 1,
  "links": [
    {
      "stationId": "provider-station-id",
      "systemCode": "MOKA-SYSTEM-CODE",
      "approved": true
    }
  ]
}
```

Prepare a Moka-compatible review workbook without writing the database:

```powershell
cd backend
npm run sems-plus:prepare-import -- ..\imports\sems-plus\capture.json ..\imports\sems-plus\moka-preview.xlsx ..\imports\sems-plus\system-links.json
```

Review `Import ready`, `Needs review`, and `Daily debug` before uploading anything in Admin > Dữ liệu vận hành. A row enters `Import ready` only when it has non-zero provider evidence and an explicitly approved station-to-system link. Unlinked and zero-only/offline rows remain in `Needs review`.
