const http = require('http');

http.createServer((req,res)=>{
  res.writeHead(200,{
    'Content-Type':'text/html; charset=utf-8'
  });
  res.end('<h1>안녕하세요</h1>');
}).listen(process.env.PORT || 3000);
