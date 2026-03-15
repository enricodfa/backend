const express = require('express');
const { requireAuth } = require('../utils/authMiddleware');
const { getSummary } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/', requireAuth, getSummary);

module.exports = router;
