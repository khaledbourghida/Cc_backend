const express = require('express');
const router = express.Router();
const { analyzePerformance } = require('../controllers/performanceController');

// Performance analysis endpoint
router.post('/perfermence', analyzePerformance);

module.exports = router; 