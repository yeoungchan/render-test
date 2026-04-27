const http = require('http');

http.createServer((req,res)=>{
 res.writeHead(200,{'Content-Type':'text/html'});
 res.end('<h1>내 첫 클라우드 서버</h1>');
}).listen(process.env.PORT || 3000);
