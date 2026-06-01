const express = require('express');
const bcrypt = require('bcryptjs');
const Client = require('../models/Client');
const WeeklyPayment = require('../models/WeeklyPayment');
const CollectionEntry = require('../models/CollectionEntry');
const { auth } = require('../middleware/auth');
const { getWeekStart, getDueDate, getDaysUntil, getPaymentSchedule } = require('../utils/week');
const { buildReminderMessage } = require('../utils/reminder');
const { calcInterestAmount, calcTotalAmount } = require('../utils/finance');

const router = express.Router();

router.use(auth('manager'));

router.get('/clients', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    let query = {};
    if (q) {
      query = {
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { place: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } },
        ],
      };
    }
    const clients = await Client.find(query).select('-password').sort({ createdAt: -1 });
    const enriched = clients.map((c) => ({
      ...c.toObject(),
      interestAmount: calcInterestAmount(c.amountTaken, c.interestRate),
      totalAmount: calcTotalAmount(c.amountTaken, c.interestRate),
    }));
    res.json(enriched);
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
    const schedule = getPaymentSchedule(client.dateTaken, weekStart);
    if (schedule.isActiveWeek) {
      await WeeklyPayment.create({
        client: client._id,
        weekStart,
        amount: client.weeklyPayment,
        paid: false,
      });
    }

    const safe = client.toObject();
    delete safe.password;
    res.status(201).json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/clients/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

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

    if (name !== undefined) client.name = name;
    if (place !== undefined) client.place = place;
    if (phone !== undefined) client.phone = phone;
    if (amountTaken !== undefined) client.amountTaken = Number(amountTaken);
    if (dateTaken !== undefined) client.dateTaken = new Date(dateTaken);
    if (interestRate !== undefined) client.interestRate = Number(interestRate);
    if (weeklyPayment !== undefined) client.weeklyPayment = Number(weeklyPayment);
    if (username !== undefined) client.username = username.trim().toLowerCase();
    if (password) {
      client.password = await bcrypt.hash(password, 10);
    }

    await client.save();
    const safe = client.toObject();
    delete safe.password;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    await Client.findByIdAndDelete(req.params.id);
    await WeeklyPayment.deleteMany({ client: req.params.id });
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
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

function consolidatePayments(payments) {
  const byClientWeek = new Map();
  payments.forEach((payment) => {
    if (!payment.client) return;
    const clientId = String(payment.client._id || payment.client);
    const weekKey = getWeekStart(payment.weekStart).toISOString().slice(0, 10);
    const key = `${clientId}:${weekKey}`;
    byClientWeek.set(key, pickBestPayment(byClientWeek.get(key), payment));
  });
  return [...byClientWeek.values()].sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
}

function isScheduledPayment(payment) {
  if (!payment.client?.dateTaken) return true;
  return getPaymentSchedule(payment.client.dateTaken, payment.weekStart).isActiveWeek;
}

router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const weekStart = getWeekStart();

    const totalClients = await Client.countDocuments();
    const allPaymentRecords = await WeeklyPayment.find().populate('client');
    const scheduledPayments = consolidatePayments(allPaymentRecords).filter(isScheduledPayment);
    const currentWeekPayments = scheduledPayments.filter((p) => {
      const ws = getWeekStart(p.weekStart);
      return ws >= weekStart && ws < nextWeekStart(weekStart);
    });
    const allUnpaid = scheduledPayments.filter((p) => !p.paid);
    const monthPaid = scheduledPayments.filter(
      (p) => p.paid && p.paidAt && p.paidAt >= monthStart && p.paidAt <= monthEnd
    );
    const monthEntries = await CollectionEntry.find({
      entryDate: { $gte: monthStart, $lte: monthEnd },
    });

    const pendingPayments = currentWeekPayments.filter((p) => !p.paid).length;
    const completedPayments = currentWeekPayments.filter((p) => p.paid).length;
    const weeklyCollectedMonth = monthPaid.reduce((s, p) => s + Number(p.amount || 0), 0);
    const collectionIncomeMonth = monthEntries.reduce((s, e) => s + Number(e.collection || 0), 0);
    const totalCollected = weeklyCollectedMonth + collectionIncomeMonth;
    const totalDue = allUnpaid.reduce(
      (s, p) => s + Number(p.amount || p.client?.weeklyPayment || 0),
      0
    );
    const defaulters = allUnpaid.length;

    const daysInMonth = monthEnd.getDate();
    const collectionTrend = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), d));
      const dayEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), d));
      if (dayStart > now) break;

      const dayCollected =
        monthEntries
          .filter((e) => {
            const ed = new Date(e.entryDate);
            return ed >= dayStart && ed <= dayEnd;
          })
          .reduce((s, e) => s + Number(e.collection || 0), 0) +
        monthPaid
          .filter((p) => {
            const pd = new Date(p.paidAt);
            return pd >= dayStart && pd <= dayEnd;
          })
          .reduce((s, p) => s + Number(p.amount || 0), 0);

      const pendingAmount = allUnpaid
        .filter((p) => new Date(p.createdAt) <= dayEnd)
        .reduce((s, p) => s + Number(p.amount || p.client?.weeklyPayment || 0), 0);

      collectionTrend.push({
        day: d,
        label: String(d),
        collected: dayCollected,
        pending: pendingAmount,
      });
    }

    const weeklyBars = [];
    for (let w = 4; w >= 0; w--) {
      const ws = new Date(weekStart);
      ws.setDate(ws.getDate() - w * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      we.setHours(23, 59, 59, 999);

      const weekPaid = await WeeklyPayment.find({
        paid: true,
        paidAt: { $gte: ws, $lte: we },
      });
      const weekEntries = monthEntries.filter((e) => {
        const ed = new Date(e.entryDate);
        return ed >= ws && ed <= we;
      });
      const amount =
        weekPaid.reduce((s, p) => s + Number(p.amount || 0), 0) +
        weekEntries.reduce((s, e) => s + Number(e.collection || 0), 0);

      weeklyBars.push({
        week: `W${5 - w}`,
        label: formatWeekLabel(ws),
        amount,
      });
    }

    const recentFromEntries = await CollectionEntry.find()
      .sort({ entryDate: -1, createdAt: -1 })
      .limit(8)
      .lean();
    const recentFromWeekly = await WeeklyPayment.find({ paid: true })
      .populate('client', 'name profilePhoto')
      .sort({ paidAt: -1 })
      .limit(8)
      .lean();

    const recentCollections = [
      ...recentFromEntries.map((e) => ({
        id: e._id,
        name: e.name || 'Collection',
        amount: Number(e.collection || 0),
        date: e.entryDate,
        status: 'paid',
        type: 'collection',
      })),
      ...recentFromWeekly.map((p) => ({
        id: p._id,
        name: p.client?.name || 'Client',
        amount: Number(p.amount || 0),
        date: p.paidAt,
        status: 'paid',
        type: 'weekly',
      })),
    ]
      .filter((r) => r.amount > 0 && r.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const paymentReminders = allUnpaid
      .map((p) => {
        const client = p.client;
        if (!client) return null;
        const dueDate = getDueDate(p.weekStart);
        return {
          paymentId: p._id,
          name: client.name,
          phone: client.phone,
          amount: Number(p.amount || client.weeklyPayment || 0),
          dueDate,
          daysUntilDue: getDaysUntil(dueDate),
          isOverdue: getDaysUntil(dueDate) < 0,
          message: p.reminderMessage || buildReminderMessage(client, p),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 5);

    const performerMap = new Map();
    monthPaid.forEach((p) => {
      const name = p.client?.name || 'Unknown';
      performerMap.set(name, (performerMap.get(name) || 0) + Number(p.amount || 0));
    });
    monthEntries.forEach((e) => {
      const name = e.name || 'Collection';
      if (name) {
        performerMap.set(name, (performerMap.get(name) || 0) + Number(e.collection || 0));
      }
    });
    const topPerformers = [...performerMap.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const clientsAddedThisMonth = await Client.countDocuments({
      createdAt: { $gte: monthStart, $lte: monthEnd },
    });

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const todayEntries = await CollectionEntry.find({
      entryDate: { $gte: todayStart, $lte: todayEnd },
    });
    const todayWeeklyPaid = await WeeklyPayment.find({
      paid: true,
      paidAt: { $gte: todayStart, $lte: todayEnd },
    });

    const dailyCash =
      todayEntries.reduce((s, e) => s + Number(e.collection || 0), 0) +
      todayWeeklyPaid.reduce((s, p) => s + Number(p.amount || 0), 0);
    const dailyUpi = todayEntries.reduce((s, e) => s + Number(e.payments || 0), 0);
    const dailyOther = todayEntries.reduce((s, e) => s + Number(e.charges || 0), 0);
    const dailyTotal = dailyCash + dailyUpi + dailyOther;

    const allClients = await Client.find().select('-password').sort({ createdAt: -1 });
    const paidClientIds = new Set(
      currentWeekPayments
        .filter((p) => p.paid)
        .map((p) => String(p.client?._id || p.client))
    );
    const activeClients = allClients.filter((c) => paidClientIds.has(String(c._id))).length;
    const inactiveClients = Math.max(0, totalClients - activeClients);

    const recentClients = allClients.slice(0, 3).map((c) => ({
      id: c._id,
      name: c.name,
      phone: c.phone,
      amountTaken: c.amountTaken,
      profilePhoto: c.profilePhoto || '',
      createdAt: c.createdAt,
      isNew: c.createdAt >= monthStart,
    }));

    const dailyTarget = allClients.reduce((s, c) => s + Number(c.weeklyPayment || 0), 0) || dailyTotal || 1;
    const dailyProgress = Math.min(100, Math.round((dailyTotal / dailyTarget) * 100));

    res.json({
      kpis: {
        totalClients,
        pendingPayments,
        completedPayments,
        totalCollected,
        totalDue,
        defaulters,
        clientsAddedThisMonth,
        pendingDelta: pendingPayments,
        completedDelta: completedPayments,
      },
      dailyCollection: {
        total: dailyTotal,
        cash: dailyCash,
        upi: dailyUpi,
        other: dailyOther,
        progress: dailyProgress,
      },
      clientsOverview: {
        total: totalClients,
        active: activeClients,
        inactive: inactiveClients,
        newThisMonth: clientsAddedThisMonth,
      },
      recentClients,
      collectionTrend,
      weeklyBars,
      recentCollections,
      paymentReminders,
      topPerformers,
      monthLabel: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function formatWeekLabel(weekStart) {
  return new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

router.get('/weekly-status', async (req, res) => {
  try {
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const clients = await Client.find().select('-password');

    const status = await Promise.all(
      clients.map(async (client) => {
        const schedule = getPaymentSchedule(client.dateTaken, weekStart);
        if (!schedule.isActiveWeek) {
          const nextDueWeek = schedule.isBeforeStart ? schedule.firstPaymentWeekStart : null;
          return {
            clientId: client._id,
            name: client.name,
            place: client.place,
            phone: client.phone,
            weeklyPayment: client.weeklyPayment,
            weekStart: nextDueWeek || weekStart,
            dueDate: nextDueWeek ? getDueDate(nextDueWeek) : null,
            daysUntilDue: nextDueWeek ? getDaysUntil(getDueDate(nextDueWeek)) : null,
            isOverdue: false,
            paid: schedule.isAfterSchedule,
            paidAt: null,
            paymentStatus: schedule.isBeforeStart ? 'not-started' : 'completed',
            paymentId: null,
            reminderSent: false,
            reminderMessage: '',
            reminderPreview: schedule.isBeforeStart
              ? `Payments start from week ${nextDueWeek.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
              : '25-week schedule completed.',
            schedule,
          };
        }

        let payment = await WeeklyPayment.findOne({
          client: client._id,
          weekStart: { $gte: weekStart, $lt: weekEnd },
        }).sort({ paid: -1, updatedAt: -1, createdAt: -1 });
        if (!payment) {
          payment = await WeeklyPayment.create({
            client: client._id,
            weekStart,
            amount: client.weeklyPayment,
            paid: false,
          });
        }
        const dueDate = getDueDate(payment.weekStart);
        const daysUntilDue = payment.paid ? null : getDaysUntil(dueDate);
        const reminderPreview = payment.paid
          ? ''
          : buildReminderMessage(client, payment);

        return {
          clientId: client._id,
          name: client.name,
          place: client.place,
          phone: client.phone,
          weeklyPayment: client.weeklyPayment,
          weekStart: payment.weekStart,
          dueDate,
          daysUntilDue,
          isOverdue: !payment.paid && daysUntilDue < 0,
          paid: payment.paid,
          paidAt: payment.paidAt,
          paymentStatus: payment.paymentStatus || 'pending',
          screenshotUploadedAt: payment.screenshotUploadedAt,
          paymentId: payment._id,
          reminderSent: payment.reminderSent,
          reminderMessage: payment.reminderMessage || reminderPreview,
          reminderPreview,
          schedule,
        };
      })
    );

    res.json({ weekStart, clients: status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/clients/:id/renew', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const { amountTaken, dateTaken, interestRate, weeklyPayment, note } = req.body;
    if (!amountTaken || !dateTaken || !interestRate || !weeklyPayment) {
      return res.status(400).json({ message: 'Amount, date, interest and weekly payment are required' });
    }

    const renewal = {
      previousAmountTaken: client.amountTaken,
      previousDateTaken: client.dateTaken,
      previousInterestRate: client.interestRate,
      previousWeeklyPayment: client.weeklyPayment,
      newAmountTaken: Number(amountTaken),
      newDateTaken: new Date(dateTaken),
      newInterestRate: Number(interestRate),
      newWeeklyPayment: Number(weeklyPayment),
      note: note || '',
    };

    client.amountTaken = renewal.newAmountTaken;
    client.dateTaken = renewal.newDateTaken;
    client.interestRate = renewal.newInterestRate;
    client.weeklyPayment = renewal.newWeeklyPayment;
    client.renewalHistory.push(renewal);
    await client.save();

    const weekStart = getWeekStart();
    const schedule = getPaymentSchedule(client.dateTaken, weekStart);
    if (schedule.isActiveWeek) {
      await WeeklyPayment.findOneAndUpdate(
        { client: client._id, weekStart },
        {
          $setOnInsert: { client: client._id, weekStart, paid: false },
          $set: { amount: client.weeklyPayment },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const safe = client.toObject();
    delete safe.password;
    res.json({
      ...safe,
      interestAmount: calcInterestAmount(safe.amountTaken, safe.interestRate),
      totalAmount: calcTotalAmount(safe.amountTaken, safe.interestRate),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/payment-approvals', async (req, res) => {
  try {
    const approvals = await WeeklyPayment.find({
      paymentStatus: { $in: ['submitted', 'rejected'] },
    })
      .populate('client', 'name place phone profilePhoto')
      .sort({ screenshotUploadedAt: -1, updatedAt: -1 });

    res.json(
      approvals
        .filter((payment) => payment.client)
        .map((payment) => ({
          _id: payment._id,
          clientId: payment.client._id,
          customerName: payment.client.name,
          place: payment.client.place,
          phone: payment.client.phone,
          profilePhoto: payment.client.profilePhoto || '',
          amount: payment.amount,
          weekStart: payment.weekStart,
          dueDate: getDueDate(payment.weekStart),
          paymentStatus: payment.paymentStatus,
          screenshot: payment.screenshot,
          screenshotUploadedAt: payment.screenshotUploadedAt,
          managerNote: payment.managerNote || '',
        }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/payment-approvals/:paymentId', async (req, res) => {
  try {
    const { action, managerNote } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    const payment = await WeeklyPayment.findById(req.params.paymentId).populate('client');
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }
    if (!payment.screenshot) {
      return res.status(400).json({ message: 'No screenshot uploaded for this payment' });
    }

    if (action === 'approve') {
      payment.paid = true;
      payment.paidAt = new Date();
      payment.paymentStatus = 'approved';
      payment.approvedAt = new Date();
      payment.rejectedAt = undefined;
      payment.managerNote = managerNote || 'Payment approved';
    } else {
      payment.paid = false;
      payment.paidAt = undefined;
      payment.paymentStatus = 'rejected';
      payment.rejectedAt = new Date();
      payment.managerNote = managerNote || 'Payment rejected';
    }

    await payment.save();
    res.json(payment);
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
    payment.paymentStatus = paid ? 'approved' : 'pending';
    payment.approvedAt = paid ? new Date() : undefined;
    if (!paid) {
      payment.reminderSent = false;
      payment.reminderSentAt = undefined;
      payment.rejectedAt = undefined;
      payment.managerNote = '';
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
    const message = buildReminderMessage(client, payment);

    payment.reminderSent = true;
    payment.reminderSentAt = new Date();
    payment.reminderMessage = message;
    await payment.save();

    res.json({
      success: true,
      message: 'Reminder recorded successfully',
      smsPreview: message,
      phone: client.phone,
      note: 'Use WhatsApp button to deliver the message to the customer.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/send-reminders/bulk', async (req, res) => {
  try {
    const weekStart = getWeekStart();
    const payments = consolidatePayments(
      await WeeklyPayment.find({
        weekStart: { $gte: weekStart, $lt: nextWeekStart(weekStart) },
      }).populate('client')
    ).filter((payment) => !payment.paid && isScheduledPayment(payment));
    let sent = 0;

    for (const payment of payments) {
      const message = buildReminderMessage(payment.client, payment);
      payment.reminderSent = true;
      payment.reminderSentAt = new Date();
      payment.reminderMessage = message;
      await payment.save();
      sent += 1;
    }

    res.json({
      success: true,
      sent,
      message: `Reminders prepared for ${sent} pending client(s) this week.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/defaulters', async (req, res) => {
  try {
    const currentWeekStart = getWeekStart();
    const payments = await WeeklyPayment.find()
      .populate('client')
      .sort({ weekStart: 1 });
    const unpaid = consolidatePayments(payments)
      .filter(isScheduledPayment)
      .filter((payment) => !payment.paid);

    const defaulters = unpaid
      .filter((payment) => payment.client)
      .map((payment) => {
        const client = payment.client;
        const dueDate = getDueDate(payment.weekStart);
        const daysUntilDue = getDaysUntil(dueDate);
        const isPastWeek = payment.weekStart < currentWeekStart;

        return {
          paymentId: payment._id,
          clientId: client._id,
          name: client.name,
          place: client.place,
          phone: client.phone,
          weeklyPayment: payment.amount || client.weeklyPayment,
          weekStart: payment.weekStart,
          dueDate,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          isPastWeek,
          reminderSent: payment.reminderSent,
          reminderMessage: payment.reminderMessage || buildReminderMessage(client, payment),
        };
      });

    res.json({ count: defaulters.length, defaulters });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/reports/daily-collections', async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const dayStart = startOfDay(dateStr);
    const dayEnd = endOfDay(dateStr);

    const entries = await CollectionEntry.find({
      entryDate: { $gte: dayStart, $lte: dayEnd },
    }).sort({ createdAt: -1 });

    const weeklyPaid = await WeeklyPayment.find({
      paid: true,
      paidAt: { $gte: dayStart, $lte: dayEnd },
    }).populate('client', 'name place');

    const collectionTotal = entries.reduce((s, e) => s + Number(e.collection || 0), 0);
    const chargesTotal = entries.reduce((s, e) => s + Number(e.charges || 0), 0);
    const paymentsTotal = entries.reduce((s, e) => s + Number(e.payments || 0), 0);
    const weeklyTotal = weeklyPaid.reduce((s, p) => s + Number(p.amount || 0), 0);

    res.json({
      date: dateStr,
      summary: {
        entriesCount: entries.length,
        collectionTotal,
        chargesTotal,
        paymentsTotal,
        weeklyPaymentsTotal: weeklyTotal,
        dayTotal: collectionTotal + weeklyTotal + chargesTotal,
      },
      entries,
      weeklyPaid: weeklyPaid.map((p) => ({
        _id: p._id,
        amount: p.amount,
        paidAt: p.paidAt,
        clientName: p.client?.name,
        clientPlace: p.client?.place,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/reports/monthly-profit', async (req, res) => {
  try {
    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await CollectionEntry.find({
      entryDate: { $gte: monthStart, $lte: monthEnd },
    });

    const weeklyPaid = await WeeklyPayment.find({
      paid: true,
      paidAt: { $gte: monthStart, $lte: monthEnd },
    });

    const collectionIncome = entries.reduce((s, e) => s + Number(e.collection || 0), 0);
    const chargesIncome = entries.reduce((s, e) => s + Number(e.charges || 0), 0);
    const paymentsOut = entries.reduce((s, e) => s + Number(e.payments || 0), 0);
    const weeklyIncome = weeklyPaid.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalIncome = collectionIncome + chargesIncome + weeklyIncome;
    const profit = totalIncome - paymentsOut;

    res.json({
      month: monthStr,
      summary: {
        collectionIncome,
        chargesIncome,
        weeklyIncome,
        paymentsOut,
        totalIncome,
        profit,
        entriesCount: entries.length,
        weeklyPaymentsCount: weeklyPaid.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
