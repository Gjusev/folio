# Folio LaTeX compiler: Node 24 + TeX Live (Debian packages) + latexmk.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      latexmk latexdiff \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-plain-generic \
      texlive-fonts-recommended texlive-science texlive-bibtex-extra \
      texlive-publishers biber \
      chktex texlive-extra-utils \
      bubblewrap \
 && rm -rf /var/lib/apt/lists/*
# chktex: linter (/lint). texcount ships inside texlive-extra-utils (/count).
# synctex ships inside texlive-binaries, already pulled by texlive-latex-base.
# bubblewrap: per-job user+mount namespaces (server.ts probes it at boot and
# falls back to unsandboxed spawns when the host does not allow them).

WORKDIR /app
COPY server.ts ./

# Unprivileged user; the container also runs with a read-only rootfs (see compose).
USER node
ENV PORT=3001 NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.ts"]
