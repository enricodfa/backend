const express              = require('express');
const { requireAuth }      = require('../utils/authMiddleware');
const { requirePremium }   = require('../utils/requirePremium');
const { getLatestAnalysis, getAnalysis } = require('../controllers/analysisController');

const router = express.Router();

router.get('/',             requireAuth, requirePremium, getLatestAnalysis);
router.get('/:portfolioId', requireAuth, requirePremium, getAnalysis);

module.exports = router;
