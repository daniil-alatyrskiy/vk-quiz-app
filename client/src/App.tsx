import { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

interface Question {
  id: number;
  text: string;
  type: 'single' | 'multiple';
  imageUrl?: string;
  answers: { id: number; text: string; isCorrect: boolean }[];
}

interface Participant {
  userId: number;
  name: string;
  score: number;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [screen, setScreen] = useState<'login' | 'dashboard' | 'create' | 'edit-quiz' | 'quiz' | 'profile'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'organizer' | 'participant'>('organizer');
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<any>(null);
  const [currentQuizQuestions, setCurrentQuizQuestions] = useState<any[]>([]);
  const [currentQuizId, setCurrentQuizId] = useState<number | null>(null);

  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<'single' | 'multiple'>('single');
  const [newQuestionImageUrl, setNewQuestionImageUrl] = useState('');
  const [newAnswers, setNewAnswers] = useState([{ text: '', isCorrect: false }]);
  const [selectedCategory, setSelectedCategory] = useState('Общие знания');
  const [timePerQuestion, setTimePerQuestion] = useState(30);

  const [roomCode, setRoomCode] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<number[]>([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [notification, setNotification] = useState<{type: string, message: string} | null>(null);

  const categories = ['Общие знания', 'IT и технологии', 'Фильмы и сериалы', 'Спорт', 'История', 'Наука', 'Мемы и развлечения'];

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const validateAuth = (isReg: boolean): boolean => {
    setAuthError('');
    if (!email.trim() || !password.trim() || (isReg && !name.trim())) {
      setAuthError('Заполните все обязательные поля');
      return false;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setAuthError('Введите корректный email');
      return false;
    }
    if (password.length < 6) {
      setAuthError('Пароль должен содержать минимум 6 символов');
      return false;
    }
    return true;
  };

  const handleAuth = async () => {
    if (!validateAuth(isRegister)) return;

    const url = isRegister ? '/api/register' : '/api/login';
    const body: any = { email: email.trim(), password: password.trim() };
    if (isRegister) {
      body.name = name.trim();
      body.role = role;
    }

    try {
      const res = await fetch(`http://localhost:3001${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('quizUser', JSON.stringify(data.user));
        setScreen('dashboard');
        loadQuizzes(data.user.id);
        setEmail(''); setPassword(''); setName(''); setAuthError('');
      } else {
        setAuthError(data.error || 'Ошибка входа');
      }
    } catch (err) {
      setAuthError('Ошибка соединения с сервером');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('quizUser');
    setUser(null);
    setScreen('login');
    setQuizzes([]);
    setCurrentQuestion(null);
    setParticipants([]);
    setLeaderboard([]);
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('quizUser');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setScreen('dashboard');
      loadQuizzes(parsed.id);
    }
  }, []);

  const loadQuizzes = async (userId: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/quizzes/${userId}`);
      const data = await res.json();
      setQuizzes(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadQuizDetails = async (quizId: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/quizzes/detail/${quizId}`);
      const data = await res.json();
      setCurrentQuiz(data);
      setCurrentQuizQuestions(data.questions || []);
      setCurrentQuizId(quizId);
      setSelectedCategory(data.category || 'Общие знания');
      setTimePerQuestion(data.time_per_question || 30);
    } catch (e) {
      console.error(e);
    }
  };

  const createQuiz = async () => {
    if (!user) return;
    try {
      const res = await fetch('http://localhost:3001/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizerId: user.id,
          title: 'Новый квиз',
          description: '',
          category: selectedCategory,
          timePerQuestion: timePerQuestion
        })
      });
      const newQuiz = await res.json();
      setQuizzes([newQuiz, ...quizzes]);
      setCurrentQuiz(newQuiz);
      setCurrentQuizId(newQuiz.id);
      setCurrentQuizQuestions([]);
      setScreen('edit-quiz');
      showNotification('Квиз создан! Теперь добавь вопросы');
    } catch (e) {
      showNotification('Ошибка создания квиза', 'error');
    }
  };

  const addQuestion = async () => {
    if (!currentQuizId || !newQuestionText.trim()) return;

    const validAnswers = newAnswers.filter(a => a.text.trim() !== '');
    if (validAnswers.length < 2) {
      showNotification('Нужно минимум 2 варианта ответа', 'error');
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/quizzes/${currentQuizId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newQuestionText.trim(),
          type: newQuestionType,
          imageUrl: newQuestionImageUrl.trim() || null,
          answers: validAnswers
        })
      });

      if (res.ok) {
        showNotification('Вопрос успешно добавлен!');
        setNewQuestionText('');
        setNewQuestionImageUrl('');
        setNewAnswers([{ text: '', isCorrect: false }]);
        await loadQuizDetails(currentQuizId);
      } else {
        const err = await res.json();
        showNotification(err.error || 'Ошибка добавления', 'error');
      }
    } catch (e) {
      showNotification('Ошибка соединения', 'error');
    }
  };

  const addAnswerField = () => {
    setNewAnswers([...newAnswers, { text: '', isCorrect: false }]);
  };

  const updateAnswer = (index: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    const updated = [...newAnswers];
    // @ts-ignore
    updated[index][field] = value;
    setNewAnswers(updated);
  };

  const deleteQuestion = async (questionId: number) => {
    if (!confirm('Удалить этот вопрос?')) return;
    try {
      await fetch(`http://localhost:3001/api/questions/${questionId}`, { method: 'DELETE' });
      showNotification('Вопрос удалён');
      if (currentQuizId) await loadQuizDetails(currentQuizId);
    } catch (e) {
      showNotification('Ошибка удаления', 'error');
    }
  };

  const startQuiz = async (quizId: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/quizzes/${quizId}/start`, {
        method: 'POST'
      });
      const data = await res.json();

      setRoomCode(data.roomCode);
      setCurrentQuizId(quizId);
      setIsOrganizer(true);
      setScreen('quiz');
      setCurrentQuestion(null);
      setQuestionIndex(0);
      setLeaderboard([]);
      setParticipants([]);
      setHasAnswered(false);
      setSelectedAnswerIds([]);

      socket.emit('join-room', {
        roomCode: data.roomCode,
        userId: user.id,
        userName: user.name,
        isOrganizer: true
      });

      showNotification('Квиз запущен! Приглашай участников по коду');
    } catch (e) {
      showNotification('Ошибка запуска квиза', 'error');
    }
  };

  const joinByCode = () => {
    if (!roomCode.trim()) {
      showNotification('Введите код комнаты', 'error');
      return;
    }

    setIsOrganizer(false);
    setScreen('quiz');
    setCurrentQuestion(null);
    setQuestionIndex(0);
    setLeaderboard([]);
    setParticipants([]);
    setHasAnswered(false);
    setSelectedAnswerIds([]);

    socket.emit('join-room', {
      roomCode: roomCode.toUpperCase(),
      userId: user.id,
      userName: user.name,
      isOrganizer: false
    });
  };

  useEffect(() => {
    const handleNewQuestion = (data: any) => {
      setCurrentQuestion(data.question);
      setQuestionIndex(data.index + 1);
      setTotalQuestions(data.total);
      setHasAnswered(false);
      setSelectedAnswerIds([]);
      setTimeLeft(currentQuiz?.time_per_question || 30);
    };

    const handleQuizFinished = (data: any) => {
      setLeaderboard(data.leaderboard || []);
      setCurrentQuestion(null);
      setTimeLeft(0);
      showNotification('Квиз завершён! Смотри результаты');
    };

    const handleParticipantsUpdated = (data: Participant[]) => {
      setParticipants(data);
    };

    const handleAnswerReceived = ({ userId, isCorrect }: any) => {
      // placeholder for future toast
    };

    socket.on('new-question', handleNewQuestion);
    socket.on('quiz-finished', handleQuizFinished);
    socket.on('participants-updated', handleParticipantsUpdated);
    socket.on('answer-received', handleAnswerReceived);

    return () => {
      socket.off('new-question', handleNewQuestion);
      socket.off('quiz-finished', handleQuizFinished);
      socket.off('participants-updated', handleParticipantsUpdated);
      socket.off('answer-received', handleAnswerReceived);
    };
  }, [currentQuiz]);

  useEffect(() => {
    if (!currentQuestion || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion, timeLeft]);

  const goToNextQuestion = () => {
    if (!roomCode) return;
    socket.emit('next-question', { roomCode });
  };

  const submitAnswer = () => {
    if (!currentQuestion || selectedAnswerIds.length === 0 || !roomCode) return;

    socket.emit('submit-answer', {
      roomCode,
      userId: user.id,
      questionId: currentQuestion.id,
      answerIds: selectedAnswerIds
    });
    setHasAnswered(true);
    showNotification('Ответ отправлен!');
  };

  const toggleAnswer = (answerId: number) => {
    if (hasAnswered) return;

    if (currentQuestion?.type === 'single') {
      setSelectedAnswerIds([answerId]);
    } else {
      if (selectedAnswerIds.includes(answerId)) {
        setSelectedAnswerIds(selectedAnswerIds.filter(id => id !== answerId));
      } else {
        setSelectedAnswerIds([...selectedAnswerIds, answerId]);
      }
    }
  };

  const handlePasswordReset = () => {
    if (!resetEmail.trim()) {
      alert('Введите email');
      return;
    }
    const fakeToken = 'reset_' + Date.now();
    console.log('%c[DEV] Ссылка для сброса пароля:', 'color: #3b82f6; font-weight: bold',
      `http://localhost:3001/reset-password?token=${fakeToken}&email=${resetEmail}`);
    showNotification('В development-режиме ссылка отправлена. Проверь консоль браузера (F12)');
    setShowResetModal(false);
    setResetEmail('');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-4">
              <span className="text-white text-3xl">Q</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">QuizFlow</h1>
            <p className="text-gray-500 mt-1">Интерактивные квизы в реальном времени</p>
          </div>

          <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => { setIsRegister(false); setAuthError(''); }}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${!isRegister ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
            >
              Войти
            </button>
            <button
              onClick={() => { setIsRegister(true); setAuthError(''); }}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${isRegister ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}
            >
              Регистрация
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">
              {authError}
            </div>
          )}

          <div className="space-y-4">
            {isRegister && (
              <input
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 focus:border-blue-500 px-4 py-3.5 rounded-2xl outline-none transition"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 focus:border-blue-500 px-4 py-3.5 rounded-2xl outline-none transition"
            />
            <input
              type="password"
              placeholder="Пароль (минимум 6 символов)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 focus:border-blue-500 px-4 py-3.5 rounded-2xl outline-none transition"
            />

            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Я хочу быть:</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('organizer')}
                    className={`flex-1 py-3 rounded-2xl border-2 transition ${role === 'organizer' ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600'}`}
                  >
                    Организатор
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('participant')}
                    className={`flex-1 py-3 rounded-2xl border-2 transition ${role === 'participant' ? 'border-purple-600 bg-purple-50 text-purple-700 font-medium' : 'border-gray-200 text-gray-600'}`}
                  >
                    Участник
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleAuth}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg active:scale-[0.985] transition"
            >
              {isRegister ? 'Создать аккаунт' : 'Войти в аккаунт'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setShowResetModal(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Забыли пароль?
            </button>
          </div>
        </div>

        {showResetModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full">
              <h3 className="text-xl font-bold mb-2">Восстановление пароля</h3>
              <p className="text-gray-600 text-sm mb-6">В development-режиме мы просто покажем ссылку в консоли браузера</p>
              <input
                type="email"
                placeholder="Ваш email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                className="w-full border px-4 py-3 rounded-2xl mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-3 border rounded-2xl font-medium"
                >
                  Отмена
                </button>
                <button
                  onClick={handlePasswordReset}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-medium"
                >
                  Отправить ссылку
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-2xl shadow-xl text-white flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {notification.message}
        </div>
      )}

      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">Q</span>
            </div>
            <div>
              <div className="font-bold text-xl tracking-tight">QuizFlow</div>
              <div className="text-[10px] text-gray-500 -mt-1">REAL-TIME QUIZZES</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setScreen('dashboard')} className={`px-5 py-2 rounded-2xl text-sm font-medium transition ${screen === 'dashboard' ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>Главная</button>
            <button onClick={() => setScreen('profile')} className={`px-5 py-2 rounded-2xl text-sm font-medium transition ${screen === 'profile' ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>Кабинет</button>
            {user.role === 'organizer' && (
              <button onClick={() => setScreen('create')} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-semibold flex items-center gap-2">
                + Создать квиз
              </button>
            )}
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right">
                <div className="font-medium text-sm">{user.name}</div>
                <div className="text-xs text-gray-500">{user.role === 'organizer' ? 'Организатор' : 'Участник'}</div>
              </div>
              <button onClick={handleLogout} className="text-xs px-3 py-1.5 text-gray-500 hover:text-red-600">Выйти</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {screen === 'dashboard' && (
          <div>
            <div className="flex items-end justify-between mb-8">
              <div>
                <h1 className="text-4xl font-bold tracking-tighter">Добро пожаловать, {user.name.split(' ')[0]}!</h1>
                <p className="text-gray-600 mt-1">Готов провести или пройти крутой квиз?</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border p-8 mb-8">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold mb-1.5">Присоединиться к квизу</div>
                  <input
                    value={roomCode}
                    onChange={e => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="ВВЕДИТЕ КОД КОМНАТЫ"
                    className="w-full border-2 border-gray-200 focus:border-purple-500 px-6 py-4 rounded-2xl text-2xl font-mono tracking-[4px] placeholder:text-gray-400"
                  />
                </div>
                <button
                  onClick={joinByCode}
                  className="mt-7 px-10 py-4 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-2xl font-semibold text-lg transition"
                >
                  Присоединиться
                </button>
              </div>
            </div>

            {user.role === 'organizer' && (
              <div>
                <div className="flex items-center justify-between mb-4 px-1">
                  <h2 className="font-semibold text-2xl">Мои квизы</h2>
                  <span className="text-sm text-gray-500">{quizzes.length} квизов</span>
                </div>

                {quizzes.length === 0 ? (
                  <div className="bg-white rounded-3xl border p-12 text-center">
                    <div className="text-6xl mb-4">🎯</div>
                    <p className="text-xl text-gray-600 mb-2">У тебя пока нет квизов</p>
                    <p className="text-gray-500 mb-6">Создай первый и запусти интерактив для друзей или команды</p>
                    <button onClick={() => setScreen('create')} className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-medium">Создать первый квиз</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {quizzes.map(q => (
                      <div key={q.id} className="bg-white rounded-3xl border p-6 flex flex-col">
                        <div className="flex-1">
                          <div className="font-semibold text-xl mb-1 line-clamp-2">{q.title}</div>
                          <div className="text-sm text-gray-500 mb-3">{q.category}</div>
                          <div className="inline-flex items-center gap-2 text-xs bg-gray-100 px-3 py-1 rounded-full mb-4">
                            <span className="font-mono font-bold tracking-widest">{q.room_code}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-4 border-t">
                          <button
                            onClick={() => {
                              setCurrentQuiz(q);
                              loadQuizDetails(q.id);
                              setScreen('edit-quiz');
                            }}
                            className="flex-1 py-2.5 border hover:bg-gray-50 rounded-2xl text-sm font-medium transition"
                          >
                            Редактировать
                          </button>
                          <button
                            onClick={() => startQuiz(q.id)}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-semibold transition"
                          >
                            Запустить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {screen === 'create' && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-3xl shadow-sm border p-8">
              <h2 className="text-3xl font-bold mb-6 tracking-tight">Новый квиз</h2>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Категория</label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full border px-4 py-3 rounded-2xl"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Время на один вопрос (секунд)</label>
                  <input
                    type="number"
                    value={timePerQuestion}
                    onChange={e => setTimePerQuestion(parseInt(e.target.value) || 30)}
                    className="w-full border px-4 py-3 rounded-2xl"
                    min="10" max="120"
                  />
                </div>
              </div>
              <button onClick={createQuiz} className="mt-8 w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold text-lg active:scale-[0.985] transition">
                Создать квиз и перейти к вопросам →
              </button>
              <button onClick={() => setScreen('dashboard')} className="mt-3 w-full py-3 text-gray-600">Назад</button>
            </div>
          </div>
        )}

        {screen === 'edit-quiz' && currentQuiz && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">{currentQuiz.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className="font-mono bg-gray-200 px-3 py-0.5 rounded">Код: {currentQuiz.room_code}</span>
                  <span className="text-gray-500">{currentQuiz.category}</span>
                </div>
              </div>
              <button onClick={() => startQuiz(currentQuiz.id)} className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-semibold flex items-center gap-2">
                ▶ Запустить квиз
              </button>
            </div>

            <div className="bg-white rounded-3xl border p-8 mb-6">
              <h3 className="font-semibold text-xl mb-5">Добавить новый вопрос</h3>
              <input
                type="text"
                placeholder="Текст вопроса..."
                value={newQuestionText}
                onChange={e => setNewQuestionText(e.target.value)}
                className="w-full border px-5 py-4 rounded-2xl text-lg mb-4"
              />

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="URL изображения (опционально)"
                  value={newQuestionImageUrl}
                  onChange={e => setNewQuestionImageUrl(e.target.value)}
                  className="w-full border px-5 py-3 rounded-2xl text-sm"
                />
                {newQuestionImageUrl && (
                  <div className="mt-2">
                    <img src={newQuestionImageUrl} alt="preview" className="max-h-32 rounded-xl border" />
                  </div>
                )}
              </div>

              <div className="flex gap-6 mb-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={newQuestionType === 'single'} onChange={() => setNewQuestionType('single')} />
                  <span>Один правильный ответ</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={newQuestionType === 'multiple'} onChange={() => setNewQuestionType('multiple')} />
                  <span>Несколько правильных ответов</span>
                </label>
              </div>

              <div className="mb-4">
                <div className="font-medium mb-2 text-sm text-gray-700">Варианты ответов</div>
                {newAnswers.map((ans, index) => (
                  <div key={index} className="flex gap-3 mb-2 items-center">
                    <input
                      type="text"
                      placeholder={`Вариант ${index + 1}`}
                      value={ans.text}
                      onChange={e => updateAnswer(index, 'text', e.target.value)}
                      className="flex-1 border px-4 py-2.5 rounded-2xl"
                    />
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ans.isCorrect}
                        onChange={e => updateAnswer(index, 'isCorrect', e.target.checked)}
                      />
                      Правильный
                    </label>
                  </div>
                ))}
                <button onClick={addAnswerField} className="text-blue-600 text-sm mt-1 hover:underline">+ Добавить вариант ответа</button>
              </div>

              <button onClick={addQuestion} className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold">Добавить вопрос в квиз</button>
            </div>

            {currentQuizQuestions.length > 0 && (
              <div className="bg-white rounded-3xl border p-8">
                <h3 className="font-semibold mb-4">Вопросы в квизе ({currentQuizQuestions.length})</h3>
                <div className="space-y-3">
                  {currentQuizQuestions.map((q, _idx) => (
                    <div key={q.id} className="border rounded-2xl p-5 flex gap-4">
                      <div className="w-8 h-8 flex-shrink-0 bg-gray-100 rounded-xl flex items-center justify-center text-sm font-mono text-gray-500">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium mb-1">{q.text}</div>
                        {q.image_url && <div className="text-xs text-blue-600 mb-2">🖼 Изображение прикреплено</div>}
                        <div className="flex flex-wrap gap-2">
                          {q.answers?.map((a: any, i: number) => (
                            <span key={i} className={`text-xs px-3 py-1 rounded-full ${a.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {a.text}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => deleteQuestion(q.id)} className="text-red-500 hover:text-red-600 text-sm self-start">Удалить</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setScreen('dashboard')} className="px-8 py-3 border rounded-2xl">Назад к списку</button>
              <button onClick={() => startQuiz(currentQuiz.id)} className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-semibold">Запустить квиз сейчас</button>
            </div>
          </div>
        )}

        {screen === 'quiz' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
              <div className="px-8 py-6 border-b flex items-center justify-between bg-gray-50">
                <div>
                  <div className="text-xs text-gray-500">КОД КОМНАТЫ</div>
                  <div className="font-mono text-4xl font-bold tracking-[6px] text-gray-900">{roomCode}</div>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-4 py-1 rounded-full text-xs font-medium ${isOrganizer ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {isOrganizer ? 'Вы — Организатор' : 'Вы — Участник'}
                  </div>
                  {questionIndex > 0 && (
                    <div className="mt-1 text-sm text-gray-600">Вопрос {questionIndex} из {totalQuestions}</div>
                  )}
                </div>
              </div>

              <div className="p-8">
                {currentQuestion ? (
                  <div>
                    {currentQuestion.imageUrl && (
                      <div className="mb-6 rounded-2xl overflow-hidden border">
                        <img src={currentQuestion.imageUrl} alt="question" className="w-full max-h-[320px] object-cover" />
                      </div>
                    )}

                    <div className="text-3xl font-semibold tracking-tight leading-tight mb-8">
                      {currentQuestion.text}
                    </div>

                    {timeLeft > 0 && (
                      <div className="mb-6 flex items-center gap-3 text-sm">
                        <div className="font-mono text-2xl font-bold text-orange-600 w-12">{timeLeft}</div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-2 bg-orange-500 transition-all"
                            style={{ width: `${(timeLeft / (currentQuiz?.time_per_question || 30)) * 100}%` }}
                          />
                        </div>
                        <div className="text-gray-500">секунд</div>
                      </div>
                    )}

                    <div className="grid gap-3">
                      {currentQuestion.answers?.map((ans: any, _index: number) => {
                        const isSelected = selectedAnswerIds.includes(ans.id);
                        return (
                          <button
                            key={ans.id}
                            onClick={() => toggleAnswer(ans.id)}
                            disabled={hasAnswered}
                            className={`text-left px-6 py-5 rounded-2xl border-2 text-lg transition-all active:scale-[0.985] ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50 shadow-inner'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            } ${hasAnswered ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {ans.text}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-8">
                      {!isOrganizer && !hasAnswered && (
                        <button
                          onClick={submitAnswer}
                          disabled={selectedAnswerIds.length === 0}
                          className="w-full py-4 bg-blue-600 disabled:bg-gray-300 text-white rounded-2xl font-semibold text-xl active:scale-[0.985] transition"
                        >
                          Отправить ответ
                        </button>
                      )}

                      {isOrganizer && (
                        <button
                          onClick={goToNextQuestion}
                          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-xl active:scale-[0.985] transition flex items-center justify-center gap-2"
                        >
                          Следующий вопрос →
                        </button>
                      )}

                      {hasAnswered && !isOrganizer && (
                        <div className="text-center py-4 text-emerald-600 font-medium flex items-center justify-center gap-2">
                          <span>✓</span> Ответ отправлен. Ждём следующий вопрос...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="text-7xl mb-6">🎮</div>
                    <p className="text-2xl text-gray-700 mb-2">Квиз готов к старту</p>
                    <p className="text-gray-500 mb-8">Участники могут подключаться по коду выше</p>
                    {isOrganizer && (
                      <button onClick={goToNextQuestion} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-semibold text-lg">
                        Начать квиз (первый вопрос)
                      </button>
                    )}
                  </div>
                )}

                {participants.length > 0 && (
                  <div className="mt-10 pt-8 border-t">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold">Участники онлайн • {participants.length}</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {participants.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-gray-50 px-5 py-3 rounded-2xl text-sm">
                          <span className="font-medium">{p.name}</span>
                          <span className="font-mono font-bold text-emerald-600">{p.score} баллов</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {leaderboard.length > 0 && (
                  <div className="mt-10 pt-8 border-t">
                    <h3 className="text-center text-2xl font-bold mb-6">🏆 Результаты квиза</h3>
                    <div className="max-w-md mx-auto space-y-2">
                      {leaderboard.map((p, i) => (
                        <div key={i} className={`flex justify-between items-center px-6 py-4 rounded-2xl ${i === 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-xl w-8 text-center">#{i + 1}</span>
                            <span className="font-medium text-lg">{p.name}</span>
                          </div>
                          <span className="font-bold text-2xl tabular-nums">{p.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => setScreen('dashboard')} className="mt-6 text-sm text-gray-500 hover:text-gray-700">← Вернуться на главную</button>
          </div>
        )}

        {screen === 'profile' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-3xl border p-8">
              <h2 className="text-3xl font-bold mb-8">Личный кабинет</h2>
              <div className="space-y-8">
                <div>
                  <div className="text-sm text-gray-500">Имя</div>
                  <div className="text-2xl font-semibold">{user.name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Email</div>
                  <div>{user.email}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Роль</div>
                  <div className="capitalize">{user.role}</div>
                </div>
              </div>
              <div className="mt-10 pt-8 border-t text-sm text-gray-600">
                Здесь в будущем будет история пройденных и проведённых квизов с баллами и достижениями.<br />Сейчас данные сохраняются в базе — можно легко расширить.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;