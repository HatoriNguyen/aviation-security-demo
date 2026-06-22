/**
 * ============================================
 * ROUTES: Audit Logs
 * ============================================
 * Quản lý nhật ký kiểm toán (chỉ admin)
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { getAuditLogs, getAuditStats } = require('../services/audit-service');

const router = express.Router();

/**
 * GET /api/audit/logs
 * Lấy audit logs với phân trang và lọc
 * Requires: admin
 * Query params: page, limit, userId, action, riskLevel, startDate, endDate
 */
router.get('/logs', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const { page, limit, userId, action, riskLevel, startDate, endDate } = req.query;

    const result = getAuditLogs(db, {
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      userId: userId,
      action: action,
      riskLevel: riskLevel,
      startDate: startDate,
      endDate: endDate
    });

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error('[AUDIT] Logs error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy audit logs',
      code: 'AUDIT_LOGS_ERROR'
    });
  }
});

/**
 * GET /api/audit/stats
 * Lấy thống kê audit
 * Requires: admin
 */
router.get('/stats', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const db = req.app.locals.db;
    const stats = getAuditStats(db);

    res.json({
      success: true,
      data: stats
    });

  } catch (err) {
    console.error('[AUDIT] Stats error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy thống kê audit',
      code: 'AUDIT_STATS_ERROR'
    });
  }
});

module.exports = router;
