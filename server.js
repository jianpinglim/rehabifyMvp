const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

app.use((req, res, next) => {
  if (req.url.endsWith('.gz')) {
    res.set('Content-Encoding', 'gzip');
    res.set('Content-Type', 'application/javascript');
  }
  next();
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Serve the index.html file from the public directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});