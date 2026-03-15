const express = require('express');
const { requireAuth } = require('../utils/authMiddleware');
const { checkPlanAndRedirect, getMe } = require('../controllers/authController');

const router = express.Router();

// POST /auth/callback — verify token + decide redirect
router.post('/callback', requireAuth, checkPlanAndRedirect);

// GET /auth/me — return profile + subscription
router.get('/me', requireAuth, getMe);

module.exports = router;
