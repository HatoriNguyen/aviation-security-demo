/**
 * ============================================
 * ROUTES: Assignment Management
 * ============================================
 * Quản lý bài tập, nộp bài, chấm điểm tự động
 * Tất cả endpoint đều yêu cầu xác thực JWT
 */

const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction } = require('../services/audit-service');

const router = express.Router();

// ══════════════════════════════════════════════
// GET /api/assignments
// Lấy danh sách bài tập (lọc theo quyền)
// Query: ?course_id=xxx
// ══════════════════════════════════════════════
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const { course_id } = req.query;

    let assignments;

    if (user.role === 'admin') {
      // Admin: xem tất cả bài tập
      if (course_id) {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          WHERE a.course_id = ?
          ORDER BY a.due_date ASC
        `).all(course_id);
      } else {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          ORDER BY a.due_date ASC
        `).all();
      }
    } else if (user.role === 'teacher') {
      // Teacher: chỉ xem bài tập của khóa mình dạy
      if (course_id) {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          JOIN enrollments e ON a.course_id = e.course_id
          WHERE e.user_id = ? AND a.course_id = ?
          ORDER BY a.due_date ASC
        `).all(user.id, course_id);
      } else {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          JOIN enrollments e ON a.course_id = e.course_id
          WHERE e.user_id = ?
          ORDER BY a.due_date ASC
        `).all(user.id);
      }
    } else {
      // Student: chỉ xem bài tập của khóa đã đăng ký
      if (course_id) {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          JOIN enrollments e ON a.course_id = e.course_id
          WHERE e.user_id = ? AND a.course_id = ?
          ORDER BY a.due_date ASC
        `).all(user.id, course_id);
      } else {
        assignments = db.prepare(`
          SELECT a.*, c.name as course_name, c.code as course_code,
                 u.full_name as teacher_name
          FROM assignments a
          JOIN courses c ON a.course_id = c.id
          JOIN users u ON a.teacher_id = u.id
          JOIN enrollments e ON a.course_id = e.course_id
          WHERE e.user_id = ?
          ORDER BY a.due_date ASC
        `).all(user.id);
      }
    }

    // Bổ sung thông tin submission count, trạng thái deadline, và submission của user (student)
    const now = new Date().toISOString();
    const enriched = assignments.map(a => {
      const submissionCount = db.prepare(
        'SELECT COUNT(*) as count FROM submissions WHERE assignment_id = ?'
      ).get(a.id).count;

      const isOverdue = new Date(a.due_date) < new Date();

      const result = {
        ...a,
        submissionCount,
        isOverdue
      };

      // Nếu là student, thêm thông tin submission của chính mình
      if (user.role === 'student') {
        const userSubmission = db.prepare(`
          SELECT s.*, g.score, g.max_score as grade_max_score, g.feedback
          FROM submissions s
          LEFT JOIN grades g ON g.submission_id = s.id
          WHERE s.assignment_id = ? AND s.student_id = ?
        `).get(a.id, user.id);
        result.userSubmission = userSubmission || null;
      }

      return result;
    });

    res.json({
      success: true,
      data: {
        assignments: enriched,
        total: enriched.length,
        courseId: course_id || 'all'
      }
    });

  } catch (err) {
    console.error('[ASSIGNMENT] List error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách bài tập',
      code: 'ASSIGNMENT_LIST_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// POST /api/assignments
// Tạo bài tập mới
// Requires: teacher hoặc admin
// Body: { title, description, courseId, dueDate, maxScore, assignmentType, autoGrade }
// ══════════════════════════════════════════════
router.post('/', authenticateToken, requireRole('teacher', 'admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const { title, description, courseId, dueDate, maxScore, assignmentType, autoGrade } = req.body;

    // ── Validate input ──
    if (!title || !courseId || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc: title, courseId, dueDate',
        code: 'ASSIGNMENT_MISSING_FIELDS'
      });
    }

    // Kiểm tra khóa học tồn tại
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Khóa học không tồn tại',
        code: 'COURSE_NOT_FOUND'
      });
    }

    // Teacher chỉ tạo cho khóa mình đăng ký dạy
    if (user.role === 'teacher') {
      const enrollment = db.prepare(
        'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
      ).get(user.id, courseId);
      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: 'Bạn không dạy khóa học này',
          code: 'ASSIGNMENT_COURSE_ACCESS_DENIED'
        });
      }
    }

    // Tạo ID duy nhất
    const id = `assign-${crypto.randomUUID().slice(0, 8)}`;
    const type = assignmentType || 'homework';
    const score = maxScore || 10;
    const auto = autoGrade ? 1 : 0;

    db.prepare(`
      INSERT INTO assignments (id, title, description, course_id, teacher_id, due_date, max_score, assignment_type, auto_grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description || null, courseId, user.id, dueDate, score, type, auto);

    // Ghi audit log
    logAction(db, {
      userId: user.id,
      action: 'ASSIGNMENT_CREATED',
      targetType: 'assignment',
      targetId: id,
      details: { title, courseId, dueDate, type },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    // Lấy bài tập vừa tạo
    const assignment = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code
      FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `).get(id);

    res.status(201).json({
      success: true,
      message: 'Tạo bài tập thành công',
      data: assignment
    });

  } catch (err) {
    console.error('[ASSIGNMENT] Create error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi tạo bài tập',
      code: 'ASSIGNMENT_CREATE_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// PUT /api/assignments/:id
// Cập nhật bài tập
// Requires: teacher (chủ bài tập) hoặc admin
// ══════════════════════════════════════════════
router.put('/:id', authenticateToken, requireRole('teacher', 'admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const { id } = req.params;
    const { title, description, dueDate, maxScore, assignmentType, autoGrade } = req.body;

    // Kiểm tra bài tập tồn tại
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Bài tập không tồn tại',
        code: 'ASSIGNMENT_NOT_FOUND'
      });
    }

    // Teacher chỉ sửa bài tập của chính mình
    if (user.role === 'teacher' && assignment.teacher_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'Bạn chỉ có thể chỉnh sửa bài tập do mình tạo',
        code: 'ASSIGNMENT_UPDATE_DENIED'
      });
    }

    // Cập nhật các field được gửi lên
    const updatedTitle = title || assignment.title;
    const updatedDesc = description !== undefined ? description : assignment.description;
    const updatedDueDate = dueDate || assignment.due_date;
    const updatedMaxScore = maxScore !== undefined ? maxScore : assignment.max_score;
    const updatedType = assignmentType || assignment.assignment_type;
    const updatedAutoGrade = autoGrade !== undefined ? (autoGrade ? 1 : 0) : assignment.auto_grade;

    db.prepare(`
      UPDATE assignments
      SET title = ?, description = ?, due_date = ?, max_score = ?, assignment_type = ?, auto_grade = ?
      WHERE id = ?
    `).run(updatedTitle, updatedDesc, updatedDueDate, updatedMaxScore, updatedType, updatedAutoGrade, id);

    // Ghi audit log
    logAction(db, {
      userId: user.id,
      action: 'ASSIGNMENT_UPDATED',
      targetType: 'assignment',
      targetId: id,
      details: { title: updatedTitle },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    // Trả về bài tập đã cập nhật
    const updated = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code
      FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `).get(id);

    res.json({
      success: true,
      message: 'Cập nhật bài tập thành công',
      data: updated
    });

  } catch (err) {
    console.error('[ASSIGNMENT] Update error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi cập nhật bài tập',
      code: 'ASSIGNMENT_UPDATE_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// DELETE /api/assignments/:id
// Xóa bài tập (chỉ admin)
// ══════════════════════════════════════════════
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    // Kiểm tra bài tập tồn tại
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Bài tập không tồn tại',
        code: 'ASSIGNMENT_NOT_FOUND'
      });
    }

    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);

    // Ghi audit log
    logAction(db, {
      userId: req.user.id,
      action: 'ASSIGNMENT_DELETED',
      targetType: 'assignment',
      targetId: id,
      details: { title: assignment.title, courseId: assignment.course_id },
      ipAddress: req.ip,
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: `Đã xóa bài tập: ${assignment.title}`,
      data: { id, title: assignment.title }
    });

  } catch (err) {
    console.error('[ASSIGNMENT] Delete error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi xóa bài tập',
      code: 'ASSIGNMENT_DELETE_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// POST /api/assignments/:id/submit
// Sinh viên nộp bài
// Requires: student
// Body: { content }
// ══════════════════════════════════════════════
router.post('/:id/submit', authenticateToken, requireRole('student'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const assignmentId = req.params.id;
    const { content } = req.body;

    // Kiểm tra bài tập tồn tại
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Bài tập không tồn tại',
        code: 'ASSIGNMENT_NOT_FOUND'
      });
    }

    // Kiểm tra sinh viên đã đăng ký khóa học chưa
    const enrollment = db.prepare(
      'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(user.id, assignment.course_id);
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        error: 'Bạn chưa đăng ký khóa học này',
        code: 'SUBMISSION_NOT_ENROLLED'
      });
    }

    // Kiểm tra deadline
    const now = new Date();
    const dueDate = new Date(assignment.due_date);
    if (now > dueDate) {
      return res.status(403).json({
        success: false,
        error: 'Đã quá hạn nộp bài',
        code: 'SUBMISSION_OVERDUE'
      });
    }

    // Kiểm tra nội dung
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu nội dung bài nộp (content)',
        code: 'SUBMISSION_EMPTY'
      });
    }

    // Kiểm tra đã nộp chưa (cho phép nộp lại nếu chưa chấm)
    const existingSubmission = db.prepare(
      'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?'
    ).get(assignmentId, user.id);

    if (existingSubmission && existingSubmission.status === 'graded') {
      return res.status(409).json({
        success: false,
        error: 'Bài nộp đã được chấm điểm, không thể nộp lại',
        code: 'SUBMISSION_ALREADY_GRADED'
      });
    }

    let submissionId;
    let status = 'submitted';

    if (existingSubmission) {
      // Cập nhật bài nộp cũ
      submissionId = existingSubmission.id;
      db.prepare(`
        UPDATE submissions SET content = ?, submitted_at = CURRENT_TIMESTAMP, status = 'submitted'
        WHERE id = ?
      `).run(content, submissionId);
    } else {
      // Tạo bài nộp mới
      submissionId = `sub-${crypto.randomUUID().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO submissions (id, assignment_id, student_id, content, submitted_at, status)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'submitted')
      `).run(submissionId, assignmentId, user.id, content);
    }

    // Ghi audit log
    logAction(db, {
      userId: user.id,
      action: 'SUBMISSION_CREATED',
      targetType: 'submission',
      targetId: submissionId,
      details: { assignmentId, assignmentTitle: assignment.title },
      ipAddress: req.ip,
      riskLevel: 'low'
    });

    // Lấy submission vừa tạo/cập nhật
    const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId);

    let grade = null;

    // ── Auto-grade: nếu bài tập có auto_grade = 1 (kiểu test) ──
    if (assignment.auto_grade === 1) {
      // Tạo điểm ngẫu nhiên 60-100% của max_score
      const minScore = Math.round(assignment.max_score * 0.6 * 10) / 10;
      const maxScore = assignment.max_score;
      const randomScore = Math.round((minScore + Math.random() * (maxScore - minScore)) * 10) / 10;

      const gradeId = `grade-${crypto.randomUUID().slice(0, 8)}`;

      db.prepare(`
        INSERT INTO grades (id, submission_id, student_id, assignment_id, score, max_score, feedback, graded_by, graded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(gradeId, submissionId, user.id, assignmentId, randomScore, assignment.max_score,
        'Chấm tự động bởi hệ thống', 'system');

      // Cập nhật trạng thái submission thành graded
      db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").run(submissionId);

      grade = db.prepare('SELECT * FROM grades WHERE id = ?').get(gradeId);

      // Ghi audit log cho auto-grade
      logAction(db, {
        userId: 'system',
        action: 'AUTO_GRADED',
        targetType: 'grade',
        targetId: gradeId,
        details: { submissionId, score: randomScore, maxScore: assignment.max_score },
        ipAddress: req.ip,
        riskLevel: 'low'
      });
    }

    res.status(201).json({
      success: true,
      message: grade ? 'Nộp bài thành công - Đã chấm điểm tự động' : 'Nộp bài thành công',
      data: {
        submission,
        grade
      }
    });

  } catch (err) {
    console.error('[ASSIGNMENT] Submit error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi nộp bài',
      code: 'SUBMISSION_ERROR'
    });
  }
});

// ══════════════════════════════════════════════
// GET /api/assignments/:id/submissions
// Xem danh sách bài nộp của một bài tập
// Requires: teacher (của khóa) hoặc admin
// ══════════════════════════════════════════════
router.get('/:id/submissions', authenticateToken, requireRole('teacher', 'admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.user;
    const assignmentId = req.params.id;

    // Kiểm tra bài tập tồn tại
    const assignment = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code
      FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `).get(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Bài tập không tồn tại',
        code: 'ASSIGNMENT_NOT_FOUND'
      });
    }

    // Teacher chỉ xem submissions của khóa mình dạy
    if (user.role === 'teacher') {
      const enrollment = db.prepare(
        'SELECT user_id FROM enrollments WHERE user_id = ? AND course_id = ?'
      ).get(user.id, assignment.course_id);
      if (!enrollment) {
        return res.status(403).json({
          success: false,
          error: 'Bạn không dạy khóa học này',
          code: 'SUBMISSIONS_ACCESS_DENIED'
        });
      }
    }

    // Lấy tất cả submissions kèm thông tin student và grade
    const submissions = db.prepare(`
      SELECT s.*, 
             u.full_name as student_name, u.username as student_username,
             g.id as grade_id, g.score, g.max_score as grade_max_score, 
             g.feedback, g.graded_by, g.graded_at
      FROM submissions s
      JOIN users u ON s.student_id = u.id
      LEFT JOIN grades g ON g.submission_id = s.id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC
    `).all(assignmentId);

    res.json({
      success: true,
      data: {
        assignment,
        submissions,
        total: submissions.length,
        gradedCount: submissions.filter(s => s.score !== null).length,
        pendingCount: submissions.filter(s => s.score === null).length
      }
    });

  } catch (err) {
    console.error('[ASSIGNMENT] Submissions error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách bài nộp',
      code: 'SUBMISSIONS_LIST_ERROR'
    });
  }
});

module.exports = router;
