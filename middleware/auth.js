/**
 * ============================================
 * MIDDLEWARE: JWT Authentication
 * ============================================
 * Xác thực token JWT từ header Authorization
 * Gắn thông tin user vào req.user nếu hợp lệ
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware xác thực JWT token
 * Trích xuất token từ header "Authorization: Bearer <token>"
 * Xác minh và giải mã token, gắn user info vào request
 */
function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    } else {
      return res.status(401).json({
        success: false,
        error: 'Format token không hợp lệ. Sử dụng: Bearer <token>',
        code: 'AUTH_TOKEN_FORMAT_INVALID'
      });
    }
  }

  // Nếu không có token trong header, tìm trong query parameter (hỗ trợ download trực tiếp)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Không tìm thấy token xác thực',
      code: 'AUTH_TOKEN_MISSING'
    });
  }

  // Xác minh token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Kiểm tra xem user có thực sự tồn tại trong DB không (đề phòng re-seed DB làm mất user cũ)
    const db = req.app.locals.db;
    if (db) {
      const user = db.prepare('SELECT id, is_locked FROM users WHERE id = ?').get(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Tài khoản không tồn tại trên hệ thống (DB đã re-seed). Vui lòng đăng nhập lại.',
          code: 'AUTH_USER_NOT_FOUND'
        });
      }
      if (user.is_locked === 1) {
        return res.status(403).json({
          success: false,
          error: 'Tài khoản của bạn đã bị khóa do vi phạm nguyên tắc bảo mật. Vui lòng liên hệ Admin để mở lại tài khoản.',
          code: 'AUTH_USER_LOCKED'
        });
      }
    }

    // Gắn thông tin user vào request
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      fullName: decoded.fullName
    };

    next();
  } catch (err) {
    // Phân biệt loại lỗi token
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token đã hết hạn, vui lòng đăng nhập lại',
        code: 'AUTH_TOKEN_EXPIRED'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token không hợp lệ',
        code: 'AUTH_TOKEN_INVALID'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Lỗi xác thực token',
      code: 'AUTH_ERROR'
    });
  }
}

module.exports = { authenticateToken };
