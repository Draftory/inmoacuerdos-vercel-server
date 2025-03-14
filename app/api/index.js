const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());

app.use(cors({
  origin: [
    'https://www.inmoacuerdos.com',
    'https://inmoacuerdos.webflow.io'
  ]
}));

app.post('/app/api/1.00-locacion-post-draft-final', (req, res) => {
  console.log('Received data:', req.body);
  res.json({ message: 'Data received successfully!' });
});

module.exports = app;