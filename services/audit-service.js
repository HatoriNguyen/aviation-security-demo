/**
 * ============================================
 * SERVICE: Audit Logging
 * ============================================
 * Ghi nhật ký kiểm toán cho tất cả hoạt động quan trọng
 * Hỗ trợ truy vấn, lọc, và thống kê
 */

/**
 * Ghi một bản ghi audit log
 * @param {Database} db - Instance better-sqlite3
 * @param {Object} params - Thông tin audit
 * @param {string} params.userId - ID người dùng thực hiện
 * @param {string} params.action - Hành động (VD: FILE_UPLOAD, LOGIN, PROMPT_INJECTION)
 * @param {string} params.targetType - Loại đối tượng (user, document, course, ai_chat)
 * @param {string} params.targetId - ID đối tượng bị tác động
 * @param {string} params.details - Chi tiết bổ sung (JSON string hoặc text)
 * @param {string} params.ipAddress - Địa chỉ IP
 * @param {string} params.riskLevel - Mức rủi ro (low, medium, high, critical)
 */
function logAction(db, { userId, action, targetType, targetId, details, ipAddress, riskLevel = 'low' }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, risk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Nếu details là object, chuyển thành JSON string
    const detailStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');

    stmt.run(
      userId || 'system',
      action,
      targetType || null,
      targetId || null,
      detailStr,
      ipAddress || 'unknown',
      riskLevel
    );
  } catch (err) {
    // Không throw lỗi audit log để không ảnh hưởng business logic
    console.error('[AUDIT] Lỗi khi ghi audit log:', err.message);
  }
}

/**
 * Truy vấn audit logs với phân trang và lọc
 * @param {Database} db - Instance better-sqlite3
 * @param {Object} filters - Bộ lọc
 * @param {number} filters.page - Trang hiện tại (mặc định 1)
 * @param {number} filters.limit - Số bản ghi mỗi trang (mặc định 20)
 * @param {string} filters.userId - Lọc theo user
 * @param {string} filters.action - Lọc theo hành động
 * @param {string} filters.riskLevel - Lọc theo mức rủi ro
 * @param {string} filters.startDate - Ngày bắt đầu (ISO format)
 * @param {string} filters.endDate - Ngày kết thúc (ISO format)
 * @returns {Object} {logs, pagination}
 */
function getAuditLogs(db, { page = 1, limit = 20, userId, action, riskLevel, startDate, endDate } = {}) {
  // Giới hạn limit hợp lý
  limit = Math.min(Math.max(1, limit), 100);
  page = Math.max(1, page);
  const offset = (page - 1) * limit;

  // Xây dựng câu query động với điều kiện lọc
  let whereConditions = [];
  let params = [];

  if (userId) {
    whereConditions.push('a.user_id = ?');
    params.push(userId);
  }

  if (action) {
    whereConditions.push('a.action LIKE ?');
    params.push(`%${action}%`);
  }

  if (riskLevel) {
    whereConditions.push('a.risk_level = ?');
    params.push(riskLevel);
  }

  if (startDate) {
    whereConditions.push('a.created_at >= ?');
    params.push(startDate);
  }

  if (endDate) {
    whereConditions.push('a.created_at <= ?');
    params.push(endDate);
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  // Đếm tổng bản ghi (cho phân trang)
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM audit_logs a ${whereClause}
  `);
  const { total } = countStmt.get(...params);

  // Lấy dữ liệu với phân trang
  const dataStmt = db.prepare(`
    SELECT 
      a.id,
      a.user_id,
      a.action,
      a.target_type,
      a.target_id,
      a.details,
      a.ip_address,
      a.risk_level,
      a.created_at,
      u.username,
      u.full_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const logs = dataStmt.all(...params, limit, offset);

  return {
    logs: logs,
    pagination: {
      page: page,
      limit: limit,
      total: total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
}

/**
 * Lấy thống kê audit logs
 * @param {Database} db - Instance better-sqlite3
 * @returns {Object} Thống kê theo risk level, action type, và timeline
 */
function getAuditStats(db) {
  // Thống kê theo mức rủi ro
  const byRiskLevel = db.prepare(`
    SELECT risk_level, COUNT(*) as count 
    FROM audit_logs 
    GROUP BY risk_level 
    ORDER BY 
      CASE risk_level 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END
  `).all();

  // Thống kê theo loại hành động
  const byAction = db.prepare(`
    SELECT action, COUNT(*) as count 
    FROM audit_logs 
    GROUP BY action 
    ORDER BY count DESC
    LIMIT 20
  `).all();

  // Thống kê 7 ngày gần đây
  const last7Days = db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as total,
      SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) as high_risk_count
    FROM audit_logs 
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `).all();

  // Tổng số bản ghi
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();

  // Top 5 user có nhiều hoạt động nhất
  const topUsers = db.prepare(`
    SELECT 
      a.user_id,
      u.username,
      u.full_name,
      COUNT(*) as action_count,
      SUM(CASE WHEN a.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) as high_risk_count
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.user_id != 'system'
    GROUP BY a.user_id
    ORDER BY action_count DESC
    LIMIT 5
  `).all();

  return {
    totalLogs: totalLogs.count,
    byRiskLevel: byRiskLevel,
    byAction: byAction,
    last7Days: last7Days,
    topUsers: topUsers
  };
}

module.exports = { logAction, getAuditLogs, getAuditStats };
