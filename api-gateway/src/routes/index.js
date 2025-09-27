const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Service endpoints
const BACKEND_SERVICE = process.env.BACKEND_SERVICE || 'http://localhost:4000';
const AI_SERVICE = process.env.AI_SERVICE || 'http://localhost:5000';
const BLOCKCHAIN_SERVICE = process.env.BLOCKCHAIN_SERVICE || 'http://localhost:6000';
const EDGE_SERVICE = process.env.EDGE_SERVICE || 'http://localhost:7000';

// Log proxy requests
const logProxyRequest = (proxyReq, req, res) => {
  logger.info(`Proxying request: ${req.method} ${req.path} -> ${proxyReq.path}`);
};

// Backend service proxy
const backendProxy = createProxyMiddleware({
  target: BACKEND_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/auth': '/api/v1/auth',
    '^/api/v1/users': '/api/v1/users',
    '^/api/v1/sites': '/api/v1/sites',
    '^/api/v1/bills': '/api/v1/bills',
  },
  onProxyReq: logProxyRequest,
});

// AI service proxy
const aiProxy = createProxyMiddleware({
  target: AI_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/analytics': '/api/v1/analytics',
    '^/api/v1/forecasts': '/api/v1/forecasts',
    '^/api/v1/chatbot': '/api/v1/chatbot',
  },
  onProxyReq: logProxyRequest,
});

// Blockchain service proxy
const blockchainProxy = createProxyMiddleware({
  target: BLOCKCHAIN_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/trading': '/api/v1/trading',
    '^/api/v1/contracts': '/api/v1/contracts',
  },
  onProxyReq: logProxyRequest,
});

// Edge service proxy
const edgeProxy = createProxyMiddleware({
  target: EDGE_SERVICE,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/edge': '/api/v1/edge',
    '^/api/v1/devices': '/api/v1/devices',
  },
  onProxyReq: logProxyRequest,
});

// Public routes (no authentication required)
router.use('/auth', backendProxy);

// Protected routes (authentication required)
router.use('/users', authenticate, backendProxy);
router.use('/sites', authenticate, backendProxy);
router.use('/bills', authenticate, backendProxy);
router.use('/analytics', authenticate, aiProxy);
router.use('/forecasts', authenticate, aiProxy);
router.use('/chatbot', authenticate, aiProxy);
router.use('/trading', authenticate, blockchainProxy);
router.use('/contracts', authenticate, blockchainProxy);
router.use('/edge', authenticate, edgeProxy);
router.use('/devices', authenticate, edgeProxy);

// API documentation route
router.get('/', (req, res) => {
  res.json({
    message: 'Nexus Solar Platform API Gateway',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      sites: '/api/v1/sites',
      bills: '/api/v1/bills',
      analytics: '/api/v1/analytics',
      forecasts: '/api/v1/forecasts',
      chatbot: '/api/v1/chatbot',
      trading: '/api/v1/trading',
      contracts: '/api/v1/contracts',
      edge: '/api/v1/edge',
      devices: '/api/v1/devices',
    },
  });
});

module.exports = router;