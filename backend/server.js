require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const managerRoutes = require('./routes/manager');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/manager', managerRoutes);

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lakshmi_ganapati')
  .then(() => {
    console.log('MongoDB connected');
    const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process or change PORT in .env`);
        console.error('Windows: netstat -ano | findstr :5000  then  taskkill /PID <pid> /F');
      } else {
        console.error(err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
