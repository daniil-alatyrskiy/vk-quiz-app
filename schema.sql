\c quiz_platform;

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('organizer', 'participant')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Квизы
CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'Общие знания',
    time_per_question INTEGER DEFAULT 30,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Вопросы
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('single', 'multiple')),
    image_url TEXT,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Варианты ответов
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE
);

-- История сессий (опционально, для MVP можно пропустить, но полезно)
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
    room_code VARCHAR(10),
    status VARCHAR(20),
    started_at TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS participant_scores (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(100),
    score INTEGER DEFAULT 0
);

-- Индексы для скорости
CREATE INDEX IF NOT EXISTS idx_quizzes_organizer ON quizzes(organizer_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);