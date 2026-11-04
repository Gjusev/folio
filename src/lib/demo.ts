// The "demo project": a short, finished reading note that compiles out of the
// box, so a new user can try compile, click-to-source, citations, the library
// and snapshots on real content instead of an empty template. Localised
// (es/en/de); every reference is a real, citable paper, and one entry is
// deliberately left uncited so the citation-health panel has something true
// to show.

import type { Lang } from "@/lib/i18n/dictionaries";

type NewFile = { path: string; content: string };

const BIB = String.raw`@inproceedings{vaswani2017attention,
  title     = {Attention Is All You Need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, {\L}ukasz and Polosukhin, Illia},
  booktitle = {Advances in Neural Information Processing Systems},
  volume    = {30},
  year      = {2017},
  doi       = {10.48550/arXiv.1706.03762}
}

@inproceedings{devlin2019bert,
  title     = {{BERT}: Pre-training of Deep Bidirectional Transformers for Language Understanding},
  author    = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},
  booktitle = {Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies, Volume 1 (Long and Short Papers)},
  pages     = {4171--4186},
  year      = {2019},
  doi       = {10.18653/v1/N19-1423}
}

@inproceedings{he2016deep,
  title     = {Deep Residual Learning for Image Recognition},
  author    = {He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
  booktitle = {Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition},
  pages     = {770--778},
  year      = {2016},
  doi       = {10.1109/CVPR.2016.90}
}

@inproceedings{bahdanau2015neural,
  title     = {Neural Machine Translation by Jointly Learning to Align and Translate},
  author    = {Bahdanau, Dzmitry and Cho, Kyunghyun and Bengio, Yoshua},
  booktitle = {International Conference on Learning Representations},
  year      = {2015},
  doi       = {10.48550/arXiv.1409.0473}
}
`;

const FIGURE = String.raw`\begin{tikzpicture}[
    box/.style={draw, rounded corners=2pt, minimum height=7mm, inner sep=3pt, font=\small},
    >={Stealth[length=2mm]}]
  \node[box, minimum width=9mm] (q) at (0, 0.7) {$Q$};
  \node[box, minimum width=9mm] (k) at (0, -0.7) {$K$};
  \node[box] (qk) at (2.6, 0) {$QK^{\top}/\sqrt{d_k}$};
  \node[box] (sm) at (5.3, 0) {softmax};
  \node[box] (mul) at (7.3, 0) {$\cdot\, V$};
  \node[box, minimum width=9mm] (v) at (7.3, -1.4) {$V$};
  \node[box] (out) at (9.4, 0) {output};
  \draw[->] (q.east) -- (qk.north west);
  \draw[->] (k.east) -- (qk.south west);
  \draw[->] (qk) -- (sm);
  \draw[->] (sm) -- (mul);
  \draw[->] (v) -- (mul);
  \draw[->] (mul) -- (out);
\end{tikzpicture}
`;

const PREAMBLE = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{tikz}
\usetikzlibrary{arrows.meta}
\usepackage[margin=2.5cm]{geometry}
\usepackage[hidelinks]{hyperref}
`;

type Copy = {
  name: string;
  tour: string;
  title: string;
  abstract: string;
  intro: string;
  method: string;
  multihead: string;
  figCaption: string;
  tableHead: string;
  tableCaption: string;
  layers: string;
  width: string;
  heads: string;
  params: string;
  results: string;
  discussion: string;
  conclusion: string;
  bibTitle: string;
  sec: [string, string, string, string, string];
};

const COPY: Record<Lang, Copy> = {
  en: {
    name: "Demo: attention in neural networks",
    tour: `% Welcome to Folio! This is a finished paper you can play with.
%  1. Press Compile (or Ctrl+Enter) and click a sentence in the PDF: the editor jumps to its line.
%  2. Open the Papers tab, search for a paper and press Cite: it lands in references.bib and as a \\cite here.
%  3. The Check view flags bahdanau2015neural: it is in the .bib but never cited.
%  4. Save a version from the clock menu before you experiment; you can restore it later.
`,
    title: "Attention in Neural Networks: a Reading Note",
    abstract:
      "This short note collects three landmark papers around attention-based models and compares the configurations they report. It is a demo project: edit anything, compile, and cite more papers from the Papers tab.",
    intro:
      "The Transformer~\\cite{vaswani2017attention} replaced recurrence with attention. BERT~\\cite{devlin2019bert} showed that pre-training a deep bidirectional Transformer transfers to many language tasks. Residual connections~\\cite{he2016deep}, introduced for image recognition, wrap every sub-layer of the Transformer.",
    method: "The core operation is scaled dot-product attention~\\cite{vaswani2017attention}:",
    multihead:
      "Several attention heads run in parallel on learned projections of the input and their outputs are concatenated:",
    figCaption: "Scaled dot-product attention as a data-flow diagram.",
    tableHead: "Model",
    tableCaption: "Hyper-parameters as reported in the original papers.",
    layers: "Layers",
    width: "Width",
    heads: "Heads",
    params: "Parameters",
    results: "Reported configurations",
    discussion:
      "Table~\\ref{tab:configs} lists the configurations reported by the original authors. The BERT models are far larger than the base Transformer~\\cite{devlin2019bert,vaswani2017attention}, which is consistent with their role as general-purpose pre-trained encoders.",
    conclusion:
      "Attention gives every position direct access to every other position, and residual connections keep very deep stacks trainable. Replace this text with your own findings.",
    bibTitle: "References",
    sec: ["Introduction", "Method", "Reported configurations", "Discussion", "Conclusion"],
  },
  es: {
    name: "Demo: atención en redes neuronales",
    tour: `% ¡Bienvenido a Folio! Este es un artículo terminado con el que puedes jugar.
%  1. Pulsa Compilar (o Ctrl+Enter) y haz clic en una frase del PDF: el editor salta a su línea.
%  2. Abre la pestaña Artículos, busca un paper y pulsa Citar: aparece en references.bib y como \\cite aquí.
%  3. La vista Revisión marca bahdanau2015neural: está en el .bib pero nunca se cita.
%  4. Guarda una versión desde el menú del reloj antes de experimentar; podrás restaurarla.
`,
    title: "Atención en redes neuronales: una nota de lectura",
    abstract:
      "Esta breve nota reúne tres artículos clave sobre modelos basados en atención y compara las configuraciones que reportan. Es un proyecto de demostración: edita lo que quieras, compila y cita más artículos desde la pestaña Artículos.",
    intro:
      "El Transformer~\\cite{vaswani2017attention} sustituyó la recurrencia por atención. BERT~\\cite{devlin2019bert} mostró que preentrenar un Transformer bidireccional profundo se transfiere a muchas tareas de lenguaje. Las conexiones residuales~\\cite{he2016deep}, introducidas para reconocimiento de imágenes, envuelven cada subcapa del Transformer.",
    method:
      "La operación central es la atención de producto escalar escalado~\\cite{vaswani2017attention}:",
    multihead:
      "Varias cabezas de atención se ejecutan en paralelo sobre proyecciones aprendidas de la entrada y sus salidas se concatenan:",
    figCaption: "Atención de producto escalar escalado como diagrama de flujo de datos.",
    tableHead: "Modelo",
    tableCaption: "Hiperparámetros según los artículos originales.",
    layers: "Capas",
    width: "Ancho",
    heads: "Cabezas",
    params: "Parámetros",
    results: "Configuraciones reportadas",
    discussion:
      "La tabla~\\ref{tab:configs} recoge las configuraciones que reportan los autores originales. Los modelos BERT son mucho mayores que el Transformer base~\\cite{devlin2019bert,vaswani2017attention}, algo coherente con su papel de codificadores preentrenados de propósito general.",
    conclusion:
      "La atención da a cada posición acceso directo a todas las demás, y las conexiones residuales mantienen entrenables pilas muy profundas. Sustituye este texto por tus propios hallazgos.",
    bibTitle: "Referencias",
    sec: ["Introducción", "Método", "Configuraciones reportadas", "Discusión", "Conclusión"],
  },
  de: {
    name: "Demo: Attention in neuronalen Netzen",
    tour: `% Willkommen bei Folio! Das hier ist eine fertige Arbeit zum Ausprobieren.
%  1. Klicke auf Kompilieren (oder Strg+Enter) und dann auf einen Satz im PDF: Der Editor springt zur Zeile.
%  2. Öffne den Tab Artikel, suche eine Arbeit und klicke auf Zitieren: Sie landet in references.bib und hier als \\cite.
%  3. Die Ansicht Prüfung markiert bahdanau2015neural: im .bib, aber nie zitiert.
%  4. Speichere über das Uhr-Menü eine Version, bevor du experimentierst; du kannst sie wiederherstellen.
`,
    title: "Attention in neuronalen Netzen: eine Lesenotiz",
    abstract:
      "Diese kurze Notiz stellt drei wegweisende Arbeiten zu Attention-Modellen zusammen und vergleicht die berichteten Konfigurationen. Es ist ein Demo-Projekt: Ändere alles, kompiliere und zitiere weitere Arbeiten über den Tab Artikel.",
    intro:
      "Der Transformer~\\cite{vaswani2017attention} ersetzte Rekurrenz durch Attention. BERT~\\cite{devlin2019bert} zeigte, dass das Vortrainieren eines tiefen bidirektionalen Transformers auf viele Sprachaufgaben übertragbar ist. Residualverbindungen~\\cite{he2016deep}, ursprünglich für die Bilderkennung entwickelt, umschließen jede Teilschicht des Transformers.",
    method:
      "Die Kernoperation ist die skalierte Skalarprodukt-Attention~\\cite{vaswani2017attention}:",
    multihead:
      "Mehrere Attention-Köpfe laufen parallel auf gelernten Projektionen der Eingabe, ihre Ausgaben werden verkettet:",
    figCaption: "Skalierte Skalarprodukt-Attention als Datenflussdiagramm.",
    tableHead: "Modell",
    tableCaption: "Hyperparameter laut den Originalarbeiten.",
    layers: "Schichten",
    width: "Breite",
    heads: "Köpfe",
    params: "Parameter",
    results: "Berichtete Konfigurationen",
    discussion:
      "Tabelle~\\ref{tab:configs} listet die von den Originalautoren berichteten Konfigurationen. Die BERT-Modelle sind deutlich größer als der Basis-Transformer~\\cite{devlin2019bert,vaswani2017attention}, passend zu ihrer Rolle als vortrainierte Allzweck-Encoder.",
    conclusion:
      "Attention gibt jeder Position direkten Zugriff auf alle anderen, und Residualverbindungen halten sehr tiefe Stapel trainierbar. Ersetze diesen Text durch deine eigenen Ergebnisse.",
    bibTitle: "Literatur",
    sec: ["Einleitung", "Methode", "Berichtete Konfigurationen", "Diskussion", "Fazit"],
  },
};

function mainTex(c: Copy): string {
  return `${c.tour}${PREAMBLE}
\\title{${c.title}}
\\author{Folio}
\\date{}

\\begin{document}
\\maketitle

\\begin{abstract}
${c.abstract}
\\end{abstract}

\\section{${c.sec[0]}}
${c.intro}

\\section{${c.sec[1]}}
${c.method}
\\begin{equation}
  \\operatorname{Attention}(Q,K,V) = \\operatorname{softmax}\\!\\left(\\frac{QK^{\\top}}{\\sqrt{d_k}}\\right)V .
  \\label{eq:attention}
\\end{equation}
${c.multihead}
\\begin{equation}
  \\operatorname{MultiHead}(Q,K,V) = \\operatorname{Concat}(\\mathrm{head}_1,\\dots,\\mathrm{head}_h)\\,W^{O}.
\\end{equation}
Equation~\\ref{eq:attention} and Figure~\\ref{fig:attention} describe a single head.

\\begin{figure}[ht]
  \\centering
  \\input{figures/attention}
  \\caption{${c.figCaption}}
  \\label{fig:attention}
\\end{figure}

\\section{${c.sec[2]}}
\\begin{table}[ht]
  \\centering
  \\begin{tabular}{lrrrr}
    \\toprule
    ${c.tableHead} & ${c.layers} & ${c.width} & ${c.heads} & ${c.params} \\\\
    \\midrule
    Transformer (base)~\\cite{vaswani2017attention} & 6 & 512 & 8 & 65M \\\\
    Transformer (big)~\\cite{vaswani2017attention} & 6 & 1024 & 16 & 213M \\\\
    BERT\\textsubscript{BASE}~\\cite{devlin2019bert} & 12 & 768 & 12 & 110M \\\\
    BERT\\textsubscript{LARGE}~\\cite{devlin2019bert} & 24 & 1024 & 16 & 340M \\\\
    \\bottomrule
  \\end{tabular}
  \\caption{${c.tableCaption}}
  \\label{tab:configs}
\\end{table}

\\section{${c.sec[3]}}
${c.discussion}

\\section{${c.sec[4]}}
${c.conclusion}

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;
}

/** The demo project's name and files for a language. */
export function demoProject(lang: Lang): { name: string; files: NewFile[] } {
  const c = COPY[lang];
  return {
    name: c.name,
    files: [
      { path: "main.tex", content: mainTex(c) },
      { path: "references.bib", content: BIB },
      { path: "figures/attention.tex", content: FIGURE },
    ],
  };
}
