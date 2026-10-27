# Driver OCR runtime assets

These files are self-hosted so certificate images can be processed in the user's browser without loading OCR code or language data from a third-party CDN.

- `worker.min.js`: Tesseract.js 7.0.0 (Apache-2.0); bundled third-party notices are in `worker.min.js.LICENSE.txt`.
- `core/tesseract-core-*-lstm.wasm.js`: Tesseract.js Core 7.0.0 (Apache-2.0); license is in `core/LICENSE`.
- `langs/chi_sim.traineddata.gz`: `@tesseract.js-data/chi_sim` 1.0.0, `4.0.0_best_int` (MIT).

Only the LSTM core variants are shipped because the application initializes the LSTM OCR engine. The npm package versions are pinned in the repository lockfile.
