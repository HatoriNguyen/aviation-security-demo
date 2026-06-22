/**
 * ============================================
 * MIDDLEWARE: Role-Based Access Control (RBAC)
 * ============================================
 * Kiểm soát quyền truy cập dựa trên vai trò người dùng
 * và quyền truy cập khóa học
 */

/**
 * Middleware kiểm tra vai trò người dùng
 * @param  {...string} roles - Danh sách vai trò được phép (admin, teacher, student)
 * @returns {Function} Express middleware
 * 
 * Ví dụ: requireRole('admin', 'teacher') - chỉ admin và teacher được truy cập
 */
function requireRole(...roles) {
  return (req, res, next) => {
    // Kiểm tra đã xác thực chưa
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Chưa xác thực. Vui lòng đăng nhập.',
        code: 'RBAC_NOT_AUTHENTICATED'
      });
    }

    // Kiểm tra vai trò có nằm trong danh sách được phép không
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Bạn không có quyền truy cập. Yêu cầu vai trò: ${roles.join(', ')}`,
        code: 'RBAC_INSUFFICIENT_ROLE',
        requiredRoles: roles,
        currentRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware kiểm tra quyền truy cập khóa học
 * Admin được bypass tất cả
 * Teacher phải được gán dạy khóa học đó
 * Student phải được đăng ký khóa học đó
 */
function requireCourseAccess(req, res, next) {
  // Kiểm tra đã xác thực chưa
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Chưa xác thực. Vui lòng đăng nhập.',
      code: 'RBAC_NOT_AUTHENTICATED'
    });
  }

  // Admin bypass tất cả kiểm tra khóa học
  if (req.user.role === 'admin') {
    return next();
  }

  // Lấy courseId từ body, params hoặc query
  const courseId = req.body.courseId || req.params.courseId || req.query.courseId;

  if (!courseId) {
    return res.status(400).json({
      success: false,
      error: 'Thiếu mã khóa học (courseId)',
      code: 'RBAC_COURSE_ID_MISSING'
    });
  }

  // Kiểm tra enrollment trong database
  const db = req.app.locals.db;
  const enrollment = db.prepare(`
    SELECT user_id, course_id FROM enrollments 
    WHERE user_id = ? AND course_id = ?
  `).get(req.user.id, courseId);

  if (!enrollment) {
    return res.status(403).json({
      success: false,
      error: 'Bạn không có quyền truy cập khóa học này',
      code: 'RBAC_COURSE_ACCESS_DENIED',
      courseId: courseId
    });
  }

  // Gắn thông tin enrollment vào request
  req.courseAccess = {
    courseId: courseId,
    userId: req.user.id,
    verified: true
  };

  next();
}

module.exports = { requireRole, requireCourseAccess };
