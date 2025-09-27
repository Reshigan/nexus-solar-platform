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
    
    // Add user info to headers for downstream services
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-tenant-id'] = decoded.tenantId;
    
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
 * Rate limiting middleware based on user role
 */
const roleBasedRateLimit = (req, res, next) => {
  // Get user role from request
  const userRole = req.user?.role || 'anonymous';
  
  // Define rate limits based on user role
  const rateLimits = {
    super_admin: 1000,
    admin: 500,
    user: 200,
    anonymous: 50,
  };
  
  // Get rate limit for user role
  const limit = rateLimits[userRole] || rateLimits.anonymous;
  
  // Add rate limit info to response headers
  res.setHeader('X-Rate-Limit-Limit', limit);
  
  // Continue to next middleware
  next();
};

module.exports = {
  authenticate,
  roleBasedRateLimit,
};