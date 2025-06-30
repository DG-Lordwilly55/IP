import http from 'http';

let totalRequests = 0;
const commandsCount = {};

export function incrementRequest() {
  totalRequests++;
}

export function incrementCommand(cmd) {
  commandsCount[cmd] = (commandsCount[cmd] || 0) + 1;
}

function getMetricsText() {
  const lines = [];
  lines.push('📊 Metrics Report');
  lines.push('=================');
  lines.push(`Total requests processed: ${totalRequests}`);
  lines.push('');
  lines.push('Commands usage breakdown:');
  for (const [cmd, count] of Object.entries(commandsCount)) {
    lines.push(`- ${cmd}: ${count}`);
  }
  lines.push('');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  return lines.join('\n');
}

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    const text = getMetricsText();
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const PORT = 3001;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Metrics server port ${PORT} already in use, skipping metrics server start`);
  } else {
    throw err;
  }
});
server.listen(PORT, () => {
  console.log(`📊 Metrics server listening on http://localhost:${PORT}`);
});
