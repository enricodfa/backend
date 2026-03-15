const express = require('express');
const { requireAuth } = require('../utils/authMiddleware');
const {
  getStatus,
  activatePlan,
  cancelPlan,
  createPixCheckout,
  createCardCheckout,
  handleWebhook,
} = require('../controllers/plansController');

const router = express.Router();

router.get('/status',          requireAuth, getStatus);
router.post('/activate',       requireAuth, activatePlan);
router.post('/cancel',         requireAuth, cancelPlan);
router.post('/checkout/pix',   requireAuth, createPixCheckout);
router.post('/checkout/card',  requireAuth, createCardCheckout);

// Sem requireAuth — chamado diretamente pelo Mercado Pago
router.post('/webhook',        handleWebhook);

module.exports = router;
