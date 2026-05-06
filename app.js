const express = require("express");
const path = require("path");
const mysql = require("mysql2");

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 연결: index.html, 이미지, css 등 기존 사이트 유지
app.use(express.static(__dirname));

// MySQL 연결
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
  if (err) {
    console.error("MySQL 연결 실패:", err.message);
    return;
  }
  console.log("MySQL 연결 성공!");
});

// 기존 쇼핑몰 바로가기 페이지
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// DB 테스트용 주소
app.get("/shops", (req, res) => {
  db.query("SHOW TABLES", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.listen(PORT, () => {
  console.log(`서버 실행중: ${PORT}`);
});
