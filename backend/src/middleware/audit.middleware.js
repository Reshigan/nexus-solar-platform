const { createLogger } = require('../utils/logger');
const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const logger = createLogger('audit-middleware');

/**
 * Middleware for auditing API requests
 * @param {Object} options - Audit options
 * @returns {Function} Express middleware
 */
const auditMiddleware = (options = {}) => {
  const {
    excludePaths = ['/api/v1/health', '/api/v1/metrics'],
    excludeMethods = ['GET', 'HEAD', 'OPTIONS'],
    sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'credit_card'],
    logRequestBody = true,
    logResponseBody = false,
    batchAuditInterval = 1000, // 1 second
  } = options;
  
  // Queue for batch processing
  let auditQueue = [];
  let processingTimer = null;
  
  // Process audit queue in batches
  const processAuditQueue = async () => {
    if (auditQueue.length === 0) {
      return;
    }
    
    const batchToProcess = [...auditQueue];
    auditQueue = [];
    
    try {
      // Use a transaction for batch insert
      await db.transaction(async trx => {
        // Prepare batch insert data
        const insertData = batchToProcess.map(audit => ({
          id: audit.id,
          user_id: audit.user_id,
          tenant_id: audit.tenant_id,
          action: audit.action,
          resource_type: audit.resource_type,
          resource_id: audit.resource_id,
          request_method: audit.request_method,
          request_path: audit.request_path,
          request_params: audit.request_params ? JSON.stringify(audit.request_params) : null,
          request_body: audit.request_body ? JSON.stringify(audit.request_body) : null,
          response_status: audit.response_status,
          response_body: audit.response_body ? JSON.stringify(audit.response_body) : null,
          ip_address: audit.ip_address,
          user_agent: audit.user_agent,
          created_at: audit.created_at
        }));
        
        // Batch insert
        await trx('audit_logs').insert(insertData);
      });
      
      logger.debug(`Processed ${batchToProcess.length} audit log entries`);
    } catch (error) {
      logger.error(`Error processing audit logs: ${error.message}`);
      
      // If batch insert fails, try individual inserts to avoid losing all logs
      for (const audit of batchToProcess) {
        try {
          await db('audit_logs').insert({
            id: audit.id,
            user_id: audit.user_id,
            tenant_id: audit.tenant_id,
            action: audit.action,
            resource_type: audit.resource_type,
            resource_id: audit.resource_id,
            request_method: audit.request_method,
            request_path: audit.request_path,
            request_params: audit.request_params ? JSON.stringify(audit.request_params) : null,
            request_body: audit.request_body ? JSON.stringify(audit.request_body) : null,
            response_status: audit.response_status,
            response_body: audit.response_body ? JSON.stringify(audit.response_body) : null,
            ip_address: audit.ip_address,
            user_agent: audit.user_agent,
            created_at: audit.created_at
          });
        } catch (insertError) {
          logger.error(`Error inserting individual audit log: ${insertError.message}`);
        }
      }
    }
  };
  
  // Start the batch processing timer
  const startProcessingTimer = () => {
    if (processingTimer === null) {
      processingTimer = setInterval(async () => {
        await processAuditQueue();
      }, batchAuditInterval);
      
      // Ensure the timer doesn't prevent the process from exiting
      processingTimer.unref();
    }
  };
  
  // Add audit log to queue
  const queueAuditLog = (auditData) => {
    auditQueue.push(auditData);
    startProcessingTimer();
  };
  
  // Sanitize sensitive data
  const sanitizeData = (data) => {
    if (!data) return data;
    
    if (typeof data === 'object' && data !== null) {
      const sanitized = Array.isArray(data) ? [...data] : { ...data };
      
      for (const key in sanitized) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          sanitized[key] = '***REDACTED***';
        } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
          sanitized[key] = sanitizeData(sanitized[key]);
        }
      }
      
      return sanitized;
    }
    
    return data;
  };
  
  // Extract resource type and ID from request
  const extractResourceInfo = (req) => {
    const path = req.path;
    const pathParts = path.split('/').filter(Boolean);
    
    // Skip 'api' and version (e.g., 'v1')
    const relevantParts = pathParts.slice(2);
    
    if (relevantParts.length === 0) {
      return { resourceType: null, resourceId: null };
    }
    
    // Handle collection endpoints (e.g., /api/v1/users)
    if (relevantParts.length === 1) {
      return { resourceType: relevantParts[0], resourceId: null };
    }
    
    // Handle resource endpoints (e.g., /api/v1/users/123)
    if (relevantParts.length >= 2) {
      const resourceType = relevantParts[0];
      const resourceId = relevantParts[1];
      
      // Check if resourceId is a valid ID (not a sub-resource)
      if (resourceId.match(/^[a-f0-9-]+$/i) || resourceId.match(/^\d+$/)) {
        return { resourceType, resourceId };
      } else {
        return { resourceType, resourceId: null };
      }
    }
    
    return { resourceType: null, resourceId: null };
  };
  
  // Determine action based on HTTP method and path
  const determineAction = (req) => {
    const method = req.method;
    const path = req.path;
    
    // Handle batch operations
    if (path.includes('/batch') || path.includes('/bulk')) {
      return 'BATCH_OPERATION';
    }
    
    // Handle specific actions
    if (path.includes('/activate')) return 'ACTIVATE';
    if (path.includes('/deactivate')) return 'DEACTIVATE';
    if (path.includes('/approve')) return 'APPROVE';
    if (path.includes('/reject')) return 'REJECT';
    if (path.includes('/archive')) return 'ARCHIVE';
    if (path.includes('/restore')) return 'RESTORE';
    if (path.includes('/import')) return 'IMPORT';
    if (path.includes('/export')) return 'EXPORT';
    
    // Default actions based on HTTP method
    switch (method) {
      case 'GET':
        return path.endsWith('/') || !path.split('/').pop().match(/^[a-f0-9-]+$/i) ? 'LIST' : 'VIEW';
      case 'POST':
        return 'CREATE';
      case 'PUT':
        return 'UPDATE';
      case 'PATCH':
        return 'PARTIAL_UPDATE';
      case 'DELETE':
        return 'DELETE';
      default:
        return 'UNKNOWN';
    }
  };
  
  // Process batch operations for audit logging
  const processBatchOperations = (req, action) => {
    if (action !== 'BATCH_OPERATION' || !req.body || !Array.isArray(req.body.operations)) {
      return [];
    }
    
    return req.body.operations.map(operation => {
      const { method, path, body } = operation;
      const { resourceType, resourceId } = extractResourceInfo({ path });
      
      return {
        id: uuidv4(),
        user_id: req.user?.id,
        tenant_id: req.user?.tenant_id,
        action: determineAction({ method, path }),
        resource_type: resourceType,
        resource_id: resourceId,
        request_method: method,
        request_path: path,
        request_params: req.query,
        request_body: logRequestBody ? sanitizeData(body) : null,
        response_status: null, // Will be updated after response
        response_body: null, // Will be updated after response
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        created_at: new Date()
      };
    });
  };
  
  // Middleware function
  return (req, res, next) => {
    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Skip excluded methods (unless it's a batch operation)
    const isBatchOperation = req.path.includes('/batch') || req.path.includes('/bulk');
    if (!isBatchOperation && excludeMethods.includes(req.method)) {
      return next();
    }
    
    // Generate audit ID
    const auditId = uuidv4();
    
    // Extract resource information
    const { resourceType, resourceId } = extractResourceInfo(req);
    
    // Determine action
    const action = determineAction(req);
    
    // Create base audit log
    const auditLog = {
      id: auditId,
      user_id: req.user?.id,
      tenant_id: req.user?.tenant_id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      request_method: req.method,
      request_path: req.path,
      request_params: req.query,
      request_body: logRequestBody ? sanitizeData(req.body) : null,
      response_status: null, // Will be updated after response
      response_body: null, // Will be updated after response
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      created_at: new Date()
    };
    
    // Process batch operations if applicable
    const batchAuditLogs = processBatchOperations(req, action);
    
    // Capture the original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    // Override response methods to capture response data
    res.send = function(body) {
      res.send = originalSend;
      
      // Update audit log with response data
      auditLog.response_status = res.statusCode;
      
      if (logResponseBody && body) {
        try {
          const responseBody = typeof body === 'string' ? JSON.parse(body) : body;
          auditLog.response_body = sanitizeData(responseBody);
        } catch (error) {
          auditLog.response_body = { message: 'Response body could not be parsed' };
        }
      }
      
      // Queue the audit log
      queueAuditLog(auditLog);
      
      // Queue batch audit logs if applicable
      if (batchAuditLogs.length > 0) {
        batchAuditLogs.forEach(batchLog => {
          batchLog.response_status = res.statusCode;
          queueAuditLog(batchLog);
        });
      }
      
      return originalSend.apply(res, arguments);
    };
    
    res.json = function(body) {
      res.json = originalJson;
      
      // Update audit log with response data
      auditLog.response_status = res.statusCode;
      
      if (logResponseBody && body) {
        auditLog.response_body = sanitizeData(body);
      }
      
      // Queue the audit log
      queueAuditLog(auditLog);
      
      // Queue batch audit logs if applicable
      if (batchAuditLogs.length > 0) {
        batchAuditLogs.forEach(batchLog => {
          batchLog.response_status = res.statusCode;
          queueAuditLog(batchLog);
        });
      }
      
      return originalJson.apply(res, arguments);
    };
    
    res.end = function(chunk) {
      res.end = originalEnd;
      
      // If no response was sent via send or json, log the end
      if (auditLog.response_status === null) {
        auditLog.response_status = res.statusCode;
        
        // Queue the audit log
        queueAuditLog(auditLog);
        
        // Queue batch audit logs if applicable
        if (batchAuditLogs.length > 0) {
          batchAuditLogs.forEach(batchLog => {
            batchLog.response_status = res.statusCode;
            queueAuditLog(batchLog);
          });
        }
      }
      
      return originalEnd.apply(res, arguments);
    };
    
    next();
  };
};

// Direct audit logging function for programmatic use
const logAudit = async (auditData) => {
  try {
    const {
      user_id,
      tenant_id,
      action,
      resource_type,
      resource_id,
      details,
      ip_address,
      user_agent
    } = auditData;
    
    await db('audit_logs').insert({
      id: uuidv4(),
      user_id,
      tenant_id,
      action,
      resource_type,
      resource_type,
      resource_id,
      request_method: 'PROGRAMMATIC',
      request_path: null,
      request_params: null,
      request_body: details ? JSON.stringify(details) : null,
      response_status: 200,
      response_body: null,
      ip_address,
      user_agent,
      created_at: new Date()
    });
    
    logger.debug(`Logged programmatic audit: ${action} on ${resource_type}/${resource_id}`);
    return true;
  } catch (error) {
    logger.error(`Error logging programmatic audit: ${error.message}`);
    return false;
  }
};

// Batch audit logging function for bulk operations
const logAuditBatch = async (auditDataArray) => {
  if (!Array.isArray(auditDataArray) || auditDataArray.length === 0) {
    return false;
  }
  
  try {
    // Use a transaction for batch insert
    await db.transaction(async trx => {
      // Prepare batch insert data
      const insertData = auditDataArray.map(auditData => {
        const {
          user_id,
          tenant_id,
          action,
          resource_type,
          resource_id,
          details,
          ip_address,
          user_agent
        } = auditData;
        
        return {
          id: uuidv4(),
          user_id,
          tenant_id,
          action,
          resource_type,
          resource_id,
          request_method: 'PROGRAMMATIC_BATCH',
          request_path: null,
          request_params: null,
          request_body: details ? JSON.stringify(details) : null,
          response_status: 200,
          response_body: null,
          ip_address,
          user_agent,
          created_at: new Date()
        };
      });
      
      // Batch insert
      await trx('audit_logs').insert(insertData);
    });
    
    logger.debug(`Logged batch audit: ${auditDataArray.length} entries`);
    return true;
  } catch (error) {
    logger.error(`Error logging batch audit: ${error.message}`);
    
    // If batch insert fails, try individual inserts to avoid losing all logs
    let successCount = 0;
    
    for (const auditData of auditDataArray) {
      try {
        const {
          user_id,
          tenant_id,
          action,
          resource_type,
          resource_id,
          details,
          ip_address,
          user_agent
        } = auditData;
        
        await db('audit_logs').insert({
          id: uuidv4(),
          user_id,
          tenant_id,
          action,
          resource_type,
          resource_id,
          request_method: 'PROGRAMMATIC_BATCH',
          request_path: null,
          request_params: null,
          request_body: details ? JSON.stringify(details) : null,
          response_status: 200,
          response_body: null,
          ip_address,
          user_agent,
          created_at: new Date()
        });
        
        successCount++;
      } catch (insertError) {
        logger.error(`Error inserting individual audit log: ${insertError.message}`);
      }
    }
    
    logger.debug(`Logged ${successCount}/${auditDataArray.length} batch audit entries after batch failure`);
    return successCount > 0;
  }
};

module.exports = {
  auditMiddleware,
  logAudit,
  logAuditBatch
};