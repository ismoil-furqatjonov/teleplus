// TelePulse - Local Network HTTP Server (Node.js Built-in Modules)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8000;

// Helper to get local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];

  if (cleanUrl === '/api/server-info' || cleanUrl === '/api/ip') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      ip: localIP,
      port: PORT,
      url: `http://${localIP}:${PORT}/login.html`
    }));
    return;
  }

  let filePath = path.join(__dirname, cleanUrl === '/' ? 'login.html' : cleanUrl);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Fayl Topilmadi');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n===============================================================');
  console.log('🚀 TelePulse Server Ishga Tushdi!');
  console.log('===============================================================');
  console.log(`💻 Ushbu kompyuterda:   http://localhost:${PORT}/login.html`);
  console.log(`📱 Boshqa telefon/laptoplar uchun (Wi-Fi tarmoqda):`);
  console.log(`👉  http://${localIP}:${PORT}/login.html`);
  console.log('===============================================================');
  console.log('💡 Telefoningizni kompyuter bilan bir xil Wi-Fi ga ulang');
  console.log('   va ushbu ssilkani brauzerda oching yoki chat ichidagi');
  console.log('   QR kodni skanerlang!\n');
});
