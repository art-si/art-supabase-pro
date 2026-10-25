# SheetJS CE 0.20.3

This directory contains the unmodified `xlsx.mjs` and TypeScript declarations from the [official SheetJS CE 0.20.3 release](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz), together with its license. SheetJS [recommends vendoring](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/#vendoring) for stable builds. Keeping the browser module in this source package also lets independently deployed modules install the platform package without a URL-based transitive dependency.

SHA-256 of `xlsx.mjs`: `1a0fb062ee9781b13f6687371b202aafc53b6ce55b530c027e01f9c087b77db`.

On upgrade, replace the module, declarations, and license together from one official release; update this version and hash; then run typecheck, spreadsheet import/export checks, dependency audit, and production build.
