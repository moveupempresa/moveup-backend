require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();
const DB = process.env.MONGODB_URI;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;


mongoose.connect(DB).then(()=>{
    console.log('MongoDB Connected');
});

//start the server and listen on the specified port
app.listen(PORT,"0.0.0.0", function() {
    //LOG THE NUMBER
    console.log(`server is running on port ${PORT}`);
});
