import http from 'node:http';

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = Number(process.env.WEBHOOK_PROXY_PORT || 3002);
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = Number(process.env.APP_PORT || 3000);
const ALLOWED_PATH = '/api/webhook/evolution';

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

  // Bloqueia estritamente qualquer rota que não seja /api/webhook/evolution
  // para garantir que o painel administrativo nunca fique exposto por este túnel.
  if (pathname !== ALLOWED_PATH) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: false,
        error:
          'Acesso negado: este endpoint HTTPS é exclusivo para o webhook /api/webhook/evolution. O painel administrativo utiliza autenticação separada.',
      })
    );
    return;
  }

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: rawUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${TARGET_HOST}:${TARGET_PORT}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: false,
        error: `Falha ao encaminhar webhook para aplicação local: ${err.message}`,
      })
    );
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[WebhookProxy] Ativo em http://${LISTEN_HOST}:${LISTEN_PORT}${ALLOWED_PATH} -> http://${TARGET_HOST}:${TARGET_PORT}${ALLOWED_PATH}`
  );
});

