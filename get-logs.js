#!/usr/bin/env node
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9243/devtools/page/0308AAD721D1A0FB38E9E39CE7FE3BDE');

ws.on('open', function open() {
  console.log('Connected to CDP');
  
  // Enable log domain
  ws.send(JSON.stringify({ id: 1, method: 'Log.enable' }));
  
  // Also try to get existing console messages
  ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
});

ws.on('message', function incoming(data) {
  const msg = JSON.parse(data);
  
  // If it's a console log event, print it
  if (msg.method === 'Log.entryAdded') {
    console.log('=== CONSOLE LOG:', JSON.stringify(msg.params.entry, null, 2));
  } else {
    console.log('CDP Message:', JSON.stringify(msg, null, 2));
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('Timeout - closing');
  ws.close();
  process.exit(0);
}, 10000);
