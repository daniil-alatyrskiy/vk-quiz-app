import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/quiz_platform',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL подключена успешно'))
  .catch(err => console.error('❌ Ошибка подключения к PostgreSQL:', err.message));

let activeSessions = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Некорректный email' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
      [email, passwordHash, name, role]
    );

    const user = result.rows[0];
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// Логин
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const result = await pool.query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

// Создать квиз
app.post('/api/quizzes', async (req, res) => {
  try {
    const { organizerId, title, description, category, timePerQuestion } = req.body;

    const roomCode = generateRoomCode();
    const result = await pool.query(
      `INSERT INTO quizzes (organizer_id, title, description, category, time_per_question, room_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *`,
      [organizerId, title || 'Новый квиз', description || '', category || 'Общие знания', timePerQuestion || 30, roomCode]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания квиза' });
  }
});

// Получить квизы пользователя
app.get('/api/quizzes/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const result = await pool.query(
      'SELECT * FROM quizzes WHERE organizer_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки квизов' });
  }
});

// Получить один квиз с вопросами
app.get('/api/quizzes/detail/:quizId', async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId);

    const quizRes = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
    if (quizRes.rows.length === 0) return res.status(404).json({ error: 'Квиз не найден' });

    const questionsRes = await pool.query(
      `SELECT q.*,
        json_agg(
          json_build_object('id', a.id, 'text', a.text, 'isCorrect', a.is_correct)
          ORDER BY a.id
        ) FILTER (WHERE a.id IS NOT NULL) as answers
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE q.quiz_id = $1
       GROUP BY q.id
       ORDER BY q."order", q.id`,
      [quizId]
    );

    const quiz = quizRes.rows[0];
    quiz.questions = questionsRes.rows.map(q => ({
      ...q,
      answers: q.answers || []
    }));

    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки квиза' });
  }
});

// Добавить вопрос
app.post('/api/quizzes/:quizId/questions', async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId);
    const { text, type, answers, imageUrl } = req.body;

    if (!text || !type || !answers || answers.length < 2) {
      return res.status(400).json({ error: 'Нужно минимум 2 варианта ответа' });
    }

    const quizCheck = await pool.query('SELECT id FROM quizzes WHERE id = $1', [quizId]);
    if (quizCheck.rows.length === 0) return res.status(404).json({ error: 'Квиз не найден' });

    const qRes = await pool.query(
      `INSERT INTO questions (quiz_id, text, type, image_url, "order")
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX("order"), 0) + 1 FROM questions WHERE quiz_id = $1))
       RETURNING id`,
      [quizId, text, type, imageUrl || null]
    );

    const questionId = qRes.rows[0].id;

    for (const ans of answers) {
      if (ans.text && ans.text.trim()) {
        await pool.query(
          'INSERT INTO answers (question_id, text, is_correct) VALUES ($1, $2, $3)',
          [questionId, ans.text.trim(), !!ans.isCorrect]
        );
      }
    }

    res.json({ success: true, questionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления вопроса' });
  }
});

// Удалить вопрос
app.delete('/api/questions/:questionId', async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    await pool.query('DELETE FROM questions WHERE id = $1', [questionId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// Запуск квиза
app.post('/api/quizzes/:quizId/start', async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId);

    const quizRes = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
    if (quizRes.rows.length === 0) return res.status(404).json({ error: 'Квиз не найден' });

    const quiz = quizRes.rows[0];
    const roomCode = quiz.room_code;

    if (activeSessions.has(roomCode)) {
      const existing = activeSessions.get(roomCode);
      if (existing.status !== 'finished') {
        return res.json({ roomCode, alreadyActive: true });
      }
    }

    const session = {
      roomCode,
      quizId,
      status: 'waiting',
      currentQuestionIndex: -1,
      participants: [],
      answers: [],
      startedAt: new Date()
    };

    activeSessions.set(roomCode, session);

    await pool.query('UPDATE quizzes SET status = $1 WHERE id = $2', ['active', quizId]);

    res.json({ roomCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка запуска квиза' });
  }
});

// === Socket.IO ===
io.on('connection', (socket) => {
  console.log('🔌 Новое подключение:', socket.id);

  socket.on('join-room', async ({ roomCode, userId, userName, isOrganizer }) => {
    socket.join(roomCode);

    let session = activeSessions.get(roomCode);

    if (!session) {
      const quizRes = await pool.query('SELECT * FROM quizzes WHERE room_code = $1', [roomCode]);
      if (quizRes.rows.length > 0) {
        session = {
          roomCode,
          quizId: quizRes.rows[0].id,
          status: quizRes.rows[0].status,
          currentQuestionIndex: -1,
          participants: [],
          answers: []
        };
        activeSessions.set(roomCode, session);
      } else {
        socket.emit('error', { message: 'Квиз не найден' });
        return;
      }
    }

    const existingParticipant = session.participants.find(p => p.userId === userId);
    if (!existingParticipant) {
      session.participants.push({
        userId,
        name: userName || 'Аноним',
        score: 0
      });
    }

    io.to(roomCode).emit('participants-updated', session.participants);

    if (session.currentQuestionIndex >= 0 && session.status === 'active') {
      const quizRes = await pool.query(
        `SELECT q.*, json_agg(json_build_object('id', a.id, 'text', a.text, 'isCorrect', a.is_correct)) as answers
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE q.quiz_id = $1
         GROUP BY q.id
         ORDER BY q."order"
         LIMIT 1 OFFSET $2`,
        [session.quizId, session.currentQuestionIndex]
      );

      if (quizRes.rows.length > 0) {
        const q = quizRes.rows[0];
        socket.emit('new-question', {
          question: {
            id: q.id,
            text: q.text,
            type: q.type,
            imageUrl: q.image_url,
            answers: q.answers || []
          },
          index: session.currentQuestionIndex,
          total: await getTotalQuestions(session.quizId)
        });
      }
    }

    if (session.status === 'finished') {
      socket.emit('quiz-finished', {
        leaderboard: [...session.participants].sort((a, b) => b.score - a.score)
      });
    }
  });

  socket.on('next-question', async ({ roomCode }) => {
    const session = activeSessions.get(roomCode);
    if (!session) return;

    const quizRes = await pool.query('SELECT * FROM quizzes WHERE id = $1', [session.quizId]);
    if (!quizRes.rows.length) return;

    const totalQuestions = await getTotalQuestions(session.quizId);
    session.currentQuestionIndex++;

    if (session.currentQuestionIndex < totalQuestions) {
      session.status = 'active';

      const qRes = await pool.query(
        `SELECT q.*, json_agg(json_build_object('id', a.id, 'text', a.text, 'isCorrect', a.is_correct)) as answers
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE q.quiz_id = $1
         GROUP BY q.id
         ORDER BY q."order"
         LIMIT 1 OFFSET $2`,
        [session.quizId, session.currentQuestionIndex]
      );

      const q = qRes.rows[0];
      io.to(roomCode).emit('new-question', {
        question: {
          id: q.id,
          text: q.text,
          type: q.type,
          imageUrl: q.image_url,
          answers: q.answers || []
        },
        index: session.currentQuestionIndex,
        total: totalQuestions
      });
    } else {
      session.status = 'finished';
      const sorted = [...session.participants].sort((a, b) => b.score - a.score);
      io.to(roomCode).emit('quiz-finished', { leaderboard: sorted });

      await pool.query('UPDATE quizzes SET status = $1 WHERE id = $2', ['finished', session.quizId]);
    }
  });

  socket.on('submit-answer', async ({ roomCode, userId, questionId, answerIds }) => {
    const session = activeSessions.get(roomCode);
    if (!session || session.status !== 'active') return;

    const participant = session.participants.find(p => p.userId === userId);
    if (!participant || participant.hasAnsweredCurrent) return;

    const correctRes = await pool.query(
      'SELECT id FROM answers WHERE question_id = $1 AND is_correct = true',
      [questionId]
    );
    const correctIds = correctRes.rows.map(r => r.id).sort();
    const submitted = [...answerIds].sort();

    const isCorrect = JSON.stringify(submitted) === JSON.stringify(correctIds);

    if (isCorrect) {
      participant.score = (participant.score || 0) + 10;
    }

    participant.hasAnsweredCurrent = true;

    io.to(roomCode).emit('answer-received', { userId, isCorrect });
    io.to(roomCode).emit('participants-updated', session.participants);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Отключение:', socket.id);
  });
});

async function getTotalQuestions(quizId) {
  const res = await pool.query('SELECT COUNT(*) FROM questions WHERE quiz_id = $1', [quizId]);
  return parseInt(res.rows[0].count);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
