const express            = require('express');
const { requireAuth }    = require('../utils/authMiddleware');
const { requirePremium } = require('../utils/requirePremium');
const {
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  findOrCreatePortfolio,
} = require('../controllers/portfolioController');
const {
  getAllocation,
  saveAllocation,
  updateBand,
} = require('../controllers/allocationController');

const router = express.Router();

// ── Portfolio CRUD ──────────────────────────────────────────────
router.get   ('/',                 requireAuth,              listPortfolios);
router.post  ('/',                 requireAuth,              createPortfolio);        // premium guard is inside controller
router.post  ('/find-or-create',   requireAuth,              findOrCreatePortfolio);
router.patch ('/:id',              requireAuth,              updatePortfolio);
router.delete('/:id',              requireAuth,              deletePortfolio);

// ── Allocation (scoped to a portfolio) ─────────────────────────
router.get  ('/:portfolioId/allocation',      requireAuth,              getAllocation);
router.put  ('/:portfolioId/allocation',      requireAuth, requirePremium, saveAllocation);
router.patch('/:portfolioId/allocation/band', requireAuth, requirePremium, updateBand);

module.exports = router;