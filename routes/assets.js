const express            = require('express');
const { requireAuth }    = require('../utils/authMiddleware');
const { searchAssets }   = require('../controllers/assetsController');

const router = express.Router();

router.get('/search', requireAuth, searchAssets);

module.exports = router;
