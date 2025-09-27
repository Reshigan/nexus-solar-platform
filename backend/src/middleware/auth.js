const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware
 */
const authenticate = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication token is required',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user to request
    req.user = decoded;
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TokenExpired',
        message: 'Your session has expired. Please log in again.',
      });
    }
    
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid authentication token',
    });
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }

    next();
  };
};

/**
 * Tenant access middleware
 */
const tenantAccess = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Super admin can access all tenants
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user has access to the requested tenant
    const requestedTenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;
    
    if (!requestedTenantId) {
      return next();
    }

    if (req.user.tenantId !== requestedTenantId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to this tenant',
      });
    }

    next();
  } catch (error) {
    logger.error(`Tenant access error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'An error occurred while checking tenant access',
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  tenantAccess,
};