const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const siteRoutes = require('./site.routes');
const billRoutes = require('./bill.routes');
const analyticsRoutes = require('./analytics.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/sites', siteRoutes);
router.use('/bills', billRoutes);
router.use('/analytics', analyticsRoutes);

// API documentation route
router.get('/', (req, res) => {
  res.json({
    message: 'Nexus Solar Platform API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      sites: '/api/v1/sites',
      bills: '/api/v1/bills',
      analytics: '/api/v1/analytics',
    },
  });
});

module.exports = router;