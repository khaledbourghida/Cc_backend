const express = require('express');
const router = express.Router();
const {getFunc, getCode, runCode , runFormat} = require('../controllers/authController');

router.get('/functions/:type', getFunc);
router.get('/functions/:type/:funcName', getCode);
router.post('/run', runCode);
router.post('/format' , runFormat);


module.exports = router;