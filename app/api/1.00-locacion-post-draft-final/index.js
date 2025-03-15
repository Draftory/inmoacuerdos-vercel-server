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
  },
  methods: ['GET', 'POST', 'OPTIONS'], // Add OPTIONS to allowed methods
};

app.use(cors(corsOptions));

// Example Route
app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

app.post('/api/data', (req, res) => {
  res.json({ message: 'Post request recieved' });
});

//No explicit handling of options needed, as the cors middleware now handles it.

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});