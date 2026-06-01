const express = require('express');
const Client = require('../models/Client');
const WeeklyPayment = require('../models/WeeklyPayment');
const { auth } = require('../middleware/auth');
const { getWeekStart, getDueDate, getDaysUntil, getPaymentSchedule } = require('../utils/week');

const router = express.Router();
const MAX_PHOTO_BYTES = 400_000;
const MAX_SCREENSHOT_BYTES = 1_200_000;
const UPI_ID = '9346697486@ptsbi';
const UPI_NAME = 'Lakshmi Ganapati Finance';
const PAYMENT_NOTE = 'Weekly Payment';

function isJpgOrPngDataUrl(image) {
  return /^data:image\/(jpeg|jpg|png);base64,/i.test(image);
}

function buildUpiLink(amount) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_NAME,
    am: Number(amount || 0).toFixed(2),
    cu: 'INR',
    tn: PAYMENT_NOTE,
  });
  return `upi://pay?${params.toString()}`;
}

function nextWeekStart(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7);
  return d;
}

function paymentPriority(payment) {
  if (payment.paid) return 5;
  if (payment.paymentStatus === 'approved') return 4;
  if (payment.paymentStatus === 'submitted') return 3;
  if (payment.paymentStatus === 'pending') return 2;
  if (payment.paymentStatus === 'rejected') return 1;
  return 0;
}

function pickBestPayment(current, candidate) {
  if (!current) return candidate;
  const currentPriority = paymentPriority(current);
  const candidatePriority = paymentPriority(candidate);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }
  return new Date(candidate.updatedAt || candidate.createdAt || candidate.weekStart) >
    new Date(current.updatedAt || current.createdAt || current.weekStart)
    ? candidate
    : current;
}

function consolidateWeeklyPayments(payments) {
  const byWeek = new Map();
  payments.forEach((payment) => {
    const weekStart = getWeekStart(payment.weekStart);
    const key = weekStart.toISOString().slice(0, 10);
    byWeek.set(key, pickBestPayment(byWeek.get(key), payment));
  });
  return [...byWeek.values()].sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
}

async function ensureCurrentWeekPayment(client) {
  const weekStart = getWeekStart();
  const schedule = getPaymentSchedule(client.dateTaken, weekStart);
  if (!schedule.isActiveWeek) {
    return { weekStart, payment: null, schedule };
  }

  const weekEnd = nextWeekStart(weekStart);
  const currentWeekPayments = await WeeklyPayment.find({
    client: client._id,
    weekStart: { $gte: weekStart, $lt: weekEnd },
  }).sort({ paid: -1, updatedAt: -1, createdAt: -1 });

  let payment = consolidateWeeklyPayments(currentWeekPayments)[0];
  if (!payment) {
    payment = await WeeklyPayment.create({
        client: client._id,
        weekStart,
        amount: client.weeklyPayment,
        paid: false,
    });
  } else if (!payment.paid && Number(payment.amount) !== Number(client.weeklyPayment)) {
    payment.amount = client.weeklyPayment;
    await payment.save();
  }
  return { weekStart, payment, schedule };
}

router.get('/profile', auth('customer'), async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const { weekStart, payment: currentWeek, schedule } = await ensureCurrentWeekPayment(client);

    const dueDate = getDueDate(currentWeek?.weekStart || schedule.firstPaymentWeekStart || weekStart);
    const daysUntilDue = getDaysUntil(dueDate);
    const interestAmount = (client.amountTaken * client.interestRate) / 100;

    res.json({
      name: client.name,
      place: client.place,
      phone: client.phone,
      profilePhoto: client.profilePhoto || '',
      dateTaken: client.dateTaken,
      amountTaken: client.amountTaken,
      interestRate: client.interestRate,
      interestAmount,
      weeklyPayment: client.weeklyPayment,
      renewalHistory: (client.renewalHistory || []).slice(-10).reverse(),
      paymentSchedule: schedule,
      currentWeekPaid: schedule.isAfterSchedule ? true : currentWeek?.paid ?? false,
      currentWeekPaymentStatus: currentWeek?.paymentStatus || 'pending',
      currentWeekScreenshot: currentWeek?.screenshot || '',
      currentWeekStart: weekStart,
      currentWeekPaymentId: currentWeek?._id,
      currentWeekReminderSent: currentWeek?.reminderSent ?? false,
      currentWeekReminderMessage: currentWeek?.reminderMessage || '',
      dueDate,
      daysUntilDue,
      isOverdue: Boolean(currentWeek && !currentWeek.paid && daysUntilDue < 0),
      upiPayment: {
        upiId: UPI_ID,
        payeeName: UPI_NAME,
        note: PAYMENT_NOTE,
        amount: currentWeek?.amount || client.weeklyPayment,
        link: buildUpiLink(currentWeek?.amount || client.weeklyPayment),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/profile/photo', auth('customer'), async (req, res) => {
  try {
    const { photo } = req.body;
    if (!photo || typeof photo !== 'string') {
      return res.status(400).json({ message: 'Photo is required' });
    }
    if (!photo.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Please upload a valid image (JPEG or PNG)' });
    }
    if (Buffer.byteLength(photo, 'utf8') > MAX_PHOTO_BYTES) {
      return res.status(400).json({ message: 'Image is too large. Use a photo under 300 KB.' });
    }

    const client = await Client.findByIdAndUpdate(
      req.user.id,
      { profilePhoto: photo },
      { new: true }
    ).select('-password');

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.json({ profilePhoto: client.profilePhoto });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/profile/photo', auth('customer'), async (req, res) => {
  try {
    await Client.findByIdAndUpdate(req.user.id, { profilePhoto: '' });
    res.json({ profilePhoto: '' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/payments', auth('customer'), async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    await ensureCurrentWeekPayment(client);

    const payments = await WeeklyPayment.find({ client: req.user.id })
      .sort({ weekStart: -1 })
      .limit(120);

    const enriched = consolidateWeeklyPayments(payments).slice(0, 52).map((p) => {
      const due = getDueDate(p.weekStart);
      return {
        ...p.toObject(),
        weekStart: getWeekStart(p.weekStart),
        dueDate: due,
        daysUntilDue: p.paid ? null : getDaysUntil(due),
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/payments/:paymentId/screenshot', auth('customer'), async (req, res) => {
  try {
    const { screenshot } = req.body;
    if (!screenshot || typeof screenshot !== 'string' || !isJpgOrPngDataUrl(screenshot)) {
      return res.status(400).json({ message: 'Please upload a JPG or PNG screenshot.' });
    }
    if (Buffer.byteLength(screenshot, 'utf8') > MAX_SCREENSHOT_BYTES) {
      return res.status(400).json({ message: 'Screenshot is too large. Use an image under 1 MB.' });
    }

    const payment = await WeeklyPayment.findOne({
      _id: req.params.paymentId,
      client: req.user.id,
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }
    if (payment.paid) {
      return res.status(400).json({ message: 'This payment is already approved.' });
    }

    payment.screenshot = screenshot;
    payment.screenshotUploadedAt = new Date();
    payment.paymentStatus = 'submitted';
    payment.rejectedAt = undefined;
    payment.managerNote = '';
    await payment.save();

    res.json({
      _id: payment._id,
      paymentStatus: payment.paymentStatus,
      screenshotUploadedAt: payment.screenshotUploadedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/reminders', auth('customer'), async (req, res) => {
  try {
    const client = await Client.findById(req.user.id).select('-password');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const weekStart = getWeekStart();
    const schedule = getPaymentSchedule(client.dateTaken, weekStart);
    const dueDate = getDueDate(schedule.isBeforeStart ? schedule.firstPaymentWeekStart : weekStart);
    const daysUntilDue = getDaysUntil(dueDate);

    const currentWeekPayments = schedule.isActiveWeek ? await WeeklyPayment.find({
      client: req.user.id,
      weekStart: { $gte: weekStart, $lt: nextWeekStart(weekStart) },
    }) : [];
    const currentWeek = consolidateWeeklyPayments(currentWeekPayments)[0];

    const allPayments = await WeeklyPayment.find({ client: req.user.id })
      .sort({ weekStart: -1 })
      .limit(120);
    const pendingPayments = consolidateWeeklyPayments(allPayments)
      .filter((payment) => !payment.paid)
      .slice(0, 12);

    const reminders = pendingPayments.map((p) => ({
      _id: p._id,
      weekStart: getWeekStart(p.weekStart),
      amount: p.amount,
      dueDate: getDueDate(p.weekStart),
      daysUntilDue: getDaysUntil(getDueDate(p.weekStart)),
      reminderSent: p.reminderSent,
      reminderMessage: p.reminderMessage || '',
      isCurrentWeek: getWeekStart(p.weekStart).getTime() === weekStart.getTime(),
    }));

    res.json({
      nextDueDate: dueDate,
      daysUntilDue,
      paymentSchedule: schedule,
      currentWeekPaid: schedule.isAfterSchedule ? true : currentWeek?.paid ?? false,
      weeklyAmount: currentWeek?.amount,
      reminders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
