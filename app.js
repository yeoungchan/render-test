const http = require('http');

http.createServer((req,res)=>{
 res.writeHead(200,{'Content-Type':'text/html'});
 res.end('<h1>Hello Render!</h1>');
}).listen(process.env.PORT || 3000);
