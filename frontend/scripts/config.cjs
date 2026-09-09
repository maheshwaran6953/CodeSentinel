const fs = require('node:fs');
const apiUrl = (process.env.API_URL || '/api').replace(/\/$/,'');
if (apiUrl !== '/api' && !/^https?:\/\//.test(apiUrl)) throw new Error('API_URL must be an HTTP(S) URL');
fs.writeFileSync('src/config.js', `window.__CODESENTINEL_CONFIG__ = ${JSON.stringify({apiUrl})};\n`);
