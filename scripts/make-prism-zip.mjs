// Creates test/fixtures/prism-export.zip: a realistic OpenAI Prism export
// (main.tex + references.bib + figure + product metadata) to test the
// migration route from Prism, which shuts down on 2027-01-01.
// Deterministic: fflate's zipSync writes fixed (zero) timestamps.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { strToU8, zipSync } from "fflate";

function crc32(bytes) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// Minimal 1x1 RGBA PNG assembled by hand (signature + IHDR + IDAT + IEND).
const ihdr = new Uint8Array(13);
new DataView(ihdr.buffer).setUint32(0, 1); // width
new DataView(ihdr.buffer).setUint32(4, 1); // height
ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no compression/filter/interlace
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(chunk("IHDR", ihdr)),
  Buffer.from(chunk("IDAT", deflateSync(new Uint8Array([0, 255, 136, 87, 255])))),
  Buffer.from(chunk("IEND", new Uint8Array(0))),
]);

const tex = [
  "\\documentclass[conference]{IEEEtran}",
  "\\usepackage{graphicx}",
  "",
  "\\begin{document}",
  "",
  "\\title{Attention Patterns Across Long Documents: A Short Survey}",
  "",
  "\\author{\\IEEEauthorblockN{A. Researcher}",
  "\\IEEEauthorblockA{Institute of Migration Studies, Example City\\",
  "a.researcher@example.org}}",
  "",
  "\\maketitle",
  "",
  "\\begin{abstract}",
  "Transformer architectures reshaped how we process scientific text. This note",
  "reviews the shift from full self-attention~\\cite{vaswani2017attention}",
  "through residual depth~\\cite{he2016deep} to sparse long-document",
  "attention~\\cite{beltagy2020longformer}, and outlines what each assumes about",
  "input length. Figure~\\ref{fig:pattern} summarizes the trend.",
  "\\end{abstract}",
  "",
  "\\begin{IEEEkeywords}",
  "attention, transformers, long documents",
  "\\end{IEEEkeywords}",
  "",
  "\\section{Introduction}",
  "Full self-attention scales quadratically with sequence",
  "length~\\cite{vaswani2017attention}, which priced long papers out of the",
  "original architecture. Residual connections made depth",
  "affordable~\\cite{he2016deep}, but length remained the binding constraint.",
  "",
  "\\section{Long-document attention}",
  "Sparse attention patterns such as the sliding-window scheme of",
  "Longformer~\\cite{beltagy2020longformer} recover linear cost while keeping",
  "global receptive fields on a few token positions.",
  "",
  "\\begin{figure}[t]",
  "\\centering",
  "\\includegraphics[width=\\linewidth]{figures/plot.png}",
  "\\caption{Attention cost as document length grows (log scale).}",
  "\\label{fig:pattern}",
  "\\end{figure}",
  "",
  "\\section{Conclusion}",
  "No single pattern dominates: the right attention depends on document length",
  "and hardware budget.",
  "",
  "\\bibliographystyle{IEEEtran}",
  "\\bibliography{references}",
  "",
  "\\end{document}",
].join("\n");

const bib = `@inproceedings{vaswani2017attention,
  title     = {Attention Is All You Need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Lukasz and Polosukhin, Illia},
  booktitle = {Advances in Neural Information Processing Systems},
  volume    = {30},
  pages     = {5998--6013},
  year      = {2017},
  doi       = {10.5555/3295222.3295349}
}

@inproceedings{he2016deep,
  title     = {Deep Residual Learning for Image Recognition},
  author    = {He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
  booktitle = {Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)},
  pages     = {770--778},
  year      = {2016},
  doi       = {10.1109/CVPR.2016.90}
}

@article{beltagy2020longformer,
  title   = {Longformer: The Long-Document Transformer},
  author  = {Beltagy, Iz and Peters, Matthew E. and Cohan, Arman},
  journal = {arXiv preprint arXiv:1904.09396},
  year    = {2020}
}
`;

// Plausible Prism product artifact: must be tolerated/discarded by the importer.
const meta = '{"exportedAt": "2026-11-03T10:00:00Z"}\n';

const zip = zipSync({
  "main.tex": strToU8(tex),
  "references.bib": strToU8(bib),
  "figures/plot.png": new Uint8Array(png),
  ".prism/meta.json": strToU8(meta),
});

const out = new URL("../test/fixtures/prism-export.zip", import.meta.url);
mkdirSync(new URL(".", out), { recursive: true });
writeFileSync(out, zip);
console.log(`prism-export.zip written: ${zip.length} bytes (png ${png.length} bytes)`);
