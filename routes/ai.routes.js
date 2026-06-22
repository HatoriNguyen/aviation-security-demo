/**
 * ============================================
 * ROUTES: AI Chat (SEC 6)
 * ============================================
 * Chat với AI trợ lý kiến thức
 * Có prompt injection detection
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { detectPromptInjection } = require('../middleware/prompt-guard');
const { detectImageMalware } = require('../middleware/image-guard');
const { processQuery } = require('../services/ai-service');
const multer = require('multer');

// Cấu hình Multer lưu vào memory để quét mã độc
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const router = express.Router();

/**
 * POST /api/ai/chat
 * Gửi câu hỏi cho AI
 * Requires: student, teacher, hoặc admin
 * Body: { message, courseId }
 * 
 * Flow: authenticateToken → detectPromptInjection → processQuery
 */
router.post('/chat',
  authenticateToken,
  requireRole('admin', 'teacher', 'student'),
  upload.single('image'),
  detectImageMalware,
  detectPromptInjection,
  (req, res) => {
    try {
      const db = req.app.locals.db;
      const { message, courseId } = req.body;

      // Validate courseId
      if (!courseId) {
        return res.status(400).json({
          success: false,
          error: 'Vui lòng chọn khóa học (courseId)',
          code: 'AI_MISSING_COURSE'
        });
      }

      // Xử lý query thông qua AI service
      const result = processQuery(db, {
        userId: req.user.id,
        courseId: courseId,
        question: message,
        threatAssessment: req.threatAssessment,
        ipAddress: req.ip,
        hasImage: !!req.file,
        fileName: req.file ? req.file.originalname : null
      });

      res.json({
        success: true,
        data: {
          answer: result.answer,
          sources: result.sources,
          courseName: result.courseName,
          documentsAvailable: result.documentsAvailable,
          securityStatus: result.securityStatus,
          threatAssessment: {
            status: req.threatAssessment.status,
            score: req.threatAssessment.score,
            message: req.threatAssessment.status === 'WARNING'
              ? '⚠️ Câu hỏi có dấu hiệu đáng ngờ nhưng vẫn được xử lý'
              : '✅ Câu hỏi an toàn'
          }
        }
      });

    } catch (err) {
      console.error('[AI] Chat error:', err.message);

      const statusCode = err.message.includes('không tồn tại') ? 404
        : err.message.includes('chưa đăng ký') ? 403
        : 500;

      res.status(statusCode).json({
        success: false,
        error: err.message,
        code: 'AI_QUERY_ERROR'
      });
    }
  }
);

/**
 * GET /api/ai/history
 * Lấy lịch sử chat của user hiện tại
 * Query params: courseId (optional), page, limit
 */
router.get('/history', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const { courseId, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 50);
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = ['ch.user_id = ?'];
    let params = [req.user.id];

    if (courseId) {
      whereConditions.push('ch.course_id = ?');
      params.push(courseId);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Đếm tổng
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM chat_history ch ${whereClause}
    `).get(...params);

    // Lấy dữ liệu
    const history = db.prepare(`
      SELECT 
        ch.id,
        ch.course_id,
        c.name as course_name,
        ch.question,
        ch.answer,
        ch.is_suspicious,
        ch.threat_type,
        ch.created_at
      FROM chat_history ch
      JOIN courses c ON ch.course_id = c.id
      ${whereClause}
      ORDER BY ch.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      success: true,
      data: {
        history: history,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (err) {
    console.error('[AI] History error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy lịch sử chat',
      code: 'AI_HISTORY_ERROR'
    });
  }
});

/**
 * GET /api/ai/threats
 * Lấy danh sách truy vấn đáng ngờ (chỉ admin)
 * Query params: page, limit
 */
router.get('/threats', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 50);
    const offset = (pageNum - 1) * limitNum;

    // Đếm tổng suspicious
    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM chat_history WHERE is_suspicious = 1
    `).get();

    // Lấy suspicious queries
    const threats = db.prepare(`
      SELECT 
        ch.id,
        ch.user_id,
        u.username,
        u.full_name,
        ch.course_id,
        c.name as course_name,
        ch.question,
        ch.answer,
        ch.threat_type,
        ch.created_at
      FROM chat_history ch
      JOIN users u ON ch.user_id = u.id
      JOIN courses c ON ch.course_id = c.id
      WHERE ch.is_suspicious = 1
      ORDER BY ch.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limitNum, offset);

    // Thống kê theo loại threat
    const threatStats = db.prepare(`
      SELECT threat_type, COUNT(*) as count
      FROM chat_history
      WHERE is_suspicious = 1 AND threat_type IS NOT NULL
      GROUP BY threat_type
      ORDER BY count DESC
    `).all();

    res.json({
      success: true,
      data: {
        threats: threats,
        stats: threatStats,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (err) {
    console.error('[AI] Threats error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy danh sách đe dọa',
      code: 'AI_THREATS_ERROR'
    });
  }
});

module.exports = router;
