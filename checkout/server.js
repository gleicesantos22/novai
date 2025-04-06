const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');
const csvWriter = require('csv-writer').createObjectCsvWriter;

// Hardcoded configuration values
const PORT = 3000;
const CARTPANDA_SHOP_SLUG = 'digital-help';

// Define up to 6 variant IDs here
const variantMapping = {
  1: 177341125,
  2: 177341188,
  3: 177341204,
  4: 177341301,
  5: 177341319,
  6: 177341398
};

// Initialize the app
const app = express();

// Enable CORS for any domain
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// For preflight requests using a proper wildcard route
app.options('/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  return res.sendStatus(200);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (if needed)
app.use(express.static(path.join(__dirname, 'public')));

// Security header
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Main checkout page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Database setup
let db;
async function initializeDatabase() {
  // Ensure the data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  db = await open({
    filename: path.join(dataDir, 'orders.db'),
    driver: sqlite3.Database
  });
  
  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      fullName TEXT NOT NULL,
      phoneNumber TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('Database initialized');
}

// Handle checkout form submission
app.post('/create-donation-order', async (req, res) => {
  try {
    const { email, fullName, phoneNumber, variantParam } = req.body;
    
    // Basic validation
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid email.' });
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ error: 'Missing or invalid full name.' });
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.status(400).json({ error: 'Missing or invalid phone number.' });
    }
    
    // Pick the appropriate variant ID based on the variantParam
    const variantIdNumber = parseInt(variantParam, 10);
    let chosenVariantId = variantMapping[variantIdNumber];

    // If variantParam is invalid or not in the mapping, default to the first variant
    if (!chosenVariantId) {
      chosenVariantId = variantMapping[1];
    }
    
    // Store order in database
    await db.run(
      'INSERT INTO orders (email, fullName, phoneNumber) VALUES (?, ?, ?)',
      [email, fullName, phoneNumber]
    );
    
    // Split full name for CartPanda
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = (nameParts.length > 1) ? nameParts.slice(1).join(' ') : '';
    
    // Encode parameters for URL
    const encodedEmail = encodeURIComponent(email);
    const encodedFirstName = encodeURIComponent(firstName);
    const encodedLastName = encodeURIComponent(lastName);
    const encodedPhoneNumber = encodeURIComponent(phoneNumber);
    
    // Build CartPanda checkout URL using the chosen variant ID
    const checkoutUrl = `https://${CARTPANDA_SHOP_SLUG}.mycartpanda.com/checkout/${chosenVariantId}:1?email=${encodedEmail}&first_name=${encodedFirstName}&last_name=${encodedLastName}&phone=${encodedPhoneNumber}`;
    
    return res.json({ checkoutUrl });
  } catch (error) {
    console.error('Error processing order:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin access page to view orders
app.get('/access', async (req, res) => {
  try {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Dashboard</title>
        <style>
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          }
          body {
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #333;
            margin-top: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f8f8f8;
          }
          tr:hover {
            background-color: #f1f1f1;
          }
          .btn {
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 16px;
          }
          .btn:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Order Dashboard</h1>
          <button id="downloadCsv" class="btn">Download as CSV</button>
          
          <table id="ordersTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Full Name</th>
                <th>Phone Number</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody id="ordersData">
              <!-- Data will be loaded here -->
            </tbody>
          </table>
        </div>
        
        <script>
          // Fetch orders when page loads
          document.addEventListener('DOMContentLoaded', function() {
            fetchOrders();
            
            // Set up download button
            document.getElementById('downloadCsv').addEventListener('click', function() {
              window.location.href = '/access/download-csv';
            });
          });
          
          // Function to fetch orders
          function fetchOrders() {
            fetch('/access/data')
              .then(response => response.json())
              .then(data => {
                const tbody = document.getElementById('ordersData');
                tbody.innerHTML = '';
                
                data.forEach(order => {
                  const row = document.createElement('tr');
                  
                  const idCell = document.createElement('td');
                  idCell.textContent = order.id;
                  row.appendChild(idCell);
                  
                  const emailCell = document.createElement('td');
                  emailCell.textContent = order.email;
                  row.appendChild(emailCell);
                  
                  const nameCell = document.createElement('td');
                  nameCell.textContent = order.fullName;
                  row.appendChild(nameCell);
                  
                  const phoneCell = document.createElement('td');
                  phoneCell.textContent = order.phoneNumber;
                  row.appendChild(phoneCell);
                  
                  const dateCell = document.createElement('td');
                  dateCell.textContent = new Date(order.timestamp).toLocaleString();
                  row.appendChild(dateCell);
                  
                  tbody.appendChild(row);
                });
              })
              .catch(error => {
                console.error('Error fetching orders:', error);
                alert('Failed to load orders. Please try again.');
              });
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error serving admin page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint to get orders data
app.get('/access/data', async (req, res) => {
  try {
    const orders = await db.all('SELECT * FROM orders ORDER BY timestamp DESC');
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to retrieve orders' });
  }
});

// Endpoint to download orders as CSV
app.get('/access/download-csv', async (req, res) => {
  try {
    const orders = await db.all('SELECT * FROM orders ORDER BY timestamp DESC');
    
    // Create a temporary file for the CSV
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const csvFilePath = path.join(tempDir, 'orders.csv');
    
    // Set up CSV writer
    const writer = csvWriter({
      path: csvFilePath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'email', title: 'Email' },
        { id: 'fullName', title: 'Full Name' },
        { id: 'phoneNumber', title: 'Phone Number' },
        { id: 'timestamp', title: 'Date' }
      ]
    });
    
    // Write records to CSV
    await writer.writeRecords(orders);
    
    // Send the file and delete it after sending
    res.download(csvFilePath, 'orders.csv', (err) => {
      if (fs.existsSync(csvFilePath)) {
        fs.unlinkSync(csvFilePath);
      }
      
      if (err) {
        console.error('Error downloading CSV:', err);
      }
    });
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).send('Failed to generate CSV file');
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
