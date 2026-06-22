/**
 * ============================================
 * ROUTES: Admin Management
 * ============================================
 * Quản lý người dùng, khóa học, đăng ký (admin only)
 * Tất cả endpoint yêu cầu xác thực JWT + role admin
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('../services/audit-service');

const router = express.Router();

// Tất cả routes trong admin đều yêu cầu đăng nhập + admin
router.use(authenticateToken);
router.use(requireRole('admin'));

// ══════════════════════════════════════════════
// GET /api/admin/users
// Lấy danh sách tất cả người dùng
// Bao gồm số khóa học đã đăng ký
// ══════════════════════════════════════════════
router.get('/users', (req, res) => {
  try {
    const db = req.app.locals.db;

    const users = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.created_at, u.is_locked, u.injection_warnings,
             COUNT(e.course_id) as enrollment_count
      FROM users u
      LEFT JOIN enrollments e ON u.id = e.user_id
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `).all();

    res.json({
      success: true,
      data: {
        users,
        total: users.length
      }
    });

  } catch (err) {
    console.error('[ADMIN] Users list error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách người dùng',
      code: 'ADMIN_USERS_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/admin/users/:id
// Xóa người dùng (không thể xóa chính mình)
// ══════════════════════════════════════════════
router.delete('/users/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Không cho phép xóa chính mình
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Không thể xóa tài khoản của chính mình',
        code: 'ADMIN_CANNOT_DELETE_SELF'
      });
    }

    // Kiểm tra user tồn tại
    const targetUser = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Người dùng không tồn tại',
        code: 'USER_NOT_FOUND'
      });
    }

    // Xóa user (CASCADE sẽ xóa enrollments, submissions, grades liên quan)
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    // Ghi audit log
    logAction(db, {
      userId: req.user.id,
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: id,
      details: {
        deletedUser: targetUser.username,
        deletedName: targetUser.full_name,
        deletedRole: targetUser.role
      },
      ipAddress: req.ip,
      riskLevel: 'high'
    });

    res.json({
      success: true,
      message: `Đã xóa người dùng: ${targetUser.full_name} (${targetUser.username})`,
      data: {
        id,
        username: targetUser.username,
        fullName: targetUser.full_name
      }
    });

  } catch (err) {
    console.error('[ADMIN] Delete user error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi xóa người dùng',
      code: 'ADMIN_DELETE_USER_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// GET /api/admin/courses
// Lấy danh sách khóa học với chi tiết enrollment
// Bao gồm: số sinh viên, thông tin giáo viên
// ══════════════════════════════════════════════
router.get('/courses', (req, res) => {
  try {
    const db = req.app.locals.db;

    // Lấy tất cả khóa học
    const courses = db.prepare('SELECT * FROM courses ORDER BY name ASC').all();

    // Bổ sung thông tin enrollment cho mỗi khóa
    const enriched = courses.map(course => {
      // Đếm số sinh viên (role=student) đăng ký
      const studentCount = db.prepare(`
        SELECT COUNT(*) as count FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.course_id = ? AND u.role = 'student'
      `).get(course.id).count;

      // Lấy danh sách giáo viên dạy khóa này
      const teachers = db.prepare(`
        SELECT u.id, u.username, u.full_name FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.course_id = ? AND u.role = 'teacher'
      `).all(course.id);

      // Đếm số bài tập trong khóa
      const assignmentCount = db.prepare(
        'SELECT COUNT(*) as count FROM assignments WHERE course_id = ?'
      ).get(course.id).count;

      // Đếm số tài liệu active
      const documentCount = db.prepare(
        'SELECT COUNT(*) as count FROM documents WHERE course_id = ? AND is_active = 1'
      ).get(course.id).count;

      return {
        ...course,
        studentCount,
        teachers,
        assignmentCount,
        documentCount
      };
    });

    res.json({
      success: true,
      data: {
        courses: enriched,
        total: enriched.length
      }
    });

  } catch (err) {
    console.error('[ADMIN] Courses list error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách khóa học',
      code: 'ADMIN_COURSES_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// POST /api/admin/enroll
// Đăng ký người dùng vào khóa học
// Body: { userId, courseId }
// ══════════════════════════════════════════════
router.post('/enroll', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { userId, courseId } = req.body;

    // ── Validate input ──
    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: userId, courseId',
        code: 'ENROLL_MISSING_FIELDS'
      });
    }

    // Kiểm tra user tồn tại
    const user = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Người dùng không tồn tại',
        code: 'USER_NOT_FOUND'
      });
    }

    // Kiểm tra khóa học tồn tại
    const course = db.prepare('SELECT id, name, code FROM courses WHERE id = ?').get(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Khóa học không tồn tại',
        code: 'COURSE_NOT_FOUND'
      });
    }

    // Kiểm tra đã đăng ký chưa
    const existing = db.prepare(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(userId, courseId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `${user.full_name} đã đăng ký khóa ${course.name}`,
        code: 'ENROLL_ALREADY_EXISTS'
      });
    }

    // Đăng ký
    db.prepare('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)').run(userId, courseId);

    // Ghi audit log
    logAction(db, {
      userId: req.user.id,
      action: 'USER_ENROLLED',
      targetType: 'enrollment',
      targetId: `${userId}_${courseId}`,
      details: {
        enrolledUser: user.username,
        enrolledName: user.full_name,
        courseName: course.name,
        courseCode: course.code
      },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    res.status(201).json({
      success: true,
      message: `Đã đăng ký ${user.full_name} vào khóa ${course.name}`,
      data: {
        userId,
        courseId,
        userName: user.full_name,
        courseName: course.name
      }
    });

  } catch (err) {
    console.error('[ADMIN] Enroll error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi đăng ký khóa học',
      code: 'ADMIN_ENROLL_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/admin/enroll
// Hủy đăng ký người dùng khỏi khóa học
// Body: { userId, courseId }
// ══════════════════════════════════════════════
router.delete('/enroll', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { userId, courseId } = req.body;

    // ── Validate input ──
    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: userId, courseId',
        code: 'UNENROLL_MISSING_FIELDS'
      });
    }

    // Kiểm tra enrollment tồn tại
    const enrollment = db.prepare(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        error: 'Không tìm thấy đăng ký này',
        code: 'ENROLLMENT_NOT_FOUND'
      });
    }

    // Lấy thông tin để log
    const user = db.prepare('SELECT username, full_name FROM users WHERE id = ?').get(userId);
    const course = db.prepare('SELECT name, code FROM courses WHERE id = ?').get(courseId);

    // Xóa enrollment
    db.prepare('DELETE FROM enrollments WHERE user_id = ? AND course_id = ?').run(userId, courseId);

    // Ghi audit log
    logAction(db, {
      userId: req.user.id,
      action: 'USER_UNENROLLED',
      targetType: 'enrollment',
      targetId: `${userId}_${courseId}`,
      details: {
        unenrolledUser: user ? user.username : userId,
        unenrolledName: user ? user.full_name : 'Unknown',
        courseName: course ? course.name : courseId
      },
      ipAddress: req.ip,
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: `Đã hủy đăng ký ${user ? user.full_name : userId} khỏi khóa ${course ? course.name : courseId}`,
      data: {
        userId,
        courseId
      }
    });

  } catch (err) {
    console.error('[ADMIN] Unenroll error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi hủy đăng ký khóa học',
      code: 'ADMIN_UNENROLL_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// POST /api/admin/users/:id/unlock
// Mở khóa tài khoản học viên (Reset warnings & locked status)
// ══════════════════════════════════════════════
router.post('/users/:id/unlock', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Kiểm tra user tồn tại
    const targetUser = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?').get(id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Người dùng không tồn tại',
        code: 'USER_NOT_FOUND'
      });
    }

    // Mở khóa tài khoản và reset warnings
    db.prepare('UPDATE users SET is_locked = 0, injection_warnings = 0 WHERE id = ?').run(id);

    // Ghi audit log
    logAction(db, {
      userId: req.user.id,
      action: 'USER_UNLOCKED',
      targetType: 'user',
      targetId: id,
      details: {
        unlockedUser: targetUser.username,
        unlockedName: targetUser.full_name,
        unlockedRole: targetUser.role
      },
      ipAddress: req.ip,
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: `Đã mở khóa tài khoản: ${targetUser.full_name} (${targetUser.username})`,
      data: {
        id,
        username: targetUser.username,
        fullName: targetUser.full_name
      }
    });

  } catch (err) {
    console.error('[ADMIN] Unlock user error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi mở khóa tài khoản',
      code: 'ADMIN_UNLOCK_USER_ERROR'
    });
  }
});

module.exports = router;
