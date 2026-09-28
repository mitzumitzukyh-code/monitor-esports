# Mini App asset payload

This directory contains the exact base64 payload for the web-optimized Monitor eSports Mini App asset pack.

- Parts: `part-00.txt` … `part-06.txt`
- Combined base64 length: `55256`
- Decoded ZIP size: `41442` bytes
- ZIP SHA-256: `77ff70bf59a81392c69c7b80a7d7ad808f17b934b8ec649402da134baea16ff2`

Do not edit the parts manually.

Materialize the assets from repository root with:

```powershell
powershell -ExecutionPolicy Bypass -File .\design\unpack-miniapp-assets.ps1
```

The unpacker validates the payload before extracting `miniapp/public/assets/`.
