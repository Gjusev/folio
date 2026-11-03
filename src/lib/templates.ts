// Starting points for new projects. Every template compiles in the bundled
// compiler image (checked by services/latex-compiler/compile.e2e.test.ts).

export type Template = {
  id: string;
  name: string;
  description: string;
  files: { path: string; content: string }[];
};

const REFERENCES = String.raw`@inproceedings{vaswani2017attention,
  title     = {Attention Is All You Need},
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, {\L}ukasz and Polosukhin, Illia},
  booktitle = {Advances in Neural Information Processing Systems},
  volume    = {30},
  year      = {2017},
  doi       = {10.48550/arXiv.1706.03762}
}
`;

const refs = { path: "references.bib", content: REFERENCES };

export const TEMPLATES: Template[] = [
  {
    id: "article",
    name: "Artículo",
    description: "Clase article, una columna. Para preprints y borradores.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[hidelinks]{hyperref}

\title{Untitled Manuscript}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Summarise the problem, the method and the main result in a few sentences.
\end{abstract}

\section{Introduction}
Transformers replaced recurrence with attention~\cite{vaswani2017attention}.
State your research question here.

\section{Method}
The scaled dot-product attention is
\begin{equation}
  \operatorname{Attention}(Q,K,V) = \operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V .
\end{equation}

\section{Results}
Describe your findings.

\bibliographystyle{plain}
\bibliography{references}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "ieee",
    name: "IEEE conferencia",
    description: "IEEEtran a dos columnas, formato de conferencia.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[conference]{IEEEtran}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{cite}

\begin{document}

\title{Paper Title}
\author{\IEEEauthorblockN{Your Name}
\IEEEauthorblockA{Department, University\\City, Country\\email@example.org}}

\maketitle

\begin{abstract}
State the problem, the approach and the main result.
\end{abstract}

\begin{IEEEkeywords}
keyword one, keyword two
\end{IEEEkeywords}

\section{Introduction}
Attention-based models~\cite{vaswani2017attention} are a common baseline.

\section{Method}
Describe the method.

\section{Evaluation}
Describe the experiments.

\section{Conclusion}
Summarise the contribution.

\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "elsevier",
    name: "Elsevier",
    description: "elsarticle en modo preprint, para revistas de Elsevier.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[preprint,12pt]{elsarticle}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}

\journal{Journal Name}

\begin{document}

\begin{frontmatter}
\title{Article Title}
\author{Your Name}
\affiliation{organization={University},city={City},country={Country}}

\begin{abstract}
State the problem, the approach and the main result.
\end{abstract}

\begin{keyword}
keyword one \sep keyword two
\end{keyword}
\end{frontmatter}

\section{Introduction}
Attention-based models~\cite{vaswani2017attention} are a common baseline.

\section{Conclusions}
Summarise the contribution.

\bibliographystyle{elsarticle-num}
\bibliography{references}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "revtex",
    name: "REVTeX (física)",
    description: "revtex4-2 para revistas de la APS y AIP.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[aps,prl,reprint]{revtex4-2}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}

\begin{document}

\title{Article Title}
\author{Your Name}
\affiliation{Department, University, City, Country}

\begin{abstract}
State the problem, the approach and the main result.
\end{abstract}

\maketitle

\section{Introduction}
Attention-based models~\cite{vaswani2017attention} are a common baseline.

\section{Conclusion}
Summarise the contribution.

\bibliography{references}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "amsart",
    name: "Matemáticas (AMS)",
    description: "amsart con entornos de teorema y demostración.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass{amsart}
\usepackage{amssymb}

\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}

\title{Article Title}
\author{Your Name}

\begin{document}

\begin{abstract}
State the main result.
\end{abstract}

\maketitle

\section{Introduction}
Background and the statement of the result.

\begin{theorem}
For every integer $n \geq 1$, $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$.
\end{theorem}

\begin{proof}
By induction on $n$.
\end{proof}

\bibliographystyle{amsplain}
\bibliography{references}
\nocite{vaswani2017attention}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "thesis",
    name: "Tesis",
    description: "Clase report con capítulos en archivos separados.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[margin=2.5cm]{geometry}
\usepackage[hidelinks]{hyperref}

\title{Thesis Title}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle
\tableofcontents

\input{chapters/introduction}
\input{chapters/background}

\bibliographystyle{plain}
\bibliography{references}

\end{document}
`,
      },
      {
        path: "chapters/introduction.tex",
        content: String.raw`\chapter{Introduction}
State the research question and the contributions of the thesis.
`,
      },
      {
        path: "chapters/background.tex",
        content: String.raw`\chapter{Background}
Attention-based models~\cite{vaswani2017attention} are reviewed here.
`,
      },
      refs,
    ],
  },
  {
    id: "beamer",
    name: "Presentación",
    description: "Diapositivas con beamer, relación 16:9.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[aspectratio=169]{beamer}
\usetheme{default}
\setbeamertemplate{navigation symbols}{}

\title{Talk Title}
\author{Your Name}
\date{\today}

\begin{document}

\begin{frame}
\titlepage
\end{frame}

\begin{frame}{Motivation}
\begin{itemize}
  \item The problem
  \item Why it matters
\end{itemize}
\end{frame}

\begin{frame}{Method}
Attention~\cite{vaswani2017attention}:
\[
  \operatorname{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
\]
\end{frame}

\begin{frame}{References}
\bibliographystyle{plain}
\bibliography{references}
\end{frame}

\end{document}
`,
      },
      refs,
    ],
  },
  {
    id: "response-letter",
    name: "Carta de respuesta",
    description: "Respuesta punto por punto a los revisores, con diff por comentario.",
    files: [
      {
        path: "main.tex",
        content: String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=2.5cm]{geometry}
\usepackage{xcolor}
\usepackage{enumitem}
\newcommand{\rev}[1]{\textcolor{blue}{#1}}
\begin{document}
\title{Response to Reviewers}
\author{}
\date{}
\maketitle

We thank the reviewers for their careful reading. Below we respond point by
point; \rev{blue text marks what changed} in the revised manuscript.

\section*{Reviewer 1}

\subsection*{R1.1 (Major): SUMMARY OF THE COMMENT}
\textbf{Response.} What we did about it, referencing the exact section or
figure: see Section~4, Figure~2.
\textbf{Change.} \rev{Rewrote Section~4 and added Figure~2.}

\subsection*{R1.2 (Minor): SUMMARY OF THE COMMENT}
\textbf{Response.} ---
\textbf{Change.} \rev{---}

\section*{Reviewer 2}

\subsection*{R2.1: SUMMARY OF THE COMMENT}
\textbf{Response.} ---
\textbf{Change.} \rev{---}

\end{document}
`,
      },
    ],
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0];

export function findTemplate(id: string | undefined): Template | undefined {
  return id === undefined ? DEFAULT_TEMPLATE : TEMPLATES.find((t) => t.id === id);
}
