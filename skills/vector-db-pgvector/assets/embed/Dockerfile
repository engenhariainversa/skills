# Serviço de embeddings de texto: fastembed (ONNX) em CPU, sem torch, sem GPU.
# API HTTP mínima (server.py). Os pesos do modelo são baixados no primeiro start para o volume
# montado em /models (cache do Hugging Face), então a imagem fica pequena.
FROM python:3.12-slim
WORKDIR /srv
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir fastembed==0.8.1
COPY api.py server.py ./
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"
CMD ["python", "server.py"]
