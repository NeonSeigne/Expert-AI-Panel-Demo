# syntax=docker/dockerfile:1.7
#
# BuildKit cache mounts speed up rebuilds by persisting npm and pip
# package caches across builds (outside the image - they don't bloat
# the final layer). The first `docker compose build` is unchanged;
# subsequent rebuilds skip the network for any unchanged dependency.
#
# The `# syntax=` directive auto-opts into BuildKit on Docker Desktop
# 20.10+; HuggingFace Spaces also supports this directive. Older
# builders silently treat the cache mounts as no-ops, so this file
# remains forward-compatible.

FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend

# Copy lockfile + manifest first so the layer hash only changes when
# deps actually change, not on every source edit.
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY frontend/ ./
ENV REACT_APP_API_URL=
RUN npm run build


FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR $HOME/app

# Lockfile-equivalent first; cache mount targets the unprivileged
# user's pip cache (uid/gid 1000 matches the `user` account).
COPY --chown=user backend/requirements.txt ./
RUN --mount=type=cache,target=/home/user/.cache/pip,uid=1000,gid=1000 \
    pip install --user -r requirements.txt

COPY --chown=user backend/ ./
COPY --chown=user --from=frontend-build /app/frontend/build ./static

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
