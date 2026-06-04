const express = require('express');
const bcrypt = require('bcryptjs');
const Client = require('../models/Client');
const WeeklyPayment = require('../models/WeeklyPayment');
const CollectionEntry = require('../models/CollectionEntry');
const { auth } = require('../middleware/auth');
const {
  buildPaymentWeeks,
  getWeekStart,
  getDueDate,
  getDaysUntil,
  getFirstPaymentWeekStart,
  getPaymentSchedule,
  TOTAL_PAYMENT_WEEKS,
  normalizeTotalWeeks,
  getInterestRateForWeeks,
} = require('../utils/week');
const { buildReminderMessage } = require('../utils/reminder');
const {
  calcInterestAmount,
  calcTotalAmount,
  getClientInterestAmount,
  getClientTotalPayable,
} = require('../utils/finance');

const router = express.Router();

router.use(auth('manager'));

function calcPlanWeeklyPayment(amountTaken, interestRate, totalWeeks) {
  const total = calcTotalAmount(amountTaken, interestRate);
  const weekly = total / normalizeTotalWeeks(totalWeeks);
  return Number.isInteger(weekly) ? weekly : Number(weekly.toFixed(2));
}

router.get('/clients', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    let query = {};
    if (q) {
      query = {
        $or: [
          { uniqueNo: { $regex: q, $options: 'i' } },
          { name: { $regex: q, $options: 'i' } },
          { place: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } },
        ],
      };
    }
    const clients = await Client.find(query).select('-password').sort({ createdAt: -1 }).lean();
    const paidPayments = clients.length
      ? await WeeklyPayment.find({
          client: { $in: clients.map((client) => client._id) },
          paid: true,
        })
          .select('client weekStart paid amount')
          .lean()
      : [];
    const enriched = clients.map((c) => ({
      ...c,
      ...buildClientPlanSummary(c, paidPayments),
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/clients/:id/payment-plan', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).select('-password');
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const currentWeekStart = getWeekStart();
    const clientTotalWeeks = normalizeTotalWeeks(client.totalWeeks);
    const schedule = await ensureClientScheduledPayments(client, currentWeekStart);
    const payments = consolidatePayments(
      await WeeklyPayment.find({ client: client._id })
        .select('client weekStart paid paidAt amount paymentStatus screenshotUploadedAt reminderSent reminderMessage updatedAt createdAt')
        .lean()
    );
    const byWeek = new Map(payments.map((payment) => [paymentWeekKey(payment.weekStart), payment]));
    const currentWeekKey = paymentWeekKey(currentWeekStart);

    const weeks = buildPaymentWeeks(client.dateTaken, clientTotalWeeks).map((planned) => {
      const key = paymentWeekKey(planned.weekStart);
      const payment = byWeek.get(key);
      const dueDate = getDueDate(planned.weekStart);
      const isFuture = planned.weekStart > currentWeekStart;
      const paid = Boolean(payment?.paid);
      const baseStatus = payment?.paymentStatus || 'pending';
      const paymentStatus = paid ? 'paid' : isFuture ? 'upcoming' : baseStatus;

      return {
        paymentId: payment?._id || null,
        weekNumber: planned.weekNumber,
        weekStart: planned.weekStart,
        dueDate,
        amount: Number(payment?.amount || client.weeklyPayment || 0),
        paid,
        paidAt: payment?.paidAt || null,
        paymentStatus,
        screenshotUploadedAt: payment?.screenshotUploadedAt || null,
        reminderSent: Boolean(payment?.reminderSent),
        isCurrentWeek: key === currentWeekKey,
        isFuture,
        isOverdue: !paid && !isFuture && getDaysUntil(dueDate) < 0,
      };
    });

    const paidWeeks = weeks.filter((week) => week.paid);
    const notPaidWeeks = weeks.filter((week) => !week.paid);

    res.json({
      client: {
        _id: client._id,
        name: client.name,
        place: client.place,
        phone: client.phone,
        amountTaken: client.amountTaken,
        weeklyPayment: client.weeklyPayment,
        dateTaken: client.dateTaken,
        totalWeeks: clientTotalWeeks,
      },
      schedule,
      summary: {
        totalWeeks: clientTotalWeeks,
        paidWeeks: paidWeeks.length,
        notPaidWeeks: notPaidWeeks.length,
        totalPaid: paidWeeks.reduce((sum, week) => sum + Number(week.amount || 0), 0),
        totalNotPaid: notPaidWeeks.reduce((sum, week) => sum + Number(week.amount || 0), 0),
      },
      weeks,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/clients/:id/payment-plan/:weekNumber', async (req, res) => {
  try {
    const { paid } = req.body;
    const weekNumber = Number(req.params.weekNumber);
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    const clientTotalWeeks = normalizeTotalWeeks(client.totalWeeks);
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > clientTotalWeeks) {
      return res.status(400).json({ message: `Week number must be between 1 and ${clientTotalWeeks}` });
    }

    const planned = buildPaymentWeeks(client.dateTaken, clientTotalWeeks).find((week) => week.weekNumber === weekNumber);
    if (!planned) {
      return res.status(404).json({ message: 'Payment week not found' });
    }

    const weekStart = getWeekStart(planned.weekStart);
    const weekEnd = nextWeekStart(weekStart);
    let payment = consolidatePayments(
      await WeeklyPayment.find({
        client: client._id,
        weekStart: { $gte: weekStart, $lt: weekEnd },
      })
    )[0];

    if (!payment) {
      payment = await WeeklyPayment.create({
        client: client._id,
        weekStart,
        amount: client.weeklyPayment,
        paid: false,
        paymentStatus: 'pending',
      });
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

    res.json({
      _id: payment._id,
      paymentId: payment._id,
      weekNumber,
      weekStart: payment.weekStart,
      amount: payment.amount,
      paid: payment.paid,
      paidAt: payment.paidAt,
      paymentStatus: payment.paymentStatus,
      approvedAt: payment.approvedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/clients', async (req, res) => {
  try {
    const {
      name,
      uniqueNo,
      place,
      phone,
      amountTaken,
      dateTaken,
      totalWeeks,
      interestRate,
      weeklyPayment,
      username,
      password,
    } = req.body;

    const planWeeks = normalizeTotalWeeks(totalWeeks);
    const planInterestRate = getInterestRateForWeeks(planWeeks);
    const planWeeklyPayment = calcPlanWeeklyPayment(Number(amountTaken), planInterestRate, planWeeks);

    if (!uniqueNo || !name || !place || !phone || !amountTaken || !dateTaken || !totalWeeks || !username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUniqueNo = await Client.findOne({ uniqueNo: uniqueNo.trim() });
    if (existingUniqueNo) {
      return res.status(400).json({ message: 'Unique No already exists' });
    }

    const existing = await Client.findOne({ username: username.trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const client = await Client.create({
      uniqueNo: uniqueNo.trim(),
      name,
      place,
      phone,
      amountTaken: Number(amountTaken),
      dateTaken: new Date(dateTaken),
      totalWeeks: planWeeks,
      interestRate: planInterestRate,
      planInterestAmount: calcInterestAmount(Number(amountTaken), planInterestRate),
      totalPayable: calcTotalAmount(Number(amountTaken), planInterestRate),
      weeklyPayment: planWeeklyPayment,
      username: username.trim().toLowerCase(),
      password: hashed,
    });

    const weekStart = getWeekStart();
    const schedule = getPaymentSchedule(client.dateTaken, weekStart, client.totalWeeks);
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
      uniqueNo,
      place,
      phone,
      amountTaken,
      dateTaken,
      totalWeeks,
      interestRate,
      weeklyPayment,
      username,
      password,
    } = req.body;

    if (name !== undefined) client.name = name;
    if (uniqueNo !== undefined) {
      const nextUniqueNo = uniqueNo.trim();
      if (!nextUniqueNo) {
        return res.status(400).json({ message: 'Unique No is required' });
      }
      const existingUniqueNo = await Client.findOne({ uniqueNo: nextUniqueNo, _id: { $ne: client._id } });
      if (existingUniqueNo) {
        return res.status(400).json({ message: 'Unique No already exists' });
      }
      client.uniqueNo = nextUniqueNo;
    }
    if (place !== undefined) client.place = place;
    if (phone !== undefined) client.phone = phone;
    if (amountTaken !== undefined) client.amountTaken = Number(amountTaken);
    if (dateTaken !== undefined) client.dateTaken = new Date(dateTaken);
    if (totalWeeks !== undefined) client.totalWeeks = normalizeTotalWeeks(totalWeeks);
    if (username !== undefined) client.username = username.trim().toLowerCase();
    if (password) {
      client.password = await bcrypt.hash(password, 10);
    }
    if (amountTaken !== undefined || totalWeeks !== undefined) {
      client.interestRate = getInterestRateForWeeks(client.totalWeeks);
      client.planInterestAmount = calcInterestAmount(client.amountTaken, client.interestRate);
      client.totalPayable = calcTotalAmount(client.amountTaken, client.interestRate);
      client.weeklyPayment = calcPlanWeeklyPayment(client.amountTaken, client.interestRate, client.totalWeeks);
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

function paymentWeekKey(weekStart) {
  return getWeekStart(weekStart).toISOString().slice(0, 10);
}

function currentPlanStart(client) {
  return getFirstPaymentWeekStart(client.dateTaken);
}

function sumPaidForCurrentPlan(client, payments = []) {
  const planStart = currentPlanStart(client);
  return payments
    .filter((payment) => {
      const paymentClientId = String(payment.client?._id || payment.client);
      return (
        paymentClientId === String(client._id) &&
        payment.paid &&
        new Date(payment.weekStart) >= planStart
      );
    })
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function buildClientPlanSummary(client, payments = []) {
  const oldTotalPayable = getClientTotalPayable(client);
  const amountAlreadyPaid = sumPaidForCurrentPlan(client, payments);
  const previousRemainingAmount = Math.max(oldTotalPayable - amountAlreadyPaid, 0);
  return {
    interestAmount: getClientInterestAmount(client),
    totalAmount: oldTotalPayable,
    totalPayable: oldTotalPayable,
    amountAlreadyPaid,
    previousRemainingAmount,
  };
}

function isDuplicateBulkError(err) {
  return err.code === 11000 || err.writeErrors?.every((writeErr) => writeErr.code === 11000);
}

async function ensureClientScheduledPayments(client, weekStart = getWeekStart()) {
  const totalWeeks = normalizeTotalWeeks(client.totalWeeks);
  const schedule = getPaymentSchedule(client.dateTaken, weekStart, totalWeeks);
  const activeWeekCount = Math.min(Math.max(schedule.currentWeekNumber, 0), schedule.totalWeeks);
  if (activeWeekCount < 1) return schedule;

  const existing = await WeeklyPayment.find({ client: client._id }).sort({
    paid: -1,
    updatedAt: -1,
    createdAt: -1,
  });
  const byWeek = new Map(consolidatePayments(existing).map((p) => [paymentWeekKey(p.weekStart), p]));

  for (const planned of buildPaymentWeeks(client.dateTaken, totalWeeks).slice(0, activeWeekCount)) {
    const key = paymentWeekKey(planned.weekStart);
    if (byWeek.has(key)) continue;
    await WeeklyPayment.create({
      client: client._id,
      weekStart: planned.weekStart,
      amount: client.weeklyPayment,
      paid: false,
    });
  }

  return schedule;
}

async function ensureScheduledPaymentsForClients(clients, weekStart = getWeekStart()) {
  const scheduleByClient = new Map();
  const operations = [];

  const activeClients = clients
    .map((client) => {
      const totalWeeks = normalizeTotalWeeks(client.totalWeeks);
      const schedule = getPaymentSchedule(client.dateTaken, weekStart, totalWeeks);
      scheduleByClient.set(String(client._id), schedule);
      const activeWeekCount = Math.min(Math.max(schedule.currentWeekNumber, 0), schedule.totalWeeks);
      return { client, schedule, activeWeekCount };
    })
    .filter(({ activeWeekCount }) => activeWeekCount > 0);

  if (!activeClients.length) return scheduleByClient;

  const clientIds = activeClients.map(({ client }) => client._id);
  const existingPayments = await WeeklyPayment.find({ client: { $in: clientIds } })
    .select('client weekStart paid paymentStatus updatedAt createdAt')
    .lean();
  const existingKeys = new Set(
    consolidatePayments(existingPayments).map((payment) => {
      const clientId = String(payment.client?._id || payment.client);
      return `${clientId}:${paymentWeekKey(payment.weekStart)}`;
    })
  );

  activeClients.forEach(({ client, activeWeekCount }) => {
    const totalWeeks = normalizeTotalWeeks(client.totalWeeks);
    buildPaymentWeeks(client.dateTaken, totalWeeks)
      .slice(0, activeWeekCount)
      .forEach((planned) => {
        const normalizedWeekStart = getWeekStart(planned.weekStart);
        const key = `${client._id}:${paymentWeekKey(normalizedWeekStart)}`;
        if (existingKeys.has(key)) return;
        operations.push({
          updateOne: {
            filter: { client: client._id, weekStart: normalizedWeekStart },
            update: {
              $setOnInsert: {
                client: client._id,
                weekStart: normalizedWeekStart,
                amount: client.weeklyPayment,
                paid: false,
                paymentStatus: 'pending',
              },
            },
            upsert: true,
          },
        });
      });
  });

  if (!operations.length) return scheduleByClient;

  try {
    await WeeklyPayment.bulkWrite(operations, { ordered: false });
  } catch (err) {
    if (!isDuplicateBulkError(err)) throw err;
  }

  return scheduleByClient;
}

function isScheduledPayment(payment) {
  if (!payment.client?.dateTaken) return true;
  return getPaymentSchedule(payment.client.dateTaken, payment.weekStart, payment.client.totalWeeks).isActiveWeek;
}

router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const weekStart = getWeekStart();
    const oldestBarWeekStart = new Date(weekStart);
    oldestBarWeekStart.setDate(oldestBarWeekStart.getDate() - 28);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const allClients = await Client.find().select('-password').sort({ createdAt: -1 }).lean();
    await ensureScheduledPaymentsForClients(allClients, weekStart);
    const totalClients = allClients.length;

    const [
      allPaymentRecords,
      monthEntries,
      barEntries,
      recentFromEntries,
      recentFromWeekly,
      clientsAddedThisMonth,
    ] = await Promise.all([
      WeeklyPayment.find()
        .select('client weekStart paid paidAt amount paymentStatus reminderSent reminderMessage updatedAt createdAt')
        .populate('client', 'name phone weeklyPayment dateTaken totalWeeks profilePhoto')
        .lean(),
      CollectionEntry.find({
        entryDate: { $gte: monthStart, $lte: monthEnd },
      })
        .select('name collection charges payments entryDate createdAt')
        .lean(),
      CollectionEntry.find({
        entryDate: { $gte: oldestBarWeekStart, $lte: todayEnd },
      })
        .select('collection entryDate')
        .lean(),
      CollectionEntry.find()
        .sort({ entryDate: -1, createdAt: -1 })
        .limit(8)
        .select('name collection entryDate')
        .lean(),
      WeeklyPayment.find({ paid: true })
        .select('client amount paidAt')
        .populate('client', 'name profilePhoto')
        .sort({ paidAt: -1 })
        .limit(8)
        .lean(),
      Client.countDocuments({
        createdAt: { $gte: monthStart, $lte: monthEnd },
      }),
    ]);

    const scheduledPayments = consolidatePayments(allPaymentRecords).filter(isScheduledPayment);
    const currentWeekPayments = scheduledPayments.filter((p) => {
      const ws = getWeekStart(p.weekStart);
      return ws >= weekStart && ws < nextWeekStart(weekStart);
    });
    const allUnpaid = scheduledPayments.filter((p) => !p.paid);
    const monthPaid = scheduledPayments.filter(
      (p) => p.paid && p.paidAt && p.paidAt >= monthStart && p.paidAt <= monthEnd
    );

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

      const weekPaid = scheduledPayments.filter((p) => {
        if (!p.paid || !p.paidAt) return false;
        const paidAt = new Date(p.paidAt);
        return paidAt >= ws && paidAt <= we;
      });
      const weekEntries = barEntries.filter((e) => {
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
        const schedule = getPaymentSchedule(client.dateTaken, p.weekStart, client.totalWeeks);
        return {
          paymentId: p._id,
          name: client.name,
          phone: client.phone,
          amount: Number(p.amount || client.weeklyPayment || 0),
          weekNumber: schedule.currentWeekNumber,
          weekStart: p.weekStart,
          dueDate,
          daysUntilDue: getDaysUntil(dueDate),
          isOverdue: getDaysUntil(dueDate) < 0,
          message: p.reminderMessage || buildReminderMessage(client, p),
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart))
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
    const todayEntries = monthEntries.filter((e) => {
      const entryDate = new Date(e.entryDate);
      return entryDate >= todayStart && entryDate <= todayEnd;
    });
    const todayWeeklyPaid = scheduledPayments.filter((p) => {
      if (!p.paid || !p.paidAt) return false;
      const paidAt = new Date(p.paidAt);
      return paidAt >= todayStart && paidAt <= todayEnd;
    });

    const dailyCash =
      todayEntries.reduce((s, e) => s + Number(e.collection || 0), 0) +
      todayWeeklyPaid.reduce((s, p) => s + Number(p.amount || 0), 0);
    const dailyUpi = todayEntries.reduce((s, e) => s + Number(e.payments || 0), 0);
    const dailyOther = todayEntries.reduce((s, e) => s + Number(e.charges || 0), 0);
    const dailyTotal = dailyCash + dailyUpi + dailyOther;

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
    const clients = await Client.find().select('-password').lean();
    const scheduleByClient = await ensureScheduledPaymentsForClients(clients, weekStart);
    const currentPayments = consolidatePayments(
      await WeeklyPayment.find({
        client: { $in: clients.map((client) => client._id) },
        weekStart: { $gte: weekStart, $lt: weekEnd },
      })
        .select('client weekStart paid paidAt amount paymentStatus screenshotUploadedAt reminderSent reminderMessage updatedAt createdAt')
        .lean()
    );
    const paymentByClient = new Map(
      currentPayments.map((payment) => [String(payment.client?._id || payment.client), payment])
    );

    const status = clients.map((client) => {
        const schedule = scheduleByClient.get(String(client._id)) || getPaymentSchedule(client.dateTaken, weekStart, client.totalWeeks);
        if (!schedule.isActiveWeek) {
          const nextDueWeek = schedule.isBeforeStart ? schedule.firstPaymentWeekStart : null;
          return {
            clientId: client._id,
            name: client.name,
            place: client.place,
            phone: client.phone,
            profilePhoto: client.profilePhoto || '',
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
              : `${schedule.totalWeeks}-week schedule completed.`,
            schedule,
          };
        }

        const payment = paymentByClient.get(String(client._id)) || {
          client: client._id,
          weekStart,
          amount: client.weeklyPayment,
          paid: false,
          paymentStatus: 'pending',
        };
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
          profilePhoto: client.profilePhoto || '',
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
      });

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
    if (!amountTaken || !dateTaken || !interestRate) {
      return res.status(400).json({ message: 'Amount, date and interest are required' });
    }
    const renewalWeeklyPayment =
      weeklyPayment !== undefined && weeklyPayment !== ''
        ? Number(weeklyPayment)
        : Number(amountTaken) / 25;

    const renewal = {
      previousAmountTaken: client.amountTaken,
      previousDateTaken: client.dateTaken,
      previousInterestRate: client.interestRate,
      previousWeeklyPayment: client.weeklyPayment,
      newAmountTaken: Number(amountTaken),
      newDateTaken: new Date(dateTaken),
      newInterestRate: Number(interestRate),
      newWeeklyPayment: renewalWeeklyPayment,
      note: note || '',
    };

    client.amountTaken = renewal.newAmountTaken;
    client.dateTaken = renewal.newDateTaken;
    client.interestRate = renewal.newInterestRate;
    client.weeklyPayment = renewal.newWeeklyPayment;
    client.renewalHistory.push(renewal);
    await client.save();

    const weekStart = getWeekStart();
    const schedule = getPaymentSchedule(client.dateTaken, weekStart, client.totalWeeks);
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

router.post('/clients/:id/top-up', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const { newAmountTaken, interestRate, topUpDate, note } = req.body;
    const newAmount = Number(newAmountTaken);
    const rate = Number(interestRate);
    if (!newAmount || newAmount <= 0 || Number.isNaN(newAmount)) {
      return res.status(400).json({ message: 'Top-up amount is required' });
    }
    if (interestRate === undefined || interestRate === '' || Number.isNaN(rate) || rate < 0) {
      return res.status(400).json({ message: 'Interest percentage is required' });
    }

    const paidPayments = await WeeklyPayment.find({
      client: client._id,
      paid: true,
    })
      .select('client weekStart paid amount')
      .lean();
    const oldTotalPayable = getClientTotalPayable(client);
    const amountAlreadyPaid = sumPaidForCurrentPlan(client, paidPayments);
    const previousRemainingAmount = Math.max(oldTotalPayable - amountAlreadyPaid, 0);
    const principalAmount = previousRemainingAmount + newAmount;
    const newInterestAmount = calcInterestAmount(principalAmount, rate);
    const newTotalPayable = principalAmount + newInterestAmount;
    const newWeeklyPayment = Math.ceil(newTotalPayable / TOTAL_PAYMENT_WEEKS);
    const effectiveTopUpDate = topUpDate ? new Date(topUpDate) : new Date();
    const firstPaymentDate = getFirstPaymentWeekStart(effectiveTopUpDate);

    const topUp = {
      previousAmountTaken: client.amountTaken,
      previousDateTaken: client.dateTaken,
      previousInterestRate: client.interestRate,
      previousWeeklyPayment: client.weeklyPayment,
      oldTotalPayable,
      amountAlreadyPaid,
      previousRemainingAmount,
      newAmountTaken: newAmount,
      newInterestRate: rate,
      newInterestAmount,
      newTotalPayable,
      newWeeklyPayment,
      totalWeeks: TOTAL_PAYMENT_WEEKS,
      firstPaymentDate,
      note: note || '',
    };

    client.amountTaken = newAmount;
    client.dateTaken = effectiveTopUpDate;
    client.interestRate = rate;
    client.planInterestAmount = newInterestAmount;
    client.totalPayable = newTotalPayable;
    client.weeklyPayment = newWeeklyPayment;
    client.topUpHistory.push(topUp);
    await client.save();

    await WeeklyPayment.updateMany(
      {
        client: client._id,
        weekStart: { $gte: firstPaymentDate },
        paid: false,
      },
      {
        $set: {
          amount: newWeeklyPayment,
          paymentStatus: 'pending',
          reminderSent: false,
          reminderMessage: '',
        },
        $unset: {
          reminderSentAt: '',
          rejectedAt: '',
          managerNote: '',
        },
      }
    );
    await ensureClientScheduledPayments(client, getWeekStart());

    const safe = client.toObject();
    delete safe.password;
    const latestTopUp = safe.topUpHistory?.[safe.topUpHistory.length - 1] || topUp;
    res.json({
      ...safe,
      ...buildClientPlanSummary(safe, []),
      topUp: latestTopUp,
      firstPaymentDate,
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
      .select('client amount weekStart paymentStatus screenshot screenshotUploadedAt managerNote updatedAt')
      .populate('client', 'name place phone profilePhoto')
      .sort({ screenshotUploadedAt: -1, updatedAt: -1 })
      .lean();

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

    const payment = await WeeklyPayment.findById(req.params.paymentId).populate('client', 'name place phone weeklyPayment dateTaken totalWeeks');
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
    res.json({
      _id: payment._id,
      paid: payment.paid,
      paidAt: payment.paidAt,
      paymentStatus: payment.paymentStatus,
      approvedAt: payment.approvedAt,
      rejectedAt: payment.rejectedAt,
      managerNote: payment.managerNote,
    });
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
    res.json({
      _id: payment._id,
      paid: payment.paid,
      paidAt: payment.paidAt,
      paymentStatus: payment.paymentStatus,
      approvedAt: payment.approvedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const entries = await CollectionEntry.find().sort({ createdAt: -1 }).lean();
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
    const payment = await WeeklyPayment.findById(req.params.paymentId).populate('client', 'name phone weeklyPayment dateTaken totalWeeks');
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
    const clients = await Client.find().select('-password').lean();
    await ensureScheduledPaymentsForClients(clients, weekStart);
    const payments = consolidatePayments(
      await WeeklyPayment.find({
        weekStart: { $gte: weekStart, $lt: nextWeekStart(weekStart) },
      }).populate('client', 'name phone weeklyPayment dateTaken totalWeeks')
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
    const clients = await Client.find().select('-password').lean();
    await ensureScheduledPaymentsForClients(clients, currentWeekStart);
    const payments = await WeeklyPayment.find()
      .select('client weekStart paid paidAt amount paymentStatus reminderSent reminderMessage updatedAt createdAt')
      .populate('client', 'name place phone weeklyPayment dateTaken totalWeeks')
      .sort({ weekStart: 1 })
      .lean();
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
        const schedule = getPaymentSchedule(client.dateTaken, payment.weekStart, client.totalWeeks);

        return {
          paymentId: payment._id,
          clientId: client._id,
          name: client.name,
          place: client.place,
          phone: client.phone,
          weeklyPayment: payment.amount || client.weeklyPayment,
          weekNumber: schedule.currentWeekNumber,
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
    }).sort({ createdAt: -1 }).lean();

    const weeklyPaidRows = await WeeklyPayment.find({
      paid: true,
      paidAt: { $gte: dayStart, $lte: dayEnd },
    })
      .select('client amount weekStart paid paidAt paymentStatus updatedAt createdAt')
      .populate('client', 'name place dateTaken totalWeeks')
      .lean();
    const weeklyPaid = consolidatePayments(weeklyPaidRows)
      .filter((payment) => payment.paid && isScheduledPayment(payment))
      .sort((a, b) => new Date(b.paidAt || b.updatedAt) - new Date(a.paidAt || a.updatedAt));

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
    }).lean();

    const weeklyPaidRows = await WeeklyPayment.find({
      paid: true,
      paidAt: { $gte: monthStart, $lte: monthEnd },
    })
      .select('client amount weekStart paid paidAt paymentStatus updatedAt createdAt')
      .populate('client', 'name place phone dateTaken totalWeeks')
      .sort({ paidAt: -1 })
      .lean();
    const weeklyPaid = consolidatePayments(weeklyPaidRows)
      .filter((payment) => payment.paid && isScheduledPayment(payment))
      .sort((a, b) => new Date(b.paidAt || b.updatedAt) - new Date(a.paidAt || a.updatedAt));

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
      details: {
        collectionIncome: entries
          .filter((entry) => Number(entry.collection || 0) > 0)
          .map((entry) => ({
            _id: entry._id,
            name: entry.name || 'Collection entry',
            date: entry.entryDate,
            amount: Number(entry.collection || 0),
            previousAmount: Number(entry.previousAmount || 0),
            note: entry.note || '',
          })),
        weeklyIncome: weeklyPaid.map((payment) => ({
          _id: payment._id,
          name: payment.client?.name || 'Weekly payment',
          place: payment.client?.place || '',
          phone: payment.client?.phone || '',
          amount: Number(payment.amount || 0),
          weekStart: payment.weekStart,
          paidAt: payment.paidAt,
        })),
        charges: entries
          .filter((entry) => Number(entry.charges || 0) > 0)
          .map((entry) => ({
            _id: entry._id,
            name: entry.name || 'Charge entry',
            date: entry.entryDate,
            amount: Number(entry.charges || 0),
            note: entry.note || '',
          })),
        paymentsOut: entries
          .filter((entry) => Number(entry.payments || 0) > 0)
          .map((entry) => ({
            _id: entry._id,
            name: entry.name || 'Payment entry',
            date: entry.entryDate,
            amount: Number(entry.payments || 0),
            note: entry.note || '',
          })),
        monthlyProfit: [
          { label: 'Collection income', amount: collectionIncome, type: 'income' },
          { label: 'Weekly income', amount: weeklyIncome, type: 'income' },
          { label: 'Charges', amount: chargesIncome, type: 'income' },
          { label: 'Payments out', amount: paymentsOut, type: 'expense' },
          { label: 'Monthly profit', amount: profit, type: profit >= 0 ? 'profit' : 'loss' },
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
