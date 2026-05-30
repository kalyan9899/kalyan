require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Manager = require('./models/Manager');
const Client = require('./models/Client');
const WeeklyPayment = require('./models/WeeklyPayment');
const { getWeekStart } = require('./utils/week');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lakshmi_ganapati');

  await Manager.deleteMany({});
  await Client.deleteMany({});
  await WeeklyPayment.deleteMany({});

  const managerPass = await bcrypt.hash('manager123', 10);
  await Manager.create({
    username: 'manager',
    password: managerPass,
    name: 'Lakshmi Ganapati Manager',
  });

  const customerPass = await bcrypt.hash('customer123', 10);
  const client = await Client.create({
    name: 'Raju Kumar',
    place: 'Hyderabad',
    phone: '9876543210',
    amountTaken: 50000,
    dateTaken: new Date('2025-01-15'),
    interestRate: 2,
    weeklyPayment: 2500,
    username: 'raju',
    password: customerPass,
  });

  await WeeklyPayment.create({
    client: client._id,
    weekStart: getWeekStart(),
    amount: client.weeklyPayment,
    paid: false,
  });

  console.log('Seed complete!');
  console.log('Manager: username=manager, password=manager123');
  console.log('Customer: username=raju, password=customer123');
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
