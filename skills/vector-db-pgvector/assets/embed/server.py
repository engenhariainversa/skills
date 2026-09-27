"""
Embeddings de texto por HTTP, fastembed (ONNX) em CPU.

  GET  /health   200 {"model", "dim"} quando o modelo carregou (503 enquanto baixa/carrega)
  POST /embed    Authorization: Bearer $EMBED_SECRET, {"texts": [...]} -> {"model", "dim", "vectors"}

Os textos nunca vão para disco nem para o log: o log tem só contagens e tempos.
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from api import BadRequest, authorized, load_retry_delay, parse_request

# Multilíngue (pt-BR/en), 384 dimensões, ~500 MB. Trocar de modelo muda a dimensão: a coluna
# vector(N) e o `embed_model` gravado em cada linha precisam acompanhar.
MODEL = os.environ.get("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
SECRET = os.environ.get("EMBED_SECRET", "")
PORT = int(os.environ.get("PORT", "8000"))
THREADS = int(os.environ.get("EMBED_THREADS", "0")) or None
MAX_BYTES = 256 * 1024

model = None
dim = 0
lock = threading.Lock()


def load() -> None:
    """Carrega o modelo e tenta de novo até conseguir: o primeiro start baixa os pesos, e um download
    que falha (o Hugging Face responde 429 a rajadas anônimas) não pode deixar o serviço de pé sem
    modelo para sempre. /health e /embed respondem 503 até uma tentativa passar."""
    global model, dim
    from fastembed import TextEmbedding
    attempt = 0
    while True:
        started = time.time()
        try:
            m = TextEmbedding(MODEL, cache_dir="/models", threads=THREADS)
            d = len(next(iter(m.embed(["warm up"]))))
        except Exception as err:  # download ou load do ONNX; repete o conjunto
            delay = load_retry_delay(attempt)
            print(f"model {MODEL} not loaded ({type(err).__name__}), retrying in {delay}s", file=sys.stderr, flush=True)
            attempt += 1
            time.sleep(delay)
            continue
        dim, model = d, m
        print(f"model {MODEL} loaded (dim {dim}) in {time.time() - started:.1f}s", flush=True)
        return


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            return self._send(404, {"error": "not found"})
        if model is None:
            return self._send(503, {"error": "loading"})
        self._send(200, {"model": MODEL, "dim": dim})

    def do_POST(self) -> None:
        if self.path != "/embed":
            return self._send(404, {"error": "not found"})
        if not authorized(self.headers.get("Authorization"), SECRET):
            return self._send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._send(400, {"error": "bad length"})
        try:
            texts = parse_request(self.rfile.read(length))
        except BadRequest as err:
            return self._send(400, {"error": str(err)})
        if model is None:
            return self._send(503, {"error": "loading"})
        started = time.time()
        with lock:
            vectors = [v.tolist() for v in model.embed(texts)]
        print(f"embedded {len(texts)} texts in {(time.time() - started) * 1000:.0f}ms", flush=True)
        self._send(200, {"model": MODEL, "dim": dim, "vectors": vectors})

    def log_message(self, *_args) -> None:  # access log padrão é ruído; erros saem acima
        pass


if __name__ == "__main__":
    if not SECRET:
        print("EMBED_SECRET is empty: every /embed request will be refused", file=sys.stderr, flush=True)
    threading.Thread(target=load, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
