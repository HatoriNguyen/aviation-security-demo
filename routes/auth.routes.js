/**
 * ============================================
 * ROUTES: Authentication
 * ============================================
 * Xử lý đăng nhập, đăng ký, và thông tin user
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('../services/audit-service');

const router = express.Router();

/**
 * POST /api/auth/login
 * Đăng nhập và nhận JWT token
 * Body: { username, password }
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const db = req.app.locals.db;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng nhập tên đăng nhập và mật khẩu',
        code: 'LOGIN_MISSING_FIELDS'
      });
    }

    // Tìm user trong database
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      // Log thử đăng nhập thất bại (username không tồn tại)
      logAction(db, {
        userId: 'anonymous',
        action: 'LOGIN_FAILED',
        targetType: 'auth',
        details: { username: username, reason: 'User not found' },
        ipAddress: req.ip,
        riskLevel: 'medium'
      });

      return res.status(401).json({
        success: false,
        error: 'Tên đăng nhập hoặc mật khẩu không đúng',
        code: 'LOGIN_INVALID_CREDENTIALS'
      });
    }

    // So sánh mật khẩu
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);

    if (!passwordMatch) {
      // Log thử đăng nhập thất bại (sai mật khẩu)
      logAction(db, {
        userId: user.id,
        action: 'LOGIN_FAILED',
        targetType: 'auth',
        details: { username: username, reason: 'Wrong password' },
        ipAddress: req.ip,
        riskLevel: 'medium'
      });

      return res.status(401).json({
        success: false,
        error: 'Tên đăng nhập hoặc mật khẩu không đúng',
        code: 'LOGIN_INVALID_CREDENTIALS'
      });
    }

    // Kiểm tra xem tài khoản có bị khóa không
    if (user.is_locked === 1) {
      logAction(db, {
        userId: user.id,
        action: 'LOGIN_FAILED',
        targetType: 'auth',
        details: { username: username, reason: 'Account locked' },
        ipAddress: req.ip,
        riskLevel: 'medium'
      });

      return res.status(403).json({
        success: false,
        error: 'Tài khoản của bạn đã bị khóa do vi phạm nguyên tắc an toàn thông tin (Prompt Injection) nhiều lần. Vui lòng liên hệ Admin để mở lại tài khoản.',
        code: 'AUTH_USER_LOCKED'
      });
    }

    // Tạo JWT token (hết hạn sau 24h)
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: '24h',
      issuer: 'aviation-academy'
    });

    // Log đăng nhập thành công
    logAction(db, {
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'auth',
      details: { username: username },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    // Lấy danh sách khóa học đã đăng ký
    const enrolledCourses = db.prepare(`
      SELECT c.id, c.name, c.code 
      FROM courses c
      JOIN enrollments e ON c.id = e.course_id
      WHERE e.user_id = ?
    `).all(user.id);

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        token: token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role
        },
        enrolledCourses: enrolledCourses
      }
    });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi server khi đăng nhập',
      code: 'LOGIN_SERVER_ERROR'
    });
  }
});

/**
 * GET /api/auth/me
 * Lấy thông tin người dùng hiện tại từ token
 * Requires: Bearer token
 */
router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = db.prepare(`
      SELECT id, username, full_name, role, created_at 
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Người dùng không tồn tại',
        code: 'USER_NOT_FOUND'
      });
    }

    // Lấy khóa học đã đăng ký
    const enrolledCourses = db.prepare(`
      SELECT c.id, c.name, c.code, c.description
      FROM courses c
      JOIN enrollments e ON c.id = e.course_id
      WHERE e.user_id = ?
    `).all(user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          createdAt: user.created_at
        },
        enrolledCourses: enrolledCourses
      }
    });

  } catch (err) {
    console.error('[AUTH] Get me error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi server',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/auth/register
 * Đăng ký người dùng mới (chỉ admin)
 * Body: { username, password, fullName, role }
 */
router.post('/register', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    const db = req.app.locals.db;

    // Validate input
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng điền đầy đủ thông tin: username, password, fullName, role',
        code: 'REGISTER_MISSING_FIELDS'
      });
    }

    // Validate role
    const validRoles = ['admin', 'teacher', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Vai trò không hợp lệ. Chỉ chấp nhận: ${validRoles.join(', ')}`,
        code: 'REGISTER_INVALID_ROLE'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Mật khẩu phải có ít nhất 6 ký tự',
        code: 'REGISTER_WEAK_PASSWORD'
      });
    }

    // Kiểm tra username đã tồn tại chưa
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Tên đăng nhập đã tồn tại',
        code: 'REGISTER_USERNAME_EXISTS'
      });
    }

    // Hash mật khẩu
    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = `user-${uuidv4().substring(0, 8)}`;

    // Tạo user mới
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username, passwordHash, fullName, role);

    // Log audit
    logAction(db, {
      userId: req.user.id,
      action: 'USER_CREATED',
      targetType: 'user',
      targetId: userId,
      details: { username, fullName, role, createdBy: req.user.username },
      ipAddress: req.ip,
      riskLevel: 'medium'
    });

    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản thành công',
      data: {
        id: userId,
        username: username,
        fullName: fullName,
        role: role
      }
    });

  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi server khi tạo tài khoản',
      code: 'REGISTER_SERVER_ERROR'
    });
  }
});

module.exports = router;
