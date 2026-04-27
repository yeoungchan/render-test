const http = require('http');

http.createServer((req,res)=>{

// 메인
if(req.url === '/'){
res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
res.end('<h1>PG 테스트 서버</h1>');
}

// 승인 요청 mock
else if(req.url === '/approve'){
res.writeHead(200,{'Content-Type':'application/json'});
res.end(JSON.stringify({
 resultCode:"0000",
 resultMsg:"승인성공",
 tid:"KSNET123456",
 authNo:"A12345",
 amount:"50000",
 cardCompany:"신한",
 approveDate:"2026-04-27 15:20:00"
}));
}

// 취소 요청 mock
else if(req.url === '/cancel'){
res.writeHead(200,{'Content-Type':'application/json'});
res.end(JSON.stringify({
 resultCode:"0000",
 resultMsg:"취소성공",
 cancelNo:"C98765",
 amount:"50000"
}));
}

// 잔액조회 mock
else if(req.url === '/balance'){
res.writeHead(200,{'Content-Type':'application/json'});
res.end(JSON.stringify({
 merchantId:"M10001",
 balance:"12850000"
}));
}

// 없는 URL
else{
res.writeHead(404);
res.end("Not Found");
}

}).listen(process.env.PORT || 3000);
