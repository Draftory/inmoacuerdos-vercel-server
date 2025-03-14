const express = require('express');
const cors = require('cors');
const app = express();

const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));