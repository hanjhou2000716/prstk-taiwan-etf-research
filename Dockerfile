FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN python -m pip install --no-cache-dir . pytest
CMD ["python", "-m", "prstk_research.pipeline", "run", "--download"]
