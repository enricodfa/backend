const express = require('express');
const { requireAuth } = require('../utils/authMiddleware');
const { listOperations, createOperation, updateOperation, deleteOperation } = require('../controllers/operationsController');

const router = express.Router();

router.get('/',    requireAuth, listOperations);
router.post('/',   requireAuth, createOperation);
router.patch('/:id', requireAuth, updateOperation);
router.delete('/:id', requireAuth, deleteOperation);

module.exports = router;
