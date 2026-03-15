const express              = require('express');
const { requireAuth }      = require('../utils/authMiddleware');
const { requirePremium }   = require('../utils/requirePremium');
const { getAllocation, saveAllocation, updateBand } = require('../controllers/allocationController');

const router = express.Router();

router.get('/',       requireAuth, getAllocation);
router.put('/',       requirePremium, saveAllocation);
router.patch('/band', requirePremium, updateBand);

module.exports = router;
