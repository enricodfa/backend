const express              = require('express');
const { requireAuth }      = require('../utils/authMiddleware');
const { requirePremium }   = require('../utils/requirePremium');
const { getAllocation, saveAllocation, updateBand } = require('../controllers/allocationController');

const router = express.Router();

router.get('/',       requireAuth, getAllocation);
router.put('/',       requireAuth, requirePremium, saveAllocation);
router.patch('/band', requireAuth, requirePremium, updateBand);

module.exports = router;
