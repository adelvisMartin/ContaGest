FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    HIPICO_DATA_DIR=/var/lib/control-hipico-bridge

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates wget gnupg xvfb dbus fonts-liberation fonts-noto-color-emoji \
 && install -d -m 0755 /etc/apt/keyrings \
 && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 controlhipico \
 && useradd --system --uid 10001 --gid 10001 --home-dir /var/lib/control-hipico-bridge --create-home --shell /usr/sbin/nologin controlhipico \
 && install -d -o controlhipico -g controlhipico -m 0700 /var/lib/control-hipico-bridge

WORKDIR /opt/control-hipico-bridge
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --chown=controlhipico:controlhipico src ./src
COPY --chown=controlhipico:controlhipico VERSION ./VERSION

USER 10001:10001

HEALTHCHECK --interval=60s --timeout=10s --start-period=90s --retries=3 \
  CMD node src/healthcheck.mjs || exit 1

ENTRYPOINT ["/usr/bin/xvfb-run", "-a", "-s", "-screen 0 1366x768x24 -nolisten tcp", "/usr/local/bin/node", "src/server-runner.mjs"]
