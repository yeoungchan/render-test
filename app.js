const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

// JSON 요청 받기
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 기존 HTML/CSS/이미지 파일 사용
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

// 기존 쇼핑몰 메인
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// DB 테스트용
app.get("/shops", (req, res) => {
  db.query("SHOW TABLES", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// 로그인 API
app.post("/login", (req, res) => {
  const { user_id, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE user_id = ?",
    [user_id],
    async (err, results) => {
      if (err) {
        return res.status(500).json({
          message: "DB 오류"
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          message: "아이디 없음"
        });
      }

      const user = results[0];

      const ok = await bcrypt.compare(password, user.password_hash);

      if (!ok) {
        return res.status(401).json({
          message: "비밀번호 틀림"
        });
      }

      res.json({
        message: "로그인 성공"
      });
    }
  );
});

// 서버 실행 - 항상 제일 마지막
app.listen(PORT, () => {
  console.log(`서버 실행중: ${PORT}`);
});
