/* обфускатор. использует http post запросы к сайту javascript-minifier.com
	 код взят отсюда: https://javascript-minifier.com/nodejs
	 требует установки одного модуля:
	 	 npm install querystring -g
*/
const fs = require('fs');
const querystring = require('/usr/lib/node_modules/querystring');
const https  = require('https');

let file = process.argv[2];
let input = fs.readFileSync(file, 'utf8');

const query = querystring.stringify({
  input : input,
});

const req = https.request({
    method   : 'POST',
    hostname : 'javascript-minifier.com',
    path     : '/raw',
  }, resp => {
    //if the statusCode isn't what we expect, get out of here
    if(resp.statusCode !== 200){
      console.log('StatusCode=' + resp.statusCode);
      return;
    }
    resp.pipe(process.stdout);
  }
);
req.on('error', err => {
  throw err;
});
req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
req.setHeader('Content-Length', query.length);
req.end(query, 'utf8');
