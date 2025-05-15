const express = require('express');
const router = express.Router();
const { generateFlowchart } = require('../controllers/flowchartController');

router.post('/generateFlowchart', generateFlowchart);

module.exports = router; 