/**
 * ============================================
 * ROUTES: Grade Management
 * ============================================
 * Quản lý điểm số, chấm bài, thống kê điểm
 * Tất cả endpoint đều yêu cầu xác thực JWT
 */

const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('../services/audit-service');

const router = express.Router();

// ══════════════════════════════════════════════
// GET /api/grades
// Lấy danh sách điểm (lọc theo quyền)
// Student: chỉ điểm của mình
// Teacher: điểm của khóa mình dạy
// Admin: tất cả điểm
// ══════════════════════════════════════════════
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;

    let grades;

    if (user.role === 'admin') {
      // Admin: xem tất cả điểm
      grades = db.prepare(`
        SELECT g.*,
               a.title as assignment_title, a.assignment_type, a.course_id,
               c.name as course_name, c.code as course_code,
               u.full_name as student_name, u.username as student_username,
               grader.full_name as grader_name
        FROM grades g
        JOIN assignments a ON g.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        JOIN users u ON g.student_id = u.id
        LEFT JOIN users grader ON g.graded_by = grader.id
        ORDER BY g.graded_at DESC
      `).all();
    } else if (user.role === 'teacher') {
      // Teacher: điểm của khóa mình dạy
      grades = db.prepare(`
        SELECT g.*,
               a.title as assignment_title, a.assignment_type, a.course_id,
               c.name as course_name, c.code as course_code,
               u.full_name as student_name, u.username as student_username,
               grader.full_name as grader_name
        FROM grades g
        JOIN assignments a ON g.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        JOIN users u ON g.student_id = u.id
        LEFT JOIN users grader ON g.graded_by = grader.id
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
        ORDER BY g.graded_at DESC
      `).all(user.id);
    } else {
      // Student: chỉ điểm của mình
      grades = db.prepare(`
        SELECT g.*,
               a.title as assignment_title, a.assignment_type, a.course_id,
               c.name as course_name, c.code as course_code,
               u.full_name as student_name, u.username as student_username,
               grader.full_name as grader_name
        FROM grades g
        JOIN assignments a ON g.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        JOIN users u ON g.student_id = u.id
        LEFT JOIN users grader ON g.graded_by = grader.id
        WHERE g.student_id = ?
        ORDER BY g.graded_at DESC
      `).all(user.id);
    }

    res.json({
      success: true,
      data: {
        grades,
        total: grades.length
      }
    });

  } catch (err) {
    console.error('[GRADE] List error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách điểm',
      code: 'GRADE_LIST_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// POST /api/grades
// Chấm điểm một submission
// Requires: teacher hoặc admin
// Body: { submissionId, score, feedback }
// ══════════════════════════════════════════════
router.post('/', authenticateToken, requireRole('teacher', 'admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const { submissionId, score, feedback } = req.body;

    // ── Validate input ──
    if (!submissionId || score === undefined || score === null) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: submissionId, score',
        code: 'GRADE_MISSING_FIELDS'
      });
    }

    // Kiểm tra submission tồn tại
    const submission = db.prepare(`
      SELECT s.*, a.max_score, a.title as assignment_title, a.course_id, a.id as assignment_id
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE s.id = ?
    `).get(submissionId);

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Bài nộp không tồn tại',
        code: 'SUBMISSION_NOT_FOUND'
      });
    }

    // Validate score không vượt quá max_score
    if (score < 0 || score > submission.max_score) {
      return res.status(400).json({
        success: false,
        error: `Điểm phải nằm trong khoảng 0 - ${submission.max_score}`,
        code: 'GRADE_SCORE_INVALID'
      });
    }

    // Teacher chỉ chấm bài trong khóa mình dạy
    if (user.role === 'teacher') {
      const enrollment = db.prepare(
        'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
      ).get(user.id, submission.course_id);
      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: 'Bạn không dạy khóa học này',
          code: 'GRADE_COURSE_ACCESS_DENIED'
        });
      }
    }

    // Kiểm tra đã chấm chưa - nếu rồi thì cập nhật
    const existingGrade = db.prepare(
      'SELECT * FROM grades WHERE submission_id = ?'
    ).get(submissionId);

    let gradeId;

    if (existingGrade) {
      // Cập nhật điểm cũ
      gradeId = existingGrade.id;
      db.prepare(`
        UPDATE grades SET score = ?, feedback = ?, graded_by = ?, graded_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(score, feedback || null, user.id, gradeId);
    } else {
      // Tạo điểm mới
      gradeId = `grade-${crypto.randomUUID().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO grades (id, submission_id, student_id, assignment_id, score, max_score, feedback, graded_by, graded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(gradeId, submissionId, submission.student_id, submission.assignment_id,
        score, submission.max_score, feedback || null, user.id);
    }

    // Cập nhật trạng thái submission thành 'graded'
    db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").run(submissionId);

    // Ghi audit log
    logAction(db, {
      userId: user.id,
      action: 'GRADE_SUBMITTED',
      targetType: 'grade',
      targetId: gradeId,
      details: {
        submissionId,
        studentId: submission.student_id,
        assignmentTitle: submission.assignment_title,
        score,
        maxScore: submission.max_score
      },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    // Trả về grade vừa tạo/cập nhật
    const grade = db.prepare(`
      SELECT g.*,
             a.title as assignment_title, a.course_id,
             c.name as course_name,
             u.full_name as student_name
      FROM grades g
      JOIN assignments a ON g.assignment_id = a.id
      JOIN courses c ON a.course_id = c.id
      JOIN users u ON g.student_id = u.id
      WHERE g.id = ?
    `).get(gradeId);

    res.status(existingGrade ? 200 : 201).json({
      success: true,
      message: existingGrade ? 'Cập nhật điểm thành công' : 'Chấm điểm thành công',
      data: grade
    });

  } catch (err) {
    console.error('[GRADE] Create error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi chấm điểm',
      code: 'GRADE_CREATE_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// GET /api/grades/summary
// Thống kê điểm: trung bình per student, per course
// Requires: teacher hoặc admin
// ══════════════════════════════════════════════
router.get('/summary', authenticateToken, requireRole('teacher', 'admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;

    // ── Thống kê trung bình theo từng sinh viên ──
    let studentAverages;
    if (user.role === 'admin') {
      studentAverages = db.prepare(`
        SELECT g.student_id,
               u.full_name as student_name,
               u.username as student_username,
               COUNT(g.id) as total_grades,
               ROUND(AVG(g.score * 100.0 / g.max_score), 2) as average_percentage,
               ROUND(AVG(g.score), 2) as average_score,
               MIN(g.score * 100.0 / g.max_score) as min_percentage,
               MAX(g.score * 100.0 / g.max_score) as max_percentage
        FROM grades g
        JOIN users u ON g.student_id = u.id
        GROUP BY g.student_id
        ORDER BY average_percentage DESC
      `).all();
    } else {
      // Teacher: chỉ sinh viên trong khóa mình dạy
      studentAverages = db.prepare(`
        SELECT g.student_id,
               u.full_name as student_name,
               u.username as student_username,
               COUNT(g.id) as total_grades,
               ROUND(AVG(g.score * 100.0 / g.max_score), 2) as average_percentage,
               ROUND(AVG(g.score), 2) as average_score,
               MIN(g.score * 100.0 / g.max_score) as min_percentage,
               MAX(g.score * 100.0 / g.max_score) as max_percentage
        FROM grades g
        JOIN users u ON g.student_id = u.id
        JOIN assignments a ON g.assignment_id = a.id
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
        GROUP BY g.student_id
        ORDER BY average_percentage DESC
      `).all(user.id);
    }

    // ── Thống kê theo từng khóa học ──
    let courseStats;
    if (user.role === 'admin') {
      courseStats = db.prepare(`
        SELECT a.course_id,
               c.name as course_name,
               c.code as course_code,
               COUNT(DISTINCT g.student_id) as total_students,
               COUNT(g.id) as total_grades,
               ROUND(AVG(g.score * 100.0 / g.max_score), 2) as average_percentage,
               ROUND(AVG(g.score), 2) as average_score
        FROM grades g
        JOIN assignments a ON g.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        GROUP BY a.course_id
        ORDER BY course_name ASC
      `).all();
    } else {
      courseStats = db.prepare(`
        SELECT a.course_id,
               c.name as course_name,
               c.code as course_code,
               COUNT(DISTINCT g.student_id) as total_students,
               COUNT(g.id) as total_grades,
               ROUND(AVG(g.score * 100.0 / g.max_score), 2) as average_percentage,
               ROUND(AVG(g.score), 2) as average_score
        FROM grades g
        JOIN assignments a ON g.assignment_id = a.id
        JOIN courses c ON a.course_id = c.id
        JOIN enrollments e ON a.course_id = e.course_id
        WHERE e.user_id = ?
        GROUP BY a.course_id
        ORDER BY course_name ASC
      `).all(user.id);
    }

    res.json({
      success: true,
      data: {
        studentAverages,
        courseStats,
        totalStudents: studentAverages.length,
        totalCourses: courseStats.length
      }
    });

  } catch (err) {
    console.error('[GRADE] Summary error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy thống kê điểm',
      code: 'GRADE_SUMMARY_ERROR'
    });
  }
});

module.exports = router;
