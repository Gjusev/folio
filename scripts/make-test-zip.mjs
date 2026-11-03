// Creates a test project ZIP (main.tex + bib + figure) for manual import checks.
import { strToU8, zipSync } from "fflate";
import { writeFileSync } from "node:fs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8DAwMDAxIAEAAAAAP//AwB0EQMAAAAA//8DAP0hAwAAAAD//wMA",
  "base64",
);
const tex = [
  "\\documentclass{article}",
  "\\usepackage{graphicx}",
  "\\begin{document}",
  "Review of long-document attention~\\cite{vaswani2017attention}.",
  "\\begin{figure}[h]",
  "\\centering\\includegraphics[width=3cm]{figures/red.png}",
  "\\caption{A red square.}",
  "\\end{figure}",
  "\\end{document}",
].join("\n");
const bib =
  "@inproceedings{vaswani2017attention, title={Attention Is All You Need}, author={Vaswani, A.}, booktitle={NeurIPS}, year={2017}}\n";

const zip = zipSync({
  "sparse-review/main.tex": strToU8(tex),
  "sparse-review/references.bib": strToU8(bib),
  "sparse-review/figures/red.png": new Uint8Array(png),
  "sparse-review/main.synctex.gz": new Uint8Array(10),
});
writeFileSync(process.argv[2] ?? "test-import.zip", zip);
console.log(`zip written: ${zip.length} bytes`);
