const express = require('express');
const bcrypt = require('bcryptjs');
const Client = require('../models/Client');
const WeeklyPayment = require('../models/WeeklyPayment');
const CollectionEntry = require('../models/CollectionEntry');
const { auth } = require('../middleware/auth');
const { getWeekStart } = require('../utils/week');

const router = express.Router();

router.use(auth('manager'));

router.get('/clients', async (req, res) => {
  try {
    const clients = await Client.find().select('-password').sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/clients', async (req, res) => {
  try {
    const {
      name,
      place,
      phone,
      amountTaken,
      dateTaken,
      interestRate,
      weeklyPayment,
      username,
      password,
    } = req.body;

    if (!name || !place || !phone || !amountTaken || !dateTaken || !interestRate || !weeklyPayment || !username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existing = await Client.findOne({ username: username.trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const client = await Client.create({
      name,
      place,
      phone,
      amountTaken: Number(amountTaken),
      dateTaken: new Date(dateTaken),
      interestRate: Number(interestRate),
      weeklyPayment: Number(weeklyPayment),
      username: username.trim().toLowerCase(),
      password: hashed,
    });

    const weekStart = getWeekStart();
    await WeeklyPayment.create({
      client: client._id,
      weekStart,
      amount: client.weeklyPayment,
      paid: false,
    });

    const safe = client.toObject();
    delete safe.password;
    res.status(201).json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/weekly-status', async (req, res) => {
  try {
    const weekStart = getWeekStart();
    const clients = await Client.find().select('-password');

    const status = await Promise.all(
      clients.map(async (client) => {
        let payment = await WeeklyPayment.findOne({ client: client._id, weekStart });
        if (!payment) {
          payment = await WeeklyPayment.create({
            client: client._id,
            weekStart,
            amount: client.weeklyPayment,
            paid: false,
          });
        }
        return {
          clientId: client._id,
          name: client.name,
          place: client.place,
          phone: client.phone,
          weeklyPayment: client.weeklyPayment,
          weekStart: payment.weekStart,
          paid: payment.paid,
          paidAt: payment.paidAt,
          paymentId: payment._id,
          reminderSent: payment.reminderSent,
        };
      })
    );

    res.json({ weekStart, clients: status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/payments/:paymentId', async (req, res) => {
  try {
    const { paid } = req.body;
    const payment = await WeeklyPayment.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    payment.paid = Boolean(paid);
    payment.paidAt = paid ? new Date() : undefined;
    if (!paid) {
      payment.reminderSent = false;
      payment.reminderSentAt = undefined;
    }
    await payment.save();
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const entries = await CollectionEntry.find().sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/collections', async (req, res) => {
  try {
    const { name, collection, charges, payments, previousAmount, entryDate, note } = req.body;

    const entry = await CollectionEntry.create({
      name: name || '',
      collection: Number(collection) || 0,
      charges: Number(charges) || 0,
      payments: Number(payments) || 0,
      previousAmount: Number(previousAmount) || 0,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      note: note || '',
    });

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/collections/:id', async (req, res) => {
  try {
    const entry = await CollectionEntry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Collection record not found' });
    }

    const { name, collection, charges, payments, previousAmount, entryDate, note } = req.body;
    if (name !== undefined) entry.name = name;
    if (collection !== undefined) entry.collection = Number(collection) || 0;
    if (charges !== undefined) entry.charges = Number(charges) || 0;
    if (payments !== undefined) entry.payments = Number(payments) || 0;
    if (previousAmount !== undefined) entry.previousAmount = Number(previousAmount) || 0;
    if (entryDate !== undefined) entry.entryDate = new Date(entryDate);
    if (note !== undefined) entry.note = note;

    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/collections/:id', async (req, res) => {
  try {
    const entry = await CollectionEntry.findByIdAndDelete(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Collection record not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/send-reminder/:paymentId', async (req, res) => {
  try {
    const payment = await WeeklyPayment.findById(req.params.paymentId).populate('client');
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }
    if (payment.paid) {
      return res.status(400).json({ message: 'Payment already done for this week' });
    }

    const client = payment.client;
    const message = `Dear ${client.name}, your weekly payment of Rs.${client.weeklyPayment} is pending for the week starting ${payment.weekStart.toLocaleDateString('en-IN')}. Please pay at the earliest. - Lakshmi Ganapati`;

    payment.reminderSent = true;
    payment.reminderSentAt = new Date();
    payment.reminderMessage = message;
    await payment.save();

    res.json({
      success: true,
      message: 'Reminder sent successfully',
      smsPreview: message,
      phone: client.phone,
      note: 'Connect Twilio or SMS gateway in production to deliver real SMS.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
