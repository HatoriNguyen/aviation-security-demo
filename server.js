/**
 * ============================================
 * SERVER.JS - Aviation Academy Backend
 * ============================================
 * Entry point cho Aviation Security Demo
 * Cấu hình Express, middleware, routes
 * 
 * Security features:
 * - Helmet (HTTP security headers)
 * - CORS (Cross-Origin Resource Sharing)
 * - Rate limiting (chống brute force)
 * - Morgan (request logging)
 * - JWT authentication
 * - RBAC (Role-Based Access Control)
 * - File upload validation
 * - Prompt injection detection (SEC 6)
 * - Audit trail
 */

// Load biến môi trường từ .env
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Import database initializer
const { initDatabase } = require('./database/init');

// Import routes
const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');
const aiRoutes = require('./routes/ai.routes');
const auditRoutes = require('./routes/audit.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const gradeRoutes = require('./routes/grade.routes');
const adminRoutes = require('./routes/admin.routes');

// ══════════════════════════════════════════════
// KHỞI TẠO EXPRESS APP
// ══════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════
// MIDDLEWARE BẢO MẬT
// ══════════════════════════════════════════════

// Helmet - set các HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS - cho phép frontend truy cập
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://aviation-academy.example.com']
    : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Morgan - HTTP request logging
app.use(morgan('dev'));

// Parse JSON body (giới hạn 1MB)
app.use(express.json({ limit: '1mb' }));

// Parse URL-encoded body
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting - 100 requests / 15 phút mỗi IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});
app.use('/api/', limiter);

// ══════════════════════════════════════════════
// STATIC FILES
// ══════════════════════════════════════════════

// Serve static files từ thư mục public
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// ══════════════════════════════════════════════
// ĐẢM BẢO THƯ MỤC PRIVATE-STORAGE TỒN TẠI
// ══════════════════════════════════════════════
const privateStorageDir = path.join(__dirname, 'private-storage');
if (!fs.existsSync(privateStorageDir)) {
  fs.mkdirSync(privateStorageDir, { recursive: true });
  console.log('[SERVER] 📁 Đã tạo thư mục private-storage/');
}

// ══════════════════════════════════════════════
// KHỞI TẠO DATABASE (async vì sql.js cần async init)
// ══════════════════════════════════════════════
let db;

// ══════════════════════════════════════════════
// MOUNT ROUTES
// ══════════════════════════════════════════════

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Aviation Academy API - Security Demo',
    version: '1.1.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        register: 'POST /api/auth/register (admin only)'
      },
      files: {
        upload: 'POST /api/files/upload (teacher/admin)',
        list: 'GET /api/files',
        detail: 'GET /api/files/:id',
        download: 'GET /api/files/:id/download',
        toggleStatus: 'PATCH /api/files/:id/status (teacher/admin)',
        delete: 'DELETE /api/files/:id (admin only)'
      },
      assignments: {
        list: 'GET /api/assignments',
        create: 'POST /api/assignments (teacher/admin)',
        update: 'PUT /api/assignments/:id (teacher owner/admin)',
        delete: 'DELETE /api/assignments/:id (admin only)',
        submit: 'POST /api/assignments/:id/submit (student)',
        submissions: 'GET /api/assignments/:id/submissions (teacher/admin)'
      },
      grades: {
        list: 'GET /api/grades',
        create: 'POST /api/grades (teacher/admin)',
        summary: 'GET /api/grades/summary (teacher/admin)'
      },
      admin: {
        users: 'GET /api/admin/users (admin only)',
        deleteUser: 'DELETE /api/admin/users/:id (admin only)',
        courses: 'GET /api/admin/courses (admin only)',
        enroll: 'POST /api/admin/enroll (admin only)',
        unenroll: 'DELETE /api/admin/enroll (admin only)'
      },
      ai: {
        chat: 'POST /api/ai/chat',
        history: 'GET /api/ai/history',
        threats: 'GET /api/ai/threats (admin only)'
      },
      audit: {
        logs: 'GET /api/audit/logs (admin only)',
        stats: 'GET /api/audit/stats (admin only)'
      }
    },
    security: {
      SEC6: 'Prompt Injection Guard - 30+ patterns, threat scoring, Vietnamese support'
    }
  });
});

// Dashboard stats endpoint (cho mọi user đã đăng nhập)
const { authenticateToken } = require('./middleware/auth');

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;

    let totalDocuments, totalCourses, totalChats, securityAlerts;
    let totalAssignments, totalSubmissions, pendingGrades;

    if (user.role === 'admin') {
      totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents WHERE is_active = 1').get().count;
      totalCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
      totalChats = db.prepare('SELECT COUNT(*) as count FROM chat_history').get().count;
      securityAlerts = db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE risk_level IN ('high', 'critical')").get().count;
      totalAssignments = db.prepare('SELECT COUNT(*) as count FROM assignments').get().count;
      totalSubmissions = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
      pendingGrades = db.prepare(`
        SELECT COUNT(*) as count FROM submissions s
        LEFT JOIN grades g ON g.submission_id = s.id
        WHERE g.id IS NULL
      `).get().count;
    } else if (user.role === 'teacher') {
      // Teacher: data liên quan đến khóa mình dạy
      totalDocuments = db.prepare(`
        SELECT COUNT(*) as count FROM documents d
        JOIN enrollments e ON d.course_id = e.course_id
        WHERE e.user_id = ? AND d.is_active = 1
      `).get(user.id).count;
      totalCourses = db.prepare('SELECT COUNT(*) as count FROM enrollments WHERE user_id = ?').get(user.id).count;
      totalChats = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE user_id = ?').get(user.id).count;
      securityAlerts = db.prepare("SELECT COUNT(*) as count FROM chat_history WHERE user_id = ? AND is_suspicious = 1").get(user.id).count;
      totalAssignments = db.prepare(`
        SELECT COUNT(*) as count FROM assignments a
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
      `).get(user.id).count;
      totalSubmissions = db.prepare(`
        SELECT COUNT(*) as count FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
      `).get(user.id).count;
      pendingGrades = db.prepare(`
        SELECT COUNT(*) as count FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN enrollments e ON a.course_id = e.course_id
        LEFT JOIN grades g ON g.submission_id = s.id
        WHERE e.user_id = ? AND g.id IS NULL
      `).get(user.id).count;
    } else {
      // Student: chỉ count data liên quan đến mình
      totalDocuments = db.prepare(`
        SELECT COUNT(*) as count FROM documents d
        JOIN enrollments e ON d.course_id = e.course_id
        WHERE e.user_id = ? AND d.is_active = 1
      `).get(user.id).count;
      totalCourses = db.prepare('SELECT COUNT(*) as count FROM enrollments WHERE user_id = ?').get(user.id).count;
      totalChats = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE user_id = ?').get(user.id).count;
      securityAlerts = db.prepare("SELECT COUNT(*) as count FROM chat_history WHERE user_id = ? AND is_suspicious = 1").get(user.id).count;
      totalAssignments = db.prepare(`
        SELECT COUNT(*) as count FROM assignments a
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
      `).get(user.id).count;
      totalSubmissions = db.prepare(`
        SELECT COUNT(*) as count FROM submissions
        WHERE student_id = ?
      `).get(user.id).count;
      pendingGrades = 0; // Student không cần thấy pending grades
    }

    res.json({
      success: true,
      totalDocuments,
      totalCourses,
      totalChats,
      securityAlerts,
      totalAssignments,
      totalSubmissions,
      pendingGrades
    });
  } catch (err) {
    console.error('[DASHBOARD] Stats error:', err.message);
    res.json({ totalDocuments: 0, totalCourses: 0, totalChats: 0, securityAlerts: 0, totalAssignments: 0, totalSubmissions: 0, pendingGrades: 0 });
  }
});

// ══════════════════════════════════════════════
// COURSES ENDPOINT (cho tất cả user đã đăng nhập)
// ══════════════════════════════════════════════
app.get('/api/courses', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.user.id);

    let courses;
    if (user.role === 'admin') {
      // Admin xem tất cả khóa học
      courses = db.prepare('SELECT * FROM courses ORDER BY name').all();
    } else {
      // Teacher/Student chỉ xem khóa học đã đăng ký
      courses = db.prepare(`
        SELECT c.* FROM courses c
        INNER JOIN enrollments e ON c.id = e.course_id
        WHERE e.user_id = ?
        ORDER BY c.name
      `).all(user.id);
    }

    res.json({
      success: true,
      data: { courses }
    });
  } catch (err) {
    console.error('[COURSES] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mount route modules
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/admin', adminRoutes);

// ══════════════════════════════════════════════
// 404 HANDLER
// ══════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND'
  });
});

// ══════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ══════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('[SERVER] ❌ Unhandled error:', err.message);

  // Không tiết lộ stack trace trong production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    success: false,
    error: isDev ? err.message : 'Đã xảy ra lỗi nội bộ',
    code: 'INTERNAL_SERVER_ERROR',
    ...(isDev && { stack: err.stack })
  });
});

// ══════════════════════════════════════════════
// KHỞI ĐỘNG SERVER (async)
// ══════════════════════════════════════════════
async function startServer() {
  try {
    db = await initDatabase();
    app.locals.db = db;
    // Mở khóa tài khoản admin tự động
    try {
      db.prepare("UPDATE users SET is_locked = 0, injection_warnings = 0 WHERE role = 'admin'").run();
    } catch (e) {
      console.error('[SERVER] Lỗi mở khóa admin:', e);
    }
    console.log('[SERVER] ✅ Database đã sẵn sàng');
  } catch (err) {
    console.error('[SERVER] ❌ Lỗi khởi tạo database:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     ✈️  AVIATION ACADEMY - SECURITY DEMO       ║');
    console.log('║     AI Knowledge Support System                  ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  🌐 Server:  http://localhost:${PORT}              ║`);
    console.log(`║  📡 API:     http://localhost:${PORT}/api           ║`);
    console.log(`║  🔒 Mode:    ${(process.env.NODE_ENV || 'development').padEnd(35)}║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  📋 Demo Accounts:                               ║');
    console.log('║  • admin    / admin123    (Quản trị viên)        ║');
    console.log('║  • teacher1 / teacher123  (GV Toán)              ║');
    console.log('║  • teacher2 / teacher123  (GV Vật Lý)            ║');
    console.log('║  • student1 / student123  (SV - Toán, Vật Lý)   ║');
    console.log('║  • student2 / student123  (SV - chỉ Toán)       ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  🛡️  Security Features:                          ║');
    console.log('║  • SEC6: Prompt Injection Guard (30+ patterns)   ║');
    console.log('║  • JWT Auth + RBAC                               ║');
    console.log('║  • Rate Limiting (100 req/15min)                 ║');
    console.log('║  • Audit Trail                                   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });
}

startServer();

// ══════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════
process.on('SIGINT', () => {
  console.log('\n[SERVER] 🛑 Đang tắt server...');
  if (db) {
    db.close();
    console.log('[SERVER] ✅ Database đã đóng.');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SERVER] 🛑 Nhận tín hiệu SIGTERM...');
  if (db) {
    db.close();
  }
  process.exit(0);
});

module.exports = app;
