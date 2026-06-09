const http = require('http');
const data = JSON.stringify({username:'ceo', password:'ceo123'});
const req = http.request({
  hostname: '127.0.0.1',
  port: 3333,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  res.on('data', d => process.stdout.write(d));
});
req.write(data);
req.end();
