const http = require('http');

http.createServer((req,res)=>{

 if(req.url === '/api'){
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
       msg:"API 성공",
       amount:10000
    }));
 }

 else{
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end('<h1>메인 홈페이지</h1>');
 }

}).listen(process.env.PORT || 3000);
