const express = require('express');
const Client = require('../models/Client');
const WeeklyPayment = require('../models/WeeklyPayment');
const { auth } = require('../middleware/auth');
const { getWeekStart } = require('../utils/week');

const router = express.Router();

router.get('/profile', auth('customer'), async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const weekStart = getWeekStart();
    const currentWeek = await WeeklyPayment.findOne({
      client: client._id,
      weekStart,
    });

    const interestAmount = (client.amountTaken * client.interestRate) / 100;

    res.json({
      name: client.name,
      place: client.place,
      dateTaken: client.dateTaken,
      amountTaken: client.amountTaken,
      interestRate: client.interestRate,
      interestAmount,
      weeklyPayment: client.weeklyPayment,
      currentWeekPaid: currentWeek?.paid ?? false,
      currentWeekStart: weekStart,
      currentWeekReminderSent: currentWeek?.reminderSent ?? false,
      currentWeekReminderMessage: currentWeek?.reminderMessage || '',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/payments', auth('customer'), async (req, res) => {
  try {
    const payments = await WeeklyPayment.find({ client: req.user.id })
      .sort({ weekStart: -1 })
      .limit(12);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
