const express = require('express');
const router = express.Router();
const {getFunc, getCode, runCode} = require('../controllers/authController');

router.get('/functions/:type', getFunc);
router.get('/functions/:type/:funcName', getCode);
router.post('/run', runCode);

module.exports = router;