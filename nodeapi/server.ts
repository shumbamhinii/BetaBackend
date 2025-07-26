import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import multer from 'multer';
/* import { v4 as uuidv4 } from 'uuid'; */ // Not used in this version

const app = express();
const PORT = 3000;
const PDFDocument = require('pdfkit'); // For PDF generation

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Enable JSON body parsing

const pool = new Pool({
  connectionString: 'postgresql://postgres:123qwe@localhost/q_analytix',
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    // Ensure client is defined before using it
    if (client) {
        client.query('SELECT NOW()', (queryErr, result) => {
            release();
            if (queryErr) {
                return console.error('Error executing query', queryErr.stack);
            }
            console.log('Connected to PostgreSQL database:', result.rows[0].now);
        });
    } else {
        release(); // Release the client even if it's undefined (shouldn't happen with successful connect)
        console.error('Client is undefined after successful pool.connect');
    }
});


app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() }); // Use memory storage for file uploads

/* --- Type Definitions (Minimal, but necessary for ts-node) --- */
/* Placing them here ensures they are available before the routes use them */

interface SupplierDB { // Represents how data comes from the DB (public.suppliers table)
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    vat_number: string | null; // Matches DB column name
    total_purchased: number; // Matches DB column name, NOT NULL with default 0.00
    created_at?: Date;
    updated_at?: Date;
}

// Utility function to map DB schema to frontend interface
const mapSupplierToFrontend = (supplier: SupplierDB) => ({
    id: supplier.id.toString(), // Convert number ID to string for React
    name: supplier.name,
    email: supplier.email || '', // Ensure it's a string, not null
    phone: supplier.phone || '',
    address: supplier.address || '',
    vatNumber: supplier.vat_number || '', // Map snake_case to camelCase
    totalPurchased: supplier.total_purchased, // Map snake_case to camelCase
});
// Add these interfaces and the mapping function near your SupplierDB and mapSupplierToFrontend

// Interface matching the public.products_services table structure
interface ProductDB {
    id: number;
    name: string;
    description: string | null;
    unit_price: number; // From DB
    cost_price: number | null;
    sku: string | null;
    is_service: boolean;
    stock_quantity: number; // From DB
    created_at: Date;
    updated_at: Date;
    tax_rate_id: number | null; // Foreign key
    category: string | null;
    unit: string | null;
    // Potentially include the tax rate itself from the joined table
    tax_rate_value?: number; // The actual rate (e.g., 0.15) from tax_rates table
}

// Interface for what the frontend expects (camelCase)
interface ProductFrontend {
    id: string; // React often prefers string IDs
    name: string;
    description: string; // Frontend might expect string, even if DB has null
    price: number;
    costPrice?: number; // Optional for frontend if not always displayed
    sku?: string; // Optional for frontend
    isService: boolean; // camelCase
    stock: number; // camelCase
    vatRate: number; // Actual percentage (e.g., 0.15)
    category: string;
    unit: string;
}

// Interface for what the frontend sends when creating/updating a product
// Note: id and totalPurchased (if any, though not for products) are excluded.
// vatRate is the *value*, not the ID.
interface CreateUpdateProductBody {
    name: string;
    description?: string;
    price: number; // Corresponds to unit_price
    costPrice?: number;
    sku?: string;
    isService?: boolean;
    stock?: number; // Corresponds to stock_quantity
    vatRate?: number; // The actual tax rate value (e.g., 0.15)
    category?: string;
    unit?: string;
}

// Helper function to map database product object to frontend product object
const mapProductToFrontend = (product: ProductDB): ProductFrontend => ({
    id: product.id.toString(),
    name: product.name,
    description: product.description || '', // Ensure it's a string for frontend
    price: Number(product.unit_price), // Convert numeric to number
    costPrice: product.cost_price ? Number(product.cost_price) : undefined,
    sku: product.sku || undefined,
    isService: product.is_service,
    stock: Number(product.stock_quantity), // Convert numeric to number
    vatRate: product.tax_rate_value !== undefined && product.tax_rate_value !== null ? Number(product.tax_rate_value) : 0, // Default to 0 if null/undefined
    category: product.category || '',
    unit: product.unit || '',
});
interface CustomerDB {
    id: number;
    name: string;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    tax_id: string | null; // Matches DB column name
    total_invoiced: number; // Matches DB column name
    created_at?: Date;
    updated_at?: Date;
}

// Interface for what the frontend expects (camelCase)
interface CustomerFrontend {
    id: string; // React often prefers string IDs
    name: string;
    email: string;
    phone: string;
    address: string;
    vatNumber: string; // camelCase, maps to tax_id
    totalInvoiced: number; // camelCase, maps to total_invoiced
}

// Interface for what the frontend sends when creating/updating a customer
// contactPerson and vatNumber are camelCase for frontend consistency
interface CreateUpdateCustomerBody {
    name: string;
    contactPerson?: string; // Maps to contact_person
    email?: string;
    phone?: string;
    address?: string;
    vatNumber?: string; // Maps to tax_id
}

// Helper function to map database customer object to frontend customer object
const mapCustomerToFrontend = (customer: CustomerDB): CustomerFrontend => ({
    id: customer.id.toString(), // Convert number ID to string
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    vatNumber: customer.tax_id || '', // Map tax_id to vatNumber
    totalInvoiced: Number(customer.total_invoiced), // Ensure it's a number
});
 export interface ProductService {
  id: string;
  name: string;
  description: string;
  price: number; // This is 'price' (number) from ProductFrontend, not 'unit_price' (string) from DB
  costPrice?: number;
  sku?: string;
  isService: boolean;
  stock: number;
  vatRate: number; // Decimal (e.g., 0.15)
  category: string;
  unit: string;
}





/* --- Transactions API (Fetching) --- */
app.get('/transactions', async (req, res) => {
  const { filter, search, fromDate, toDate } = req.query; // Get query parameters

  // --- NEW VALIDATION ---
  // This block checks if fromDate is after toDate. If so, it returns an empty array
  // gracefully, preventing a server error from an invalid date range query to the DB.
  if (fromDate && toDate && typeof fromDate === 'string' && typeof toDate === 'string') {
    const parsedFromDate = new Date(fromDate);
    const parsedToDate = new Date(toDate);
    if (parsedFromDate > parsedToDate) {
      console.warn(`Invalid date range requested: fromDate (${fromDate}) is after toDate (${toDate}). Returning empty transactions.`);
      return res.json([]); // Return empty array and exit
    }
  }
  // --- END NEW VALIDATION ---

  let query = `
    SELECT
      t.id,
      t.type,
      t.amount,
      t.description,
      t.date,
      t.category,
      t.created_at,
      t.account_id,
      t.original_text, 
      t.source,        
      t.confirmed,     
      acc.name AS account_name 
    FROM
      transactions t
    LEFT JOIN
      accounts acc ON t.account_id = acc.id
    WHERE 1=1 
  `;

  const queryParams: (string | number)[] = [];
  let paramIndex = 1;

  if (filter && typeof filter === 'string') {
    // Map frontend filter values to backend category values if they differ.
    // Assuming a direct mapping for now, but adjust if your 'category' column
    // in transactions table has different actual values.
    query += ` AND t.category = $${paramIndex++}`;
    queryParams.push(filter); // Or map: e.g., map 'trading-income' to 'Trading Income'
  }

  if (search && typeof search === 'string') {
    // Search across description, transaction type, or account name
    query += ` AND (t.description ILIKE $${paramIndex} OR t.type ILIKE $${paramIndex} OR acc.name ILIKE $${paramIndex})`;
    queryParams.push(`%${search}%`);
  }

  if (fromDate && typeof fromDate === 'string') {
    query += ` AND t.date >= $${paramIndex++}`;
    queryParams.push(fromDate);
  }

  if (toDate && typeof toDate === 'string') {
    query += ` AND t.date <= $${paramIndex++}`;
    queryParams.push(toDate);
  }

  query += ` ORDER BY t.date DESC, t.created_at DESC`; // Order by date, then creation time

  try {
    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', detail: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/transactions/manual', async (req, res) => {
  const { id, type, amount, description, date, category, account_id, original_text, source, confirmed } = req.body; // Now expecting 'id', 'original_text', 'source', 'confirmed' as well

  if (!type || !amount || !date) {
    return res.status(400).json({ detail: 'type, amount, and date are required' });
  }

  try {
    let result;
    if (id) {
      // If ID is provided, perform an UPDATE
      result = await pool.query(
        `UPDATE transactions
         SET
           "type" = $1,
           amount = $2,
           description = $3,
           "date" = $4,
           category = $5,
           account_id = $6,
           original_text = $7, // Added
           source = $8,        // Added
           confirmed = $9      // Added
         WHERE id = $10
         RETURNING id, "type", amount, description, "date", category, account_id, created_at, original_text, source, confirmed`,
        [type, amount, description || null, date, category || null, account_id || null, original_text || null, source || 'manual', confirmed !== undefined ? confirmed : true, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found for update' });
      }
    } else {
      // If no ID, perform an INSERT
      result = await pool.query(
        `INSERT INTO transactions ("type", amount, description, "date", category, account_id, original_text, source, confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, "type", amount, description, "date", category, account_id, created_at, original_text, source, confirmed`,
        [type, amount, description || null, date, category || null, account_id || null, original_text || null, source || 'manual', confirmed !== undefined ? confirmed : true]
      );
    }

    // Fetch the full transaction with account_name for consistent response
    const fullTransaction = await pool.query(`
      SELECT
        t.id, t.type, t.amount, t.description, t.date, t.category, t.created_at, t.account_id, t.original_text, t.source, t.confirmed, acc.name AS account_name
      FROM
        transactions t
      LEFT JOIN
        accounts acc ON t.account_id = acc.id
      WHERE t.id = $1
    `, [result.rows[0].id]);

    res.json(fullTransaction.rows[0]); // Return the full updated/inserted transaction
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('DB operation error:', error);
    res.status(500).json({ detail: 'Failed to perform transaction operation', error: error instanceof Error ? error.message : String(error) });
  }
});
/* --- Accounts API --- */
app.get('/accounts', async (req, res) => {
  try {
    // Select 'type' and 'code' to match frontend's expected Account interface
    const result = await pool.query('SELECT id, name, type, code FROM accounts ORDER BY id');
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts', detail: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/accounts', async (req, res) => {
  // Expect 'type', 'name', and 'code' from the frontend
  const { type, name, code } = req.body;

  // Validate all required fields based on your DB schema
  if (!type || !name || !code) {
    return res.status(400).json({ error: 'Missing required account fields: type, name, code' });
  }

  try {
    const insert = await pool.query(
      // Insert into 'type', 'name', 'code' columns
      `INSERT INTO accounts (type, name, code) VALUES ($1, $2, $3) RETURNING id`,
      [type, name, code]
    );
    const insertedId = insert.rows[0].id;

    const fullAccount = await pool.query(
      // Select the inserted account, including 'type' and 'code'
      `SELECT id, name, type, code FROM accounts WHERE id = $1`,
      [insertedId]
    );
    res.json(fullAccount.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error adding account:', error);
    res.status(500).json({ error: 'Failed to add account', detail: error instanceof Error ? error.message : String(error) });
  }
});


/* --- Assets API --- */

// Updated Asset Interface to include depreciation fields
interface Asset {
  id: string;
  type: string;
  name: string;
  number?: string;
  cost: number;
  date_received: string;
  account_id: string;
  account_name: string;
  depreciation_method?: string; // New
  useful_life_years?: number;   // New
  salvage_value?: number;       // New
  accumulated_depreciation: number; // New
  last_depreciation_date?: string; // New
}

app.get('/assets', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.type,
        a.name,
        a.number,
        a.cost,
        a.date_received,
        a.account_id,
        acc.name AS account_name,
        a.depreciation_method,      
        a.useful_life_years,        
        a.salvage_value,            
        a.accumulated_depreciation, 
        a.last_depreciation_date    
      FROM assets a
      JOIN accounts acc ON a.account_id = acc.id
      ORDER BY a.date_received DESC
    `);
    res.json(result.rows);
  } catch (error: unknown) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets', detail: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/assets', async (req, res) => {
  const {
    type, name, number, cost, date_received, account_id,
    depreciation_method, useful_life_years, salvage_value
  } = req.body;

  if (!type || !name || cost == null || !date_received || !account_id) {
    return res.status(400).json({ error: 'Missing required asset fields: type, name, cost, date_received, account_id' });
  }

  try {
    const insert = await pool.query(
      `INSERT INTO assets (
        type, name, number, cost, date_received, account_id,
        depreciation_method, useful_life_years, salvage_value, accumulated_depreciation, last_depreciation_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        type, name, number || null, cost, date_received, account_id,
        depreciation_method || null, useful_life_years || null, salvage_value || null,
        0.00, // Initialize accumulated_depreciation to 0
        null  // Initialize last_depreciation_date to null
      ]
    );
    const insertedId = insert.rows[0].id;

    const fullAsset = await pool.query(`
      SELECT
        a.id, a.type, a.name, a.number, a.cost, a.date_received, a.account_id, acc.name AS account_name,
        a.depreciation_method, a.useful_life_years, a.salvage_value, a.accumulated_depreciation, a.last_depreciation_date
      FROM assets a
      JOIN accounts acc ON a.account_id = acc.id
      WHERE a.id = $1
    `, [insertedId]);

    res.json(fullAsset.rows[0]);
  } catch (error: unknown) {
    console.error('Error adding asset:', error);
    res.status(500).json({ error: 'Failed to add asset', detail: error instanceof Error ? error.message : String(error) });
  }
});

app.put('/assets/:id', async (req, res) => {
  const { id } = req.params;
  const {
    type, name, number, cost, date_received, account_id,
    depreciation_method, useful_life_years, salvage_value, accumulated_depreciation, last_depreciation_date
  } = req.body;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (type !== undefined) { updates.push(`type = $${paramIndex++}`); values.push(type); }
  if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
  if (number !== undefined) { updates.push(`number = $${paramIndex++}`); values.push(number || null); }
  if (cost !== undefined) { updates.push(`cost = $${paramIndex++}`); values.push(cost); }
  if (date_received !== undefined) { updates.push(`date_received = $${paramIndex++}`); values.push(date_received); }
  if (account_id !== undefined) { updates.push(`account_id = $${paramIndex++}`); values.push(account_id); }
  if (depreciation_method !== undefined) { updates.push(`depreciation_method = $${paramIndex++}`); values.push(depreciation_method || null); }
  if (useful_life_years !== undefined) { updates.push(`useful_life_years = $${paramIndex++}`); values.push(useful_life_years || null); }
  if (salvage_value !== undefined) { updates.push(`salvage_value = $${paramIndex++}`); values.push(salvage_value || null); }
  if (accumulated_depreciation !== undefined) { updates.push(`accumulated_depreciation = $${paramIndex++}`); values.push(accumulated_depreciation); }
  if (last_depreciation_date !== undefined) { updates.push(`last_depreciation_date = $${paramIndex++}`); values.push(last_depreciation_date || null); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields provided for update.' });
  }

  values.push(id); // Add ID for WHERE clause

  try {
    const result = await pool.query(
      `UPDATE assets SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Failed to update asset', detail: error instanceof Error ? error.message : String(error) });
  }
});


/* --- Depreciation API --- */

// Helper function to calculate straight-line depreciation for a period
const calculateDepreciation = (
  cost: number,
  salvageValue: number,
  usefulLifeYears: number,
  startDate: Date,
  endDate: Date
): number => {
  if (usefulLifeYears <= 0) return 0;

  const depreciableBase = cost - salvageValue;
  const annualDepreciation = depreciableBase / usefulLifeYears;
  const monthlyDepreciation = annualDepreciation / 12;

  // Calculate number of months in the period
  let monthsToDepreciate = 0;
  let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (currentMonth <= endDate) {
    monthsToDepreciate++;
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  return monthlyDepreciation * monthsToDepreciate;
};


app.post('/api/depreciation/run', async (req, res) => {
  const { endDate } = req.body; // endDate: The date up to which depreciation should be calculated

  if (!endDate) {
    return res.status(400).json({ error: 'endDate is required for depreciation calculation.' });
  }

  const calculationEndDate = new Date(endDate);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Fetch all assets that are depreciable and haven't been depreciated up to the endDate
    const assetsResult = await client.query(`
      SELECT
        id, cost, useful_life_years, salvage_value, date_received, accumulated_depreciation, last_depreciation_date
      FROM assets
      WHERE
        depreciation_method = 'straight-line' AND useful_life_years IS NOT NULL AND useful_life_years > 0
        AND (last_depreciation_date IS NULL OR last_depreciation_date < $1)
    `, [calculationEndDate.toISOString().split('T')[0]]); // Compare only date part

    const depreciatedAssets: { assetId: number; amount: number; transactionId: number }[] = [];
    let totalDepreciationExpense = 0;
    let defaultExpenseAccountId: number | null = null;

    // Try to find a suitable account for depreciation expense (e.g., 'Depreciation Expense' or 'Other Expenses')
    const expenseAccountResult = await client.query(
      `SELECT id FROM accounts WHERE name ILIKE 'Depreciation Expense' OR name ILIKE 'Other Expenses' LIMIT 1`
    );
    if (expenseAccountResult.rows.length > 0) {
      defaultExpenseAccountId = expenseAccountResult.rows[0].id;
    } else {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Could not find a suitable expense account for depreciation.' });
    }

    for (const asset of assetsResult.rows) {
      const assetCost = parseFloat(asset.cost);
      const assetSalvageValue = parseFloat(asset.salvage_value || 0);
      const assetUsefulLifeYears = parseInt(asset.useful_life_years, 10);
      const assetDateReceived = new Date(asset.date_received);
      const assetLastDepreciationDate = asset.last_depreciation_date ? new Date(asset.last_depreciation_date) : null;

      // Determine the start date for this depreciation calculation
      // It's either the day after last_depreciation_date, or date_received if no prior depreciation
      let depreciationStartDate = assetLastDepreciationDate
        ? new Date(assetLastDepreciationDate.getFullYear(), assetLastDepreciationDate.getMonth(), assetLastDepreciationDate.getDate() + 1)
        : assetDateReceived;

      // Ensure depreciation doesn't start before the asset was received
      if (depreciationStartDate < assetDateReceived) {
        depreciationStartDate = assetDateReceived;
      }

      // Ensure we don't depreciate beyond the useful life
      const usefulLifeEndDate = new Date(assetDateReceived.getFullYear() + assetUsefulLifeYears, assetDateReceived.getMonth(), assetDateReceived.getDate());
      if (depreciationStartDate >= usefulLifeEndDate) {
          console.log(`Asset ${asset.id} has reached end of useful life or already fully depreciated.`);
          continue; // Skip if already fully depreciated or beyond useful life
      }

      // Adjust calculationEndDate if it's beyond the useful life end date
      let effectiveCalculationEndDate = calculationEndDate;
      if (effectiveCalculationEndDate > usefulLifeEndDate) {
          effectiveCalculationEndDate = usefulLifeEndDate;
      }

      // Calculate depreciation only if the period is valid
      if (depreciationStartDate <= effectiveCalculationEndDate) {
        const depreciationAmount = calculateDepreciation(
          assetCost,
          assetSalvageValue,
          assetUsefulLifeYears,
          depreciationStartDate,
          effectiveCalculationEndDate
        );

        if (depreciationAmount > 0) {
          // 1. Update accumulated_depreciation on the asset
          const newAccumulatedDepreciation = parseFloat(asset.accumulated_depreciation) + depreciationAmount;
          await client.query(
            `UPDATE assets SET accumulated_depreciation = $1, last_depreciation_date = $2 WHERE id = $3`,
            [newAccumulatedDepreciation, effectiveCalculationEndDate.toISOString().split('T')[0], asset.id]
          );

          // 2. Create a transaction for depreciation expense
          const transactionResult = await client.query(
            `INSERT INTO transactions (type, amount, description, date, category, account_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
              'expense',
              depreciationAmount,
              `Depreciation Expense for ${asset.name} (ID: ${asset.id})`,
              effectiveCalculationEndDate.toISOString().split('T')[0], // Use end date of calculation period
              'Depreciation Expense', // Use a specific category for depreciation
              defaultExpenseAccountId // Link to a general expense account
            ]
          );
          const transactionId = transactionResult.rows[0].id;

          // 3. Record the depreciation entry
          await client.query(
            `INSERT INTO depreciation_entries (asset_id, depreciation_date, amount, transaction_id)
             VALUES ($1, $2, $3, $4)`,
            [asset.id, effectiveCalculationEndDate.toISOString().split('T')[0], depreciationAmount, transactionId]
          );

          totalDepreciationExpense += depreciationAmount;
          depreciatedAssets.push({ assetId: asset.id, amount: depreciationAmount, transactionId: transactionId });
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      message: 'Depreciation calculated and recorded successfully.',
      totalDepreciationExpense: totalDepreciationExpense,
      depreciatedAssets: depreciatedAssets
    });

  } catch (error: unknown) {
    await client.query('ROLLBACK');
    console.error('Error running depreciation:', error);
    res.status(500).json({ error: 'Failed to run depreciation', detail: error instanceof Error ? error.message : String(error) });
  } finally {
    client.release();
  }
});


/* --- Expenses API --- */
app.get('/expenses', async (req, res) => {
  try {
    // Select all fields relevant for an expense transaction + account_name
    const result = await pool.query(`
      SELECT e.id, e.name, e.details, e.category, e.amount, e.date, e.account_id, acc.name AS account_name
      FROM expenses e
      JOIN accounts acc ON e.account_id = acc.id
      ORDER BY e.date DESC
    `);
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses', detail: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/expenses', async (req, res) => {
  // Ensure all required fields for an expense transaction are captured
  const { name, details, category, amount, date, account_id } = req.body;

  if (!name || amount == null || !date || !account_id) {
    return res.status(400).json({ error: 'Missing required expense fields: name, amount, date, account_id' });
  }

  try {
    const insert = await pool.query(
      `INSERT INTO expenses (name, details, category, amount, date, account_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      // Ensure details and category are correctly handled for nullable columns
      [name, details || null, category || null, amount, date, account_id]
    );
    const insertedId = insert.rows[0].id;

    const fullExpense = await pool.query(`
      SELECT e.id, e.name, e.details, e.category, e.amount, e.date, e.account_id, acc.name AS account_name
      FROM expenses e
      JOIN accounts acc ON e.account_id = acc.id
      WHERE e.id = $1
    `, [insertedId]);

    res.json(fullExpense.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error adding expense:', error);
    res.status(500).json({ error: 'Failed to add expense', detail: error instanceof Error ? error.message : String(error) });
  }
});

// NEW: PUT Update Expense
app.put('/expenses/:id', async (req, res) => {
  const { id } = req.params;
  const { name, details, category, amount, date, account_id } = req.body;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
  if (details !== undefined) { updates.push(`details = $${paramIndex++}`); values.push(details || null); }
  if (category !== undefined) { updates.push(`category = $${paramIndex++}`); values.push(category || null); }
  if (amount !== undefined) { updates.push(`amount = $${paramIndex++}`); values.push(amount); }
  if (date !== undefined) { updates.push(`date = $${paramIndex++}`); values.push(date); }
  if (account_id !== undefined) { updates.push(`account_id = $${paramIndex++}`); values.push(account_id); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields provided for update.' });
  }

  values.push(id); // Add ID for WHERE clause

  try {
    const result = await pool.query(
      `UPDATE expenses SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    // Fetch with account_name for consistent response
    const fullExpense = await pool.query(`
      SELECT e.id, e.name, e.details, e.category, e.amount, e.date, e.account_id, acc.name AS account_name
      FROM expenses e
      JOIN accounts acc ON e.account_id = acc.id
      WHERE e.id = $1
    `, [id]); // Use the ID from params directly

    res.json(fullExpense.rows[0]);
  } catch (error: unknown) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense', detail: error instanceof Error ? error.message : String(error) });
  }
});

// NEW: DELETE Expense
app.delete('/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense', detail: error instanceof Error ? error.message : String(error) });
  }
});

/* --- File upload & processing --- */
app.post('/transactions/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No file uploaded' });
  }
  res.json({ message: 'File uploaded and processed (stub)' });
});

/* --- Text description processing (UPDATED to use Gemini API) --- */
app.post('/transactions/process-text', async (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ detail: 'Description is required' });
  }

  try {
    // Fetch all existing account names and categories to guide the LLM
    const accountsResult = await pool.query('SELECT name FROM accounts');
    const categoriesResult = await pool.query('SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL');

    const accountNames = accountsResult.rows.map(row => row.name);
    const existingCategories = categoriesResult.rows.map(row => row.category);

    const prompt = `Extract transaction details from the following text.
    
    Text: "${description}"
    
    Rules for extraction:
    - Determine if the transaction is 'income' or 'expense'.
    - Extract the numerical 'amount'.
    - Extract the 'date' in YYYY-MM-DD format. If no year is specified, assume the current year (${new Date().getFullYear()}). If no day or month is specified, assume the current month and day.
    - Assign a relevant 'category' from the following list if applicable, otherwise suggest a new, concise, and appropriate accounting category: ${JSON.stringify(existingCategories)}. Common categories include: 'Sales Revenue', 'Fuel Expense', 'Salaries and Wages Expense', 'Rent Expense', 'Utilities Expense', 'Bank Charges & Fees', 'Interest Income', 'Projects Expenses', 'Accounting Fees Expense', 'Repairs & Maintenance Expense', 'Communication Expense', 'Miscellaneous Expense', 'Owner's Capital'.
    - Provide a concise 'description' of the transaction.
    - Identify the 'account' where the money moved (e.g., 'Bank', 'Cash'). If not explicitly mentioned, assume 'Bank'.
    
    Output the result as a JSON object with the following schema:
    `;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING", enum: ["income", "expense"] },
            amount: { type: "NUMBER" },
            date: { type: "STRING", format: "date" },
            category: { type: "STRING" },
            description: { type: "STRING" },
            account: { type: "STRING" }
          },
          required: ["type", "amount", "date", "category", "description", "account"]
        }
      }
    };

    const apiKey = ""; // Canvas will provide this at runtime
    const apiUrl = `https://generativelanguage.googleapis.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const llmResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await llmResponse.json();

    if (!result.candidates || result.candidates.length === 0 || !result.candidates[0].content || !result.candidates[0].content.parts || result.candidates[0].content.parts.length === 0) {
      throw new Error('LLM response structure is unexpected or content is missing.');
    }

    const extractedData = JSON.parse(result.candidates[0].content.parts[0].text);

    // Look up account_id based on the extracted account name
    const accountLookupResult = await pool.query('SELECT id FROM accounts WHERE name ILIKE $1', [extractedData.account]);
    let account_id: number | null = null;

    if (accountLookupResult.rows.length > 0) {
      account_id = accountLookupResult.rows[0].id;
    } else {
      // If account not found, try to find a default 'Bank' account
      const defaultBankResult = await pool.query('SELECT id FROM accounts WHERE name ILIKE $1 LIMIT 1', ['%bank%']);
      if (defaultBankResult.rows.length > 0) {
        account_id = defaultBankResult.rows[0].id;
      } else {
        // Fallback if no 'Bank' account exists, or handle as an error
        console.warn(`Account '${extractedData.account}' not found, and no default 'Bank' account. Transaction will be returned without account_id.`);
      }
    }

    // Prepare the response for the frontend
    res.json({
      type: extractedData.type,
      amount: extractedData.amount,
      date: extractedData.date,
      category: extractedData.category,
      description: extractedData.description,
      account_id: account_id, // Send the looked-up ID
      account_name: extractedData.account // Send the name for display
    });

  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error processing text with LLM:', error);
    res.status(500).json({ detail: 'Failed to process text description', error: error instanceof Error ? error.message : String(error) });
  }
});

/* --- Audio upload & processing --- */
app.post('/transactions/process-audio', upload.single('audio_file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No audio file uploaded' });
  }

  // In a real application, you would send the audio file to a speech-to-text service
  // and then send the transcribed text to the /transactions/process-text endpoint.
  // For now, we'll just return a stub message.
  res.json({ message: 'Audio uploaded and processed (stub)' });
});
// POST Customer
app.post('/customers', async (req, res) => {
  const { name, contact_person, email, phone, address, tax_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  try {
    const result = await pool.query(
      `INSERT INTO customers (name, contact_person, email, phone, address, tax_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, contact_person || null, email || null, phone || null, address || null, tax_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error adding customer:', error);
    res.status(500).json({ error: 'Failed to add customer', detail: error instanceof Error ? error.message : String(error) });
  }
});
/* --- Customer API Endpoints --- */

// GET All Customers (with optional search filter for the main table)
// This endpoint will be used by CustomerManagement for its main list and search input

app.get('/api/customers', async (req, res) => {
    const searchTerm = req.query.search as string | undefined;

    let query = `
        SELECT
            c.id,
            c.name,
            c.contact_person,
            c.email,
            c.phone,
            c.address,
            c.tax_id,
            COALESCE(SUM(i.total_amount), 0.00) AS total_invoiced /* Calculate total_invoiced */
        FROM
            public.customers c
        LEFT JOIN
            public.invoices i ON c.id = i.customer_id
        WHERE 1=1 /* A trick to easily append conditions */
    `;
    const queryParams: (string | number)[] = [];
    let paramIndex = 1;

    if (searchTerm) {
        query += ` AND (LOWER(c.name) ILIKE $${paramIndex} OR LOWER(c.email) ILIKE $${paramIndex})`;
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
    }

    query += `
        GROUP BY
            c.id, c.name, c.contact_person, c.email, c.phone, c.address, c.tax_id
        ORDER BY
            c.name ASC;
    `;

    try {
        // We use CustomerDB here because the query returns snake_case columns
        const { rows } = await pool.query<CustomerDB>(query, queryParams);
        const formattedRows = rows.map(mapCustomerToFrontend); // Map to frontend camelCase
        res.json(formattedRows);
    } catch (error: unknown) { // Explicitly type error as unknown
        console.error('Error fetching all customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Customers by Search Query (Still useful for specific search-as-you-type components if needed elsewhere)
// This endpoint is less critical for CustomerManagement as the main GET /api/customers handles search.
// You can keep this if other parts of your app specifically rely on it returning only ID and name.
app.get('/api/customers/search', async (req, res) => { // Changed path to /api/customers/search
    const query = req.query.query as string | undefined;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }
    const searchTerm = `%${query.toLowerCase()}%`; // Already asserted as string or undefined above

    try {
        const result = await pool.query(
            `SELECT id, name FROM public.customers WHERE LOWER(name) LIKE $1 ORDER BY name`,
            [searchTerm]
        );
        // Note: This returns only id and name, not full CustomerFrontend object
        res.json(result.rows.map(row => ({ id: row.id.toString(), name: row.name })));
    } catch (error: unknown) {
        console.error('Error searching customers:', error);
        res.status(500).json({ error: 'Failed to search customers', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Single Customer by ID
app.get('/api/customers/:id', async (req, res) => { // Changed path to /api/customers/:id
    const { id } = req.params;
    try {
        const result = await pool.query<CustomerDB>('SELECT id, name, contact_person, email, phone, address, tax_id, total_invoiced FROM public.customers WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(mapCustomerToFrontend(result.rows[0]));
    } catch (error: unknown) {
        console.error('Error fetching customer by ID:', error);
        res.status(500).json({ error: 'Failed to fetch customer', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create Customer
app.post('/api/customers', async (req, res) => { // Changed path to /api/customers
    const { name, contactPerson, email, phone, address, vatNumber }: CreateUpdateCustomerBody = req.body;

    if (!name) { // Name is NOT NULL in DB
        return res.status(400).json({ error: 'Customer name is required' });
    }

    try {
        const result = await pool.query<CustomerDB>(
            `INSERT INTO public.customers (name, contact_person, email, phone, address, tax_id, total_invoiced)
             VALUES ($1, $2, $3, $4, $5, $6, 0.00) RETURNING id, name, contact_person, email, phone, address, tax_id, total_invoiced`,
            [name, contactPerson || null, email || null, phone || null, address || null, vatNumber || null]
        );
        res.status(201).json(mapCustomerToFrontend(result.rows[0]));
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error adding customer:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') { // Unique violation (e.g., duplicate email)
            return res.status(409).json({ error: 'A customer with this email or VAT number already exists.' });
        }
        res.status(500).json({ error: 'Failed to add customer', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT Update Customer
app.put('/api/customers/:id', async (req, res) => { // New endpoint
    const { id } = req.params;
    const { name, contactPerson, email, phone, address, vatNumber }: CreateUpdateCustomerBody = req.body;

    if (!name) { // Name is required for update
        return res.status(400).json({ error: 'Customer name is required for update.' });
    }

    try {
        const result = await pool.query<CustomerDB>(
            `UPDATE public.customers
             SET name = $1, contact_person = $2, email = $3, phone = $4, address = $5, tax_id = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 RETURNING id, name, contact_person, email, phone, address, tax_id, total_invoiced`,
            [name, contactPerson || null, email || null, phone || null, address || null, vatNumber || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found.' });
        }
        res.json(mapCustomerToFrontend(result.rows[0]));
    } catch (error: unknown) {
        console.error(`Error updating customer with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'A customer with this email or VAT number already exists.' });
        }
        res.status(500).json({ error: 'Failed to update customer', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE Customer
app.delete('/api/customers/:id', async (req, res) => { // New endpoint
    const { id } = req.params;

    try {
        const { rowCount } = await pool.query(
            'DELETE FROM public.customers WHERE id = $1',
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Customer not found.' });
        }
        res.status(204).send(); // No Content for successful deletion
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error(`Error deleting customer with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error && error.code === '23503') { // Foreign key violation (if customer is referenced)
            return res.status(409).json({
                error: 'Cannot delete customer: associated with existing invoices or other records.',
                detail: error.message
            });
        }
        res.status(500).json({ error: 'Failed to delete customer', detail: error instanceof Error ? error.message : String(error) });
    }
});
// GET Vendors
app.get('/vendors', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, contact_person, email, phone, address, tax_id FROM vendors ORDER BY name');
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors', detail: error instanceof Error ? error.message : String(error) });
  }
});

// POST Vendor
app.post('/vendors', async (req, res) => {
  const { name, contact_person, email, phone, address, tax_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Vendor name is required' });

  try {
    const result = await pool.query(
      `INSERT INTO vendors (name, contact_person, email, phone, address, tax_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, contact_person || null, email || null, phone || null, address || null, tax_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error adding vendor:', error);
    res.status(500).json({ error: 'Failed to add vendor', detail: error instanceof Error ? error.message : String(error) });
  }
});

// GET Products/Services
app.get('/products-services', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description, unit_price, cost_price, sku, is_service, stock_quantity FROM products_services ORDER BY name');
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error fetching products/services:', error);
    res.status(500).json({ error: 'Failed to fetch products/services', detail: error instanceof Error ? error.message : String(error) });
  }
});

// POST Product/Service
app.post('/products-services', async (req, res) => {
  const { name, description, unit_price, cost_price, sku, is_service, stock_quantity } = req.body;
  if (!name || unit_price == null) {
    return res.status(400).json({ error: 'Product/Service name and unit_price are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products_services (name, description, unit_price, cost_price, sku, is_service, stock_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description || null, unit_price, cost_price || null, sku || null, is_service || false, stock_quantity || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Error adding product/service:', error);
    res.status(500).json({ error: 'Failed to add product/service', detail: error instanceof Error ? error.message : String(error) });
  }
});


/* --- Invoice API Endpoints --- */

// GET All Invoices (List View)
app.get('/api/invoices', async (req, res) => { // Changed path to /api/invoices
    try {
        const result = await pool.query(`
            SELECT
                i.id,
                i.invoice_number,
                i.invoice_date,
                i.due_date,
                i.total_amount,
                i.status,
                i.currency,
                c.name AS customer_name,
                c.id AS customer_id
            FROM public.invoices i
            JOIN public.customers c ON i.customer_id = c.id
            ORDER BY i.invoice_date DESC, i.invoice_number DESC
        `);
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching invoices:', error);
        res.status(500).json({ error: 'Failed to fetch invoices', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Single Invoice with Line Items
app.get('/api/invoices/:id', async (req, res) => { // Changed path to /api/invoices/:id
    const { id } = req.params;
    try {
        const invoiceResult = await pool.query(`
            SELECT
                i.id,
                i.invoice_number,
                i.customer_id,
                c.name AS customer_name,
                c.email AS customer_email,
                c.phone AS customer_phone,
                c.address AS customer_address,
                i.invoice_date,
                i.due_date,
                i.total_amount,
                i.status,
                i.currency,
                i.notes,
                i.created_at,
                i.updated_at
            FROM public.invoices i
            JOIN public.customers c ON i.customer_id = c.id
            WHERE i.id = $1
        `, [id]);

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const lineItemsResult = await pool.query(`
            SELECT
                ili.id,
                ili.product_service_id,
                ps.name AS product_service_name,
                ili.description,
                ili.quantity,
                ili.unit_price,
                ili.line_total,
                ili.tax_rate
            FROM public.invoice_line_items ili
            LEFT JOIN public.products_services ps ON ili.product_service_id = ps.id
            WHERE ili.invoice_id = $1
            ORDER BY ili.id
        `, [id]);

        const invoice = invoiceResult.rows[0];
        invoice.line_items = lineItemsResult.rows;

        res.json(invoice);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching invoice:', error);
        res.status(500).json({ error: 'Failed to fetch invoice', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create Invoice
app.post('/api/invoices', async (req, res) => { // Changed path to /api/invoices
    const { invoice_number, customer_id, customer_name, invoice_date, due_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!invoice_number || !invoice_date || !due_date || total_amount == null || !line_items || line_items.length === 0) {
        return res.status(400).json({ error: 'Missing required invoice fields or line items' });
    }

    if (!customer_id && (!customer_name || customer_name.trim() === '')) {
        return res.status(400).json({ error: 'Customer ID or Customer Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalCustomerId = customer_id;

        if (!finalCustomerId) {
            const existingCustomerResult = await client.query('SELECT id FROM public.customers WHERE LOWER(name) = LOWER($1)', [customer_name.trim()]);

            if (existingCustomerResult.rows.length > 0) {
                finalCustomerId = existingCustomerResult.rows[0].id;
            } else {
                const newCustomerResult = await client.query(
                    `INSERT INTO public.customers (name, total_invoiced) VALUES ($1, 0.00) RETURNING id`,
                    [customer_name.trim()]
                );
                finalCustomerId = newCustomerResult.rows[0].id;
            }
        }

        const invoiceResult = await client.query(
            `INSERT INTO public.invoices (invoice_number, customer_id, invoice_date, due_date, total_amount, status, currency, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [invoice_number, finalCustomerId, invoice_date, due_date, total_amount, status || 'Draft', currency || 'ZAR', notes || null]
        );
        const invoiceId = invoiceResult.rows[0].id;

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_price == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await client.query(
                `INSERT INTO public.invoice_line_items (invoice_id, product_service_id, description, quantity, unit_price, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [invoiceId, item.product_service_id || null, item.description, item.quantity, item.unit_price, item.line_total, item.tax_rate || 0.00]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: invoiceId, message: 'Invoice created successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error creating invoice:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Invoice number already exists.' });
        }
        res.status(500).json({ error: 'Failed to create invoice', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// PUT Update Invoice
app.put('/api/invoices/:id', async (req, res) => { // Changed path to /api/invoices/:id
    const { id } = req.params;
    const { invoice_number, customer_id, customer_name, invoice_date, due_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!invoice_number || !invoice_date || !due_date || total_amount == null || !line_items) {
        return res.status(400).json({ error: 'Missing required invoice fields or line items' });
    }

    if (!customer_id && (!customer_name || customer_name.trim() === '')) {
        return res.status(400).json({ error: 'Customer ID or Customer Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalCustomerId = customer_id;

        if (!finalCustomerId) {
            const existingCustomerResult = await client.query('SELECT id FROM public.customers WHERE LOWER(name) = LOWER($1)', [customer_name.trim()]);

            if (existingCustomerResult.rows.length > 0) {
                finalCustomerId = existingCustomerResult.rows[0].id;
            } else {
                const newCustomerResult = await client.query(
                    `INSERT INTO public.customers (name, total_invoiced) VALUES ($1, 0.00) RETURNING id`,
                    [customer_name.trim()]
                );
                finalCustomerId = newCustomerResult.rows[0].id;
            }
        }

        const updateInvoiceResult = await client.query(
            `UPDATE public.invoices
             SET
               invoice_number = $1,
               customer_id = $2,
               invoice_date = $3,
               due_date = $4,
               total_amount = $5,
               status = $6,
               currency = $7,
               notes = $8,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING id`,
            [invoice_number, finalCustomerId, invoice_date, due_date, total_amount, status, currency || 'ZAR', notes || null, id]
        );

        if (updateInvoiceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Invoice not found for update' });
        }

        await client.query('DELETE FROM public.invoice_line_items WHERE invoice_id = $1', [id]);

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_price == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await client.query(
                `INSERT INTO public.invoice_line_items (invoice_id, product_service_id, description, quantity, unit_price, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, item.product_service_id || null, item.description, item.quantity, item.unit_price, item.line_total, item.tax_rate || 0.00]
            );
        }

        await client.query('COMMIT');
        res.json({ id: id, message: 'Invoice updated successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error updating invoice:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Invoice number already exists.' });
        }
        res.status(500).json({ error: 'Failed to update invoice', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// DELETE Invoice
app.delete('/api/invoices/:id', async (req, res) => { // Changed path to /api/invoices/:id
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM public.invoices WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        res.json({ message: 'Invoice deleted successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error deleting invoice:', error);
        res.status(500).json({ error: 'Failed to delete invoice', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Record Invoice Payment
app.post('/api/invoices/:id/payment', async (req, res) => { // Changed path to /api/invoices/:id/payment
    const { id } = req.params; // Invoice ID
    const { amount_paid, payment_date, notes, account_id, transaction_description, transaction_category } = req.body;

    if (amount_paid == null || !payment_date || !account_id) {
        return res.status(400).json({ error: 'Amount paid, payment date, and account ID are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const transactionResult = await pool.query(
            `INSERT INTO public.transactions (type, amount, description, date, category, account_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['income', amount_paid, transaction_description || `Payment for Invoice ${id}`, payment_date, transaction_category || 'Trading Income', account_id]
        );
        const transactionId = transactionResult.rows[0].id;

        await client.query(
            `INSERT INTO public.invoice_payments (invoice_id, transaction_id, amount_paid, payment_date, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, transactionId, amount_paid, payment_date, notes || null]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: 'Invoice payment recorded successfully', transaction_id: transactionId });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error recording invoice payment:', error);
        res.status(500).json({ error: 'Failed to record invoice payment', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

/* --- Quotations API Endpoints --- */

// GET All Quotations (List View)
app.get('/api/quotations', async (req, res) => { // Changed path to /api/quotations
    try {
        const result = await pool.query(`
            SELECT
                q.id,
                q.quotation_number,
                q.quotation_date,
                q.expiry_date,
                q.total_amount,
                q.status,
                q.currency,
                c.name AS customer_name,
                c.id AS customer_id
            FROM public.quotations q
            JOIN public.customers c ON q.customer_id = c.id
            ORDER BY q.quotation_date DESC, q.quotation_number DESC
        `);
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching quotations:', error);
        res.status(500).json({ error: 'Failed to fetch quotations', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Single Quotation with Line Items
app.get('/api/quotations/:id', async (req, res) => { // Changed path to /api/quotations/:id
    const { id } = req.params;
    try {
        const quotationResult = await pool.query(`
            SELECT
                q.id,
                q.quotation_number,
                q.customer_id,
                c.name AS customer_name,
                c.email AS customer_email,
                c.phone AS customer_phone,
                c.address AS customer_address,
                q.quotation_date,
                q.expiry_date,
                q.total_amount,
                q.status,
                q.currency,
                q.notes,
                q.created_at,
                q.updated_at
            FROM public.quotations q
            JOIN public.customers c ON q.customer_id = c.id
            WHERE q.id = $1
        `, [id]);

        if (quotationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Quotation not found' });
        }

        const lineItemsResult = await pool.query(`
            SELECT
                qli.id,
                qli.product_service_id,
                ps.name AS product_service_name,
                qli.description,
                qli.quantity,
                qli.unit_price,
                qli.line_total,
                qli.tax_rate
            FROM public.quotation_line_items qli
            LEFT JOIN public.products_services ps ON qli.product_service_id = ps.id
            WHERE qli.quotation_id = $1
            ORDER BY qli.id
        `, [id]);

        const quotation = quotationResult.rows[0];
        quotation.line_items = lineItemsResult.rows;

        res.json(quotation);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching quotation:', error);
        res.status(500).json({ error: 'Failed to fetch quotation', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create Quotation
app.post('/api/quotations', async (req, res) => { // Changed path to /api/quotations
    const { quotation_number, customer_id, customer_name, quotation_date, expiry_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!quotation_number || !quotation_date || total_amount == null || !line_items || line_items.length === 0) {
        return res.status(400).json({ error: 'Missing required quotation fields or line items' });
    }

    // Validate customer: either customer_id or customer_name must be present
    if (!customer_id && (!customer_name || customer_name.trim() === '')) {
        return res.status(400).json({ error: 'Customer ID or Customer Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalCustomerId = customer_id;

        // If customer_id is NOT provided, it means we need to create a new customer
        if (!finalCustomerId) {
            // Check if a customer with this name already exists to prevent duplicates
            const existingCustomerResult = await client.query('SELECT id FROM public.customers WHERE LOWER(name) = LOWER($1)', [customer_name.trim()]);

            if (existingCustomerResult.rows.length > 0) {
                // If customer exists, use their ID
                finalCustomerId = existingCustomerResult.rows[0].id;
            } else {
                // Otherwise, create a new customer
                const newCustomerResult = await client.query(
                    `INSERT INTO public.customers (name, total_invoiced) VALUES ($1, 0.00) RETURNING id`,
                    [customer_name.trim()]
                );
                finalCustomerId = newCustomerResult.rows[0].id;
            }
        }

        const quotationResult = await client.query(
            `INSERT INTO public.quotations (quotation_number, customer_id, quotation_date, expiry_date, total_amount, status, currency, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [quotation_number, finalCustomerId, quotation_date, expiry_date || null, total_amount, status || 'Draft', currency || 'ZAR', notes || null]
        );
        const quotationId = quotationResult.rows[0].id;

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_price == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await client.query(
                `INSERT INTO public.quotation_line_items (quotation_id, product_service_id, description, quantity, unit_price, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [quotationId, item.product_service_id || null, item.description, item.quantity, item.unit_price, item.line_total, item.tax_rate || 0.00]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: quotationId, message: 'Quotation created successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error creating quotation:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Quotation number already exists.' });
        }
        res.status(500).json({ error: 'Failed to create quotation', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// PUT Update Quotation
app.put('/api/quotations/:id', async (req, res) => { // Changed path to /api/quotations/:id
    const { id } = req.params; // Correctly extract 'id' from params
    const { quotation_number, customer_id, customer_name, quotation_date, expiry_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!quotation_number || !quotation_date || total_amount == null || !line_items) {
        return res.status(400).json({ error: 'Missing required quotation fields or line items' });
    }

    // Validate customer: either customer_id or customer_name must be present
    if (!customer_id && (!customer_name || customer_name.trim() === '')) {
        return res.status(400).json({ error: 'Customer ID or Customer Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalCustomerId = customer_id;

        if (!finalCustomerId) {
            const existingCustomerResult = await client.query('SELECT id FROM public.customers WHERE LOWER(name) = LOWER($1)', [customer_name.trim()]);

            if (existingCustomerResult.rows.length > 0) {
                finalCustomerId = existingCustomerResult.rows[0].id;
            } else {
                const newCustomerResult = await client.query(
                    `INSERT INTO public.customers (name, total_invoiced) VALUES ($1, 0.00) RETURNING id`,
                    [customer_name.trim()]
                );
                finalCustomerId = newCustomerResult.rows[0].id;
            }
        }

        const updateQuotationResult = await client.query(
            `UPDATE public.quotations
             SET
               quotation_number = $1,
               customer_id = $2,
               quotation_date = $3,
               expiry_date = $4,
               total_amount = $5,
               status = $6,
               currency = $7,
               notes = $8,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING id`,
            [quotation_number, finalCustomerId, quotation_date, expiry_date || null, total_amount, status, currency || 'ZAR', notes || null, id]
        );

        if (updateQuotationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quotation not found for update' });
        }

        await client.query('DELETE FROM public.quotation_line_items WHERE quotation_id = $1', [id]);

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_price == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await client.query(
                `INSERT INTO public.quotation_line_items (quotation_id, product_service_id, description, quantity, unit_price, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, item.product_service_id || null, item.description, item.quantity, item.unit_price, item.line_total, item.tax_rate || 0.00] // Use 'id' here
            );
        }

        await client.query('COMMIT');
        res.json({ id: id, message: 'Quotation updated successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error updating quotation:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Quotation number already exists.' });
        }
        res.status(500).json({ error: 'Failed to update quotation', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// DELETE Quotation
app.delete('/api/quotations/:id', async (req, res) => { // Changed path to /api/quotations/:id
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM public.quotations WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Quotation not found' });
        }
        res.json({ message: 'Quotation deleted successfully' });
    }
    catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error deleting quotation:', error);
        res.status(500).json({ error: 'Failed to delete quotation', detail: error instanceof Error ? error.message : String(error) });
    }
});


/* --- Purchases API Endpoints --- */

// GET All Purchases (List View)
app.get('/api/purchases', async (req, res) => { // Changed path to /api/purchases
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.po_number,
                p.order_date,
                p.delivery_date,
                p.total_amount,
                p.status,
                p.currency,
                v.name AS vendor_name,
                v.id AS vendor_id
            FROM public.purchases p
            JOIN public.vendors v ON p.vendor_id = v.id
            ORDER BY p.order_date DESC, p.po_number DESC
        `);
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching purchases:', error);
        res.status(500).json({ error: 'Failed to fetch purchases', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Single Purchase with Line Items
app.get('/api/purchases/:id', async (req, res) => { // Changed path to /api/purchases/:id
    const { id } = req.params;
    try {
        const purchaseResult = await pool.query(`
            SELECT
                p.id,
                p.po_number,
                p.vendor_id,
                v.name AS vendor_name,
                v.email AS vendor_email,
                v.phone AS vendor_phone,
                v.address AS vendor_address,
                p.order_date,
                p.delivery_date,
                p.total_amount,
                p.status,
                p.currency,
                p.notes,
                p.created_at,
                p.updated_at
            FROM public.purchases p
            JOIN public.vendors v ON p.vendor_id = v.id
            WHERE p.id = $1
        `, [id]);

        if (purchaseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        const lineItemsResult = await pool.query(`
            SELECT
                pli.id,
                pli.product_service_id,
                ps.name AS product_service_name,
                pli.description,
                pli.quantity,
                pli.unit_cost,
                pli.line_total,
                pli.tax_rate
            FROM public.purchase_line_items pli
            LEFT JOIN public.products_services ps ON pli.product_service_id = ps.id
            WHERE pli.purchase_id = $1
            ORDER BY pli.id
        `, [id]);

        const purchase = purchaseResult.rows[0];
        purchase.line_items = lineItemsResult.rows;

        res.json(purchase);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching purchase:', error);
        res.status(500).json({ error: 'Failed to fetch purchase', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create Purchase
app.post('/api/purchases', async (req, res) => { // Changed path to /api/purchases
    // Destructure vendor_name (manual input) from req.body
    const { po_number, vendor_id, vendor_name, order_date, delivery_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!order_date || total_amount == null || !line_items || line_items.length === 0) {
        return res.status(400).json({ error: 'Missing required purchase fields or line items' });
    }

    // Validate vendor: either vendor_id or vendor_name must be present
    if (!vendor_id && (!vendor_name || vendor_name.trim() === '')) {
        return res.status(400).json({ error: 'Vendor ID or Vendor Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalVendorId = vendor_id;

        // If vendor_id is NOT provided, it means we need to create a new vendor
        if (!finalVendorId) {
            // Check if a vendor with this name already exists to prevent duplicates
            const existingVendorResult = await pool.query('SELECT id FROM public.vendors WHERE LOWER(name) = LOWER($1)', [vendor_name.trim()]);

            if (existingVendorResult.rows.length > 0) {
                // If vendor exists, use their ID
                finalVendorId = existingVendorResult.rows[0].id;
            } else {
                // Otherwise, create a new vendor
                const newVendorResult = await pool.query(
                    `INSERT INTO public.vendors (name) VALUES ($1) RETURNING id`, // Assuming vendors table has 'name'
                    [vendor_name.trim()]
                );
                finalVendorId = newVendorResult.rows[0].id;
            }
        }

        const purchaseResult = await pool.query(
            `INSERT INTO public.purchases (po_number, vendor_id, order_date, delivery_date, total_amount, status, currency, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [po_number || null, finalVendorId, order_date, delivery_date || null, total_amount, status || 'Draft', currency || 'ZAR', notes || null]
        );
        const purchaseId = purchaseResult.rows[0].id;

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_cost == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await pool.query(
                `INSERT INTO public.purchase_line_items (purchase_id, product_service_id, description, quantity, unit_cost, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [purchaseId, item.product_service_id || null, item.description, item.quantity, item.unit_cost, item.line_total, item.tax_rate || 0.00]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: purchaseId, message: 'Purchase created successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error creating purchase:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Purchase order number already exists.' });
        }
        res.status(500).json({ error: 'Failed to create purchase', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// PUT Update Purchase
app.put('/api/purchases/:id', async (req, res) => { // Changed path to /api/purchases/:id
    const { id } = req.params;
    const { po_number, vendor_id, vendor_name, order_date, delivery_date, total_amount, status, currency, notes, line_items } = req.body;

    if (!order_date || total_amount == null || !line_items) {
        return res.status(400).json({ error: 'Missing required purchase fields or line items' });
    }

    // Validate vendor: either vendor_id or vendor_name must be present
    if (!vendor_id && (!vendor_name || vendor_name.trim() === '')) {
        return res.status(400).json({ error: 'Vendor ID or Vendor Name is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let finalVendorId = vendor_id;

        if (!finalVendorId) {
            const existingVendorResult = await pool.query('SELECT id FROM public.vendors WHERE LOWER(name) = LOWER($1)', [vendor_name.trim()]);

            if (existingVendorResult.rows.length > 0) {
                finalVendorId = existingVendorResult.rows[0].id;
            } else {
                const newVendorResult = await pool.query(
                    `INSERT INTO public.vendors (name) VALUES ($1) RETURNING id`,
                    [vendor_name.trim()]
                );
                finalVendorId = newVendorResult.rows[0].id;
            }
        }

        const updatePurchaseResult = await pool.query(
            `UPDATE public.purchases
             SET
               po_number = $1,
               vendor_id = $2,
               order_date = $3,
               delivery_date = $4,
               total_amount = $5,
               status = $6,
               currency = $7,
               notes = $8,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING id`,
            [po_number || null, finalVendorId, order_date, delivery_date || null, total_amount, status, currency || 'ZAR', notes || null, id]
        );

        if (updatePurchaseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Purchase not found for update' });
        }

        await client.query('DELETE FROM public.purchase_line_items WHERE purchase_id = $1', [id]);

        for (const item of line_items) {
            if (!item.description || item.quantity == null || item.unit_cost == null || item.line_total == null) {
                throw new Error('Missing required line item fields');
            }
            await client.query(
                `INSERT INTO public.purchase_line_items (purchase_id, product_service_id, description, quantity, unit_cost, line_total, tax_rate)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, item.product_service_id || null, item.description, item.quantity, item.unit_cost, item.line_total, item.tax_rate || 0.00]
            );
        }

        await client.query('COMMIT');
        res.json({ id: id, message: 'Purchase updated successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error updating purchase:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'Purchase order number already exists.' });
        }
        res.status(500).json({ error: 'Failed to update purchase', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// DELETE Purchase
app.delete('/api/purchases/:id', async (req, res) => { // Changed path to /api/purchases/:id
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM public.purchases WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        res.json({ message: 'Purchase deleted successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error deleting purchase:', error);
        res.status(500).json({ error: 'Failed to delete purchase', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Record Purchase Payment
app.post('/api/purchases/:id/payment', async (req, res) => { // Changed path to /api/purchases/:id/payment
    const { id } = req.params; // Purchase ID
    const { amount_paid, payment_date, notes, account_id, transaction_description, transaction_category } = req.body;

    if (amount_paid == null || !payment_date || !account_id) {
        return res.status(400).json({ error: 'Amount paid, payment date, and account ID are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create a transaction entry
        const transactionResult = await pool.query(
            `INSERT INTO public.transactions (type, amount, description, date, category, account_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['expense', amount_paid, transaction_description || `Payment for Purchase ${id}`, payment_date, transaction_category || 'Business Expenses', account_id]
        );
        const transactionId = transactionResult.rows[0].id;

        // 2. Create a purchase payment entry
        await client.query(
            `INSERT INTO public.purchase_payments (purchase_id, transaction_id, amount_paid, payment_date, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, transactionId, amount_paid, payment_date, notes || null]
        );

        // Optional: Update purchase status if fully paid (requires more logic)

        await client.query('COMMIT');
        res.status(201).json({ message: 'Purchase payment recorded successfully', transaction_id: transactionId });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error recording purchase payment:', error);
        res.status(500).json({ error: 'Failed to record purchase payment', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

/* --- EMPLOYEES API (Existing, with slight modifications for clarity) --- */

// GET All Employees (List View) - No change needed here for the status column, but ensure it fetches all relevant employee data
app.get('/employees', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                e.id,
                e.name,
                e.position,
                e.email,
                e.id_number, /* Added id_number here for consistency */
                e.phone,
                e.start_date,
                e.payment_type,
                e.base_salary,
                e.hourly_rate,
                /* Sum of approved hours for each employee for dashboard stats */
                COALESCE((SELECT SUM(hours_worked) FROM time_entries WHERE employee_id = e.id AND status = 'approved'), 0) AS hours_worked_total,
                bd.account_holder, /* Include account_holder for frontend Employee type */
                bd.bank_name,
                bd.account_number,
                bd.branch_code
            FROM employees e
            LEFT JOIN bank_details bd ON e.id = bd.employee_id
            ORDER BY e.name ASC
        `);
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Single Employee with Bank Details and total hours worked - No change needed, already good
app.get('/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const employeeResult = await pool.query(`
            SELECT
                e.id,
                e.name,
                e.position,
                e.email,
                e.id_number,
                e.phone,
                e.start_date,
                e.payment_type,
                e.base_salary,
                e.hourly_rate,
                bd.account_holder,
                bd.bank_name,
                bd.account_number,
                bd.branch_code,
                e.created_at,
                e.updated_at
            FROM employees e
            LEFT JOIN bank_details bd ON e.id = bd.employee_id
            WHERE e.id = $1
        `, [id]);

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const employee = employeeResult.rows[0];

        // Fetch total hours worked for this employee
        const totalHoursResult = await pool.query(`
            SELECT COALESCE(SUM(hours_worked), 0) AS total_hours
            FROM time_entries
            WHERE employee_id = $1 AND status = 'approved' /* Only sum approved hours */
        `, [id]);

        employee.hours_worked_total = parseFloat(totalHoursResult.rows[0].total_hours);

        // Nested bankDetails object for frontend consistency
        if (employee.account_holder || employee.bank_name || employee.account_number || employee.branch_code) {
            employee.bankDetails = {
                account_holder: employee.account_holder,
                bank_name: employee.bank_name,
                account_number: employee.account_number,
                branch_code: employee.branch_code
            };
        } else {
            employee.bankDetails = null; // Or undefined, depending on frontend preference
        }
        // Clean up flat bank details if you only want nested
        delete employee.account_holder;
        delete employee.bank_name;
        delete employee.account_number;
        delete employee.branch_code;


        res.json(employee);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Failed to fetch employee', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create New Employee (with optional bank details) - No change needed
app.post('/employees', async (req, res) => {
    const {
        name, position, email, idNumber, phone, startDate,
        paymentType, baseSalary, hourlyRate,
        bankDetails // Object: { accountHolder, bankName, accountNumber, branchCode }
    } = req.body;

    // Basic validation
    if (!name || !email || !idNumber || !startDate || !paymentType) {
        return res.status(400).json({ error: 'Missing required employee fields.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert into employees table
        const employeeResult = await pool.query(
            `INSERT INTO employees (name, position, email, id_number, phone, start_date, payment_type, base_salary, hourly_rate)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [name, position || null, email, idNumber, phone || null, startDate, paymentType, baseSalary || null, hourlyRate || null]
        );
        const employeeId = employeeResult.rows[0].id;

        // If bank details are provided, insert into bank_details table
        if (bankDetails && bankDetails.accountHolder && bankDetails.bankName && bankDetails.accountNumber) {
            await client.query(
                `INSERT INTO bank_details (employee_id, account_holder, bank_name, account_number, branch_code)
                 VALUES ($1, $2, $3, $4, $5)`,
                [employeeId, bankDetails.accountHolder, bankDetails.bankName, bankDetails.accountNumber, bankDetails.branchCode || null]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: employeeId, message: 'Employee created successfully' });
    }
    catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error creating employee:', error);
        res.status(500).json({ error: 'Failed to create employee', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// PUT Update Employee Details (including bank details and hours_worked_total)
app.put('/employees/:id', async (req, res) => {
    const { id } = req.params;
    const {
        name, position, email, idNumber, phone, startDate,
        paymentType, baseSalary, hourlyRate, hoursWorked, /* Added hoursWorked */
        bankDetails // Object: { accountHolder, bankName, accountNumber, branchCode }
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Build dynamic UPDATE query for employees table
        const employeeUpdates = [];
        const employeeValues = [];
        let empParamIndex = 1;

        if (name !== undefined) { employeeUpdates.push(`name = $${empParamIndex++}`); employeeValues.push(name); }
        if (position !== undefined) { employeeUpdates.push(`position = $${empParamIndex++}`); employeeValues.push(position || null); }
        if (email !== undefined) { employeeUpdates.push(`email = $${empParamIndex++}`); employeeValues.push(email); }
        if (idNumber !== undefined) { employeeUpdates.push(`id_number = $${empParamIndex++}`); employeeValues.push(idNumber); }
        if (phone !== undefined) { employeeUpdates.push(`phone = $${empParamIndex++}`); employeeValues.push(phone || null); }
        if (startDate !== undefined) { employeeUpdates.push(`start_date = $${empParamIndex++}`); employeeValues.push(startDate); }
        if (paymentType !== undefined) { employeeUpdates.push(`payment_type = $${empParamIndex++}`); employeeValues.push(paymentType); }
        if (baseSalary !== undefined) { employeeUpdates.push(`base_salary = $${empParamIndex++}`); employeeValues.push(baseSalary || null); }
        if (hourlyRate !== undefined) { employeeUpdates.push(`hourly_rate = $${empParamIndex++}`); employeeValues.push(hourlyRate || null); }
        // Only update hours_worked_total if it's explicitly provided (e.g., from time entry approval)
        if (hoursWorked !== undefined) {
            // CRITICAL FIX: Ensure hoursWorked is a valid number before using it in SQL
            const parsedHoursWorked = parseFloat(hoursWorked);
            if (isNaN(parsedHoursWorked)) {
                throw new Error('Invalid numeric value for hoursWorked.');
            }
            employeeUpdates.push(`hours_worked_total = $${empParamIndex++}`);
            employeeValues.push(parsedHoursWorked);
        }

        employeeUpdates.push(`updated_at = CURRENT_TIMESTAMP`);
        employeeValues.push(id); // The ID is the last parameter for WHERE clause

        if (employeeUpdates.length > 1) { // More than just updated_at
            const employeeUpdateResult = await pool.query(
                `UPDATE employees
                 SET ${employeeUpdates.join(', ')}
                 WHERE id = $${empParamIndex} RETURNING id`,
                employeeValues
            );

            if (employeeUpdateResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Employee not found for update' });
            }
        }

        // Handle bank details: upsert (update or insert if not exists)
        if (bankDetails) {
            // Check if bank details already exist for this employee
            const existingBankDetails = await client.query(
                `SELECT id FROM bank_details WHERE employee_id = $1`,
                [id]
            );

            if (existingBankDetails.rows.length > 0) {
                // Update existing bank details
                await client.query(
                    `UPDATE bank_details
                     SET
                        account_holder = $1,
                        bank_name = $2,
                        account_number = $3,
                        branch_code = $4,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE employee_id = $5`,
                    [bankDetails.accountHolder, bankDetails.bankName, bankDetails.accountNumber, bankDetails.branchCode || null, id]
                );
            } else if (bankDetails.accountHolder && bankDetails.bankName && bankDetails.accountNumber) {
                // Insert new bank details if they don't exist and are provided
                await client.query(
                    `INSERT INTO bank_details (employee_id, account_holder, bank_name, account_number, branch_code)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [id, bankDetails.accountHolder, bankDetails.bankName, bankDetails.accountNumber, bankDetails.branchCode || null]
                );
            }
        } else {
             // If bankDetails are explicitly null/undefined, consider deleting existing bank details
             await client.query(`DELETE FROM bank_details WHERE employee_id = $1`, [id]);
        }

        await client.query('COMMIT');
        res.json({ id: id, message: 'Employee updated successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        await client.query('ROLLBACK');
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Failed to update employee', detail: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});

// DELETE Employee - No change needed
app.delete('/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Due to ON DELETE CASCADE, bank_details and time_entries will be deleted automatically
        const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json({ message: 'Employee deleted successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'Failed to delete employee', detail: error instanceof Error ? error.message : String(error) });
    }
});


/* --- TIME ENTRIES API --- */

// NEW: GET All Time Entries (for dashboard and general list)
app.get('/time-entries', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, employee_id, entry_date as date, hours_worked, notes as description, status, created_at, updated_at
            FROM time_entries
            ORDER BY entry_date DESC, created_at DESC
        `);
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching all time entries:', error);
        res.status(500).json({ error: 'Failed to fetch all time entries', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Time Entries for a specific employee - No change needed, but ensure it fetches status
app.get('/employees/:employeeId/time-entries', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const result = await pool.query(
            `SELECT id, employee_id, entry_date as date, hours_worked, notes as description, status, created_at, updated_at
             FROM time_entries
             WHERE employee_id = $1
             ORDER BY entry_date DESC`,
            [employeeId]
        );
        res.json(result.rows);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching time entries for employee:', error);
        res.status(500).json({ error: 'Failed to fetch time entries', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Add a new Time Entry for an employee - MODIFIED to return full object and set status
app.post('/employees/:employeeId/time-entries', async (req, res) => {
    const { employeeId } = req.params;
    const { date, hours_worked, description } = req.body; // Use date, hours_worked, description to match frontend payload

    if (!date || hours_worked == null || hours_worked <= 0) {
        return res.status(400).json({ error: 'Date and positive hours worked are required.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO time_entries (employee_id, entry_date, hours_worked, notes, status)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, employee_id, entry_date as date, hours_worked, notes as description, status`, // Return full object
            [employeeId, date, hours_worked, description || null, 'pending'] // Explicitly set status to 'pending'
        );
        res.status(201).json(result.rows[0]); // Return the created time entry object
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error adding time entry:', error);
        res.status(500).json({ error: 'Failed to add time entry', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT Update a specific Time Entry - MODIFIED to allow status update and return full object
app.put('/time-entries/:id', async (req, res) => {
    const { id } = req.params;
    const { date, hours_worked, description, status } = req.body; // Allow status to be updated

    // Build dynamic query parts
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (date !== undefined) { updates.push(`entry_date = $${paramIndex++}`); values.push(date); }
    if (hours_worked !== undefined) { updates.push(`hours_worked = $${paramIndex++}`); values.push(hours_worked); }
    if (description !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(description); }
    if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided for update.' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id); // The ID is the last parameter

    try {
        const result = await pool.query(
            `UPDATE time_entries
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} RETURNING id, employee_id, entry_date as date, hours_worked, notes as description, status`, // Return updated object
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        res.json(result.rows[0]); // Return the updated time entry object
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error updating time entry:', error);
        res.status(500).json({ error: 'Failed to update time entry', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE a specific Time Entry - No change needed
app.delete('/time-entries/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM time_entries WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Time entry not found' });
        }
        res.json({ message: 'Time entry deleted successfully' });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error deleting time entry:', error);
        res.status(500).json({ error: 'Failed to delete time entry', detail: error instanceof Error ? error.message : String(error) });
    }
});

/* **START OF REPLACED/MODIFIED SUPPLIER ROUTES** */

/* --- Supplier API (Replacing existing /vendors routes) --- */

// GET All Suppliers (and filter by search term if provided)
app.get('/api/suppliers', async (req, res) => {
    // Asserting req.query.search as string to allow .toLowerCase()
    const searchTerm = req.query.search as string | undefined;

    let query = 'SELECT id, name, email, phone, address, vat_number, total_purchased FROM public.suppliers';
    const queryParams: (string | number)[] = [];
    let paramIndex = 1;

    if (searchTerm) {
        query += ` WHERE LOWER(name) ILIKE $${paramIndex} OR LOWER(email) ILIKE $${paramIndex}`;
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
    }

    query += ' ORDER BY name ASC';

    try {
        const { rows } = await pool.query<SupplierDB>(query, queryParams);
        const formattedRows = rows.map(mapSupplierToFrontend);
        res.json(formattedRows);
    } catch (error: unknown) { // Explicitly type error as unknown
        console.error('Error fetching suppliers:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET a single supplier by ID (useful for "Eye" button or detailed view)
app.get('/api/suppliers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query<SupplierDB>(
            'SELECT id, name, email, phone, address, vat_number, total_purchased FROM public.suppliers WHERE id = $1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Supplier not found' });
        }
        res.json(mapSupplierToFrontend(rows[0]));
    } catch (error: unknown) {
        console.error(`Error fetching supplier with ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch supplier', detail: error instanceof Error ? error.message : String(error) });
    }
});


// POST Create New Supplier
app.post('/api/suppliers', async (req, res) => {
    const { name, email, phone, address, vatNumber } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Supplier name is required' });
    }

    try {
        const result = await pool.query<SupplierDB>(
            `INSERT INTO public.suppliers (name, email, phone, address, vat_number)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, address, vat_number, total_purchased`,
            [name, email || null, phone || null, address || null, vatNumber || null]
        );
        res.status(201).json(mapSupplierToFrontend(result.rows[0]));
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error adding supplier:', error);
        if (error instanceof Error && 'code' in error && error.code === '23505') { // Check for unique violation
            return res.status(409).json({ error: 'A supplier with this email or VAT number already exists.' });
        }
        res.status(500).json({ error: 'Failed to add supplier', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT Update Existing Supplier
app.put('/api/suppliers/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, vatNumber } = req.body;

    if (!name) { // Name is required for update
        return res.status(400).json({ error: 'Supplier name is required for update.' });
    }

    try {
        const result = await pool.query<SupplierDB>(
            `UPDATE public.suppliers
             SET name = $1, email = $2, phone = $3, address = $4, vat_number = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 RETURNING id, name, email, phone, address, vat_number, total_purchased`,
            [name, email || null, phone || null, address || null, vatNumber || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Supplier not found.' });
        }
        res.json(mapSupplierToFrontend(result.rows[0]));
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error(`Error updating supplier with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return res.status(409).json({ error: 'A supplier with this email or VAT number already exists.' });
        }
        res.status(500).json({ error: 'Failed to update supplier', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE a Supplier
app.delete('/api/suppliers/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rowCount } = await pool.query(
            'DELETE FROM public.suppliers WHERE id = $1',
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Supplier not found.' });
        }
        res.status(204).send(); // No Content for successful deletion
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error(`Error deleting supplier with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error && error.code === '23503') { // PostgreSQL foreign key violation error
            return res.status(409).json({
                error: 'Cannot delete supplier: associated with existing purchase orders or other records.',
                detail: error.message
            });
        }
        res.status(500).json({ error: 'Failed to delete supplier', detail: error instanceof Error ? error.message : String(error) });
    }
});

/* --- Product API Endpoints --- */

// Helper function to get tax_rate_id from vatRate (value)
// This will be used in POST and PUT operations
const getTaxRateIdFromVatRate = async (rate: number | undefined): Promise<number | null> => {
    if (rate === undefined || rate === null) {
        return null;
    }
    try {
        const { rows } = await pool.query<{ tax_rate_id: number }>('SELECT tax_rate_id FROM public.tax_rates WHERE rate = $1', [rate]);
        if (rows.length > 0) {
            return rows[0].tax_rate_id;
        }
        // Optionally, if the rate doesn't exist, you could insert it here,
        // or return null and let the calling function handle it (e.g., error).
        // For simplicity, we'll return null if not found.
        return null;
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching tax_rate_id by rate:', error);
        return null; // Or throw to propagate the error
    }
};


// GET All Products (with optional search)
// Path: /api/products
app.get('/api/products', async (req, res) => {
    const searchTerm = req.query.search as string | undefined;

    let query = `
        SELECT
            ps.id, ps.name, ps.description, ps.unit_price, ps.cost_price, ps.sku,
            ps.is_service, ps.stock_quantity, ps.created_at, ps.updated_at,
            ps.tax_rate_id, ps.category, ps.unit, tr.rate AS tax_rate_value
        FROM public.products_services ps
        LEFT JOIN public.tax_rates tr ON ps.tax_rate_id = tr.tax_rate_id
    `;
    const queryParams: (string | number)[] = [];
    let paramIndex = 1;

    if (searchTerm) {
        // Search across name, description, SKU, or category
        query += ` WHERE LOWER(ps.name) ILIKE $${paramIndex} OR LOWER(ps.description) ILIKE $${paramIndex} OR LOWER(ps.sku) ILIKE $${paramIndex} OR LOWER(ps.category) ILIKE $${paramIndex}`;
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
    }

    query += ' ORDER BY ps.name ASC';

    try {
        const { rows } = await pool.query<ProductDB>(query, queryParams);
        const formattedRows = rows.map(mapProductToFrontend);
        res.json(formattedRows);
    } catch (error: unknown) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET a single product by ID
// Path: /api/products/:id
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query<ProductDB>(
            `SELECT
                ps.id, ps.name, ps.description, ps.unit_price, ps.cost_price, ps.sku,
                ps.is_service, ps.stock_quantity, ps.created_at, ps.updated_at,
                ps.tax_rate_id, ps.category, ps.unit, tr.rate AS tax_rate_value
             FROM public.products_services ps
             LEFT JOIN public.tax_rates tr ON ps.tax_rate_id = tr.tax_rate_id
             WHERE ps.id = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(mapProductToFrontend(rows[0]));
    } catch (error: unknown) {
        console.error(`Error fetching product with ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch product', detail: error instanceof Error ? error.message : String(error) });
    }
});

// POST Create New Product
// Path: /api/products
app.post('/api/products', async (req, res) => {
    const {
        name, description, price, costPrice, sku,
        isService = false, stock = 0, vatRate, category, unit
    }: CreateUpdateProductBody = req.body;

    // Basic validation
    if (!name || price === undefined || price === null) {
        return res.status(400).json({ error: 'Product name and price are required.' });
    }
    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number.' });
    }

    const taxRateId = await getTaxRateIdFromVatRate(vatRate);

    // If vatRate was provided but no matching tax_rate_id was found
    if (vatRate !== undefined && vatRate !== null && taxRateId === null) {
        return res.status(400).json({ error: `Provided VAT rate ${vatRate} does not exist in tax_rates.` });
    }

    try {
        const result = await pool.query<ProductDB>(
            `INSERT INTO public.products_services (
                name, description, unit_price, cost_price, sku, is_service,
                stock_quantity, tax_rate_id, category, unit
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
                id, name, description, unit_price, cost_price, sku,
                is_service, stock_quantity, created_at, updated_at,
                tax_rate_id, category, unit`,
            [
                name,
                description || null,
                price,
                costPrice || null,
                sku || null,
                isService,
                stock,
                taxRateId, // Use the looked-up ID
                category || null,
                unit || null
            ]
        );

        // Fetch the tax rate value again to include in the frontend response
        const newProductDb = result.rows[0];
        if (newProductDb.tax_rate_id) {
            const { rows: taxRows } = await pool.query<{ rate: number }>('SELECT rate FROM public.tax_rates WHERE tax_rate_id = $1', [newProductDb.tax_rate_id]);
            if (taxRows.length > 0) {
                newProductDb.tax_rate_value = taxRows[0].rate;
            }
        }
        res.status(201).json(mapProductToFrontend(newProductDb));

    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error adding product:', error);
        if (error instanceof Error && 'code' in error) {
            if (error.code === '23505') { // Unique violation (e.g., duplicate SKU)
                return res.status(409).json({ error: 'A product with this SKU already exists.' });
            }
            if (error.code === '23503') { // Foreign key violation (should be caught by taxRateId check, but as a fallback)
                 return res.status(400).json({ error: 'Invalid VAT rate ID provided.', detail: error.message });
            }
        }
        res.status(500).json({ error: 'Failed to add product', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT Update Existing Product
// Path: /api/products/:id
app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const {
        name, description, price, costPrice, sku,
        isService, stock, vatRate, category, unit
    }: CreateUpdateProductBody = req.body;

    // Construct dynamic update query
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(description || null); }
    if (price !== undefined) {
        if (typeof price !== 'number' || price < 0) {
            return res.status(400).json({ error: 'Price must be a non-negative number.' });
        }
        updates.push(`unit_price = $${paramIndex++}`); values.push(price);
    }
    if (costPrice !== undefined) { updates.push(`cost_price = $${paramIndex++}`); values.push(costPrice || null); }
    if (sku !== undefined) { updates.push(`sku = $${paramIndex++}`); values.push(sku || null); }
    if (isService !== undefined) { updates.push(`is_service = $${paramIndex++}`); values.push(isService); }
    if (stock !== undefined) { updates.push(`stock_quantity = $${paramIndex++}`); values.push(stock); }
    if (category !== undefined) { updates.push(`category = $${paramIndex++}`); values.push(category || null); }
    if (unit !== undefined) { updates.push(`unit = $${paramIndex++}`); values.push(unit || null); }

    let taxRateId: number | null | undefined;
    if (vatRate !== undefined) {
        taxRateId = await getTaxRateIdFromVatRate(vatRate);
        if (vatRate !== null && taxRateId === null) { // Only error if vatRate was provided but not found
             return res.status(400).json({ error: `Provided VAT rate ${vatRate} does not exist in tax_rates.` });
        }
        updates.push(`tax_rate_id = $${paramIndex++}`); values.push(taxRateId);
    }


    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided for update.' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`); // Always update timestamp

    const query = `UPDATE public.products_services SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, description, unit_price, cost_price, sku, is_service, stock_quantity, created_at, updated_at, tax_rate_id, category, unit`;
    values.push(id);

    try {
        const result = await pool.query<ProductDB>(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        // Re-fetch the tax rate value to include in the frontend response if it changed or wasn't there
        const updatedProductDb = result.rows[0];
        if (updatedProductDb.tax_rate_id) {
            const { rows: taxRows } = await pool.query<{ rate: number }>('SELECT rate FROM public.tax_rates WHERE tax_rate_id = $1', [updatedProductDb.tax_rate_id]);
            if (taxRows.length > 0) {
                updatedProductDb.tax_rate_value = taxRows[0].rate;
            }
        }
        res.json(mapProductToFrontend(updatedProductDb));

    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error(`Error updating product with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error) {
            if (error.code === '23505') { // Unique violation (e.g., duplicate SKU)
                return res.status(409).json({ error: 'A product with this SKU already exists.' });
            }
            if (error.code === '23503') { // Foreign key violation
                 return res.status(400).json({ error: 'Invalid VAT rate ID provided.', detail: error.message });
            }
        }
        res.status(500).json({ error: 'Failed to update product', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE a Product
// Path: /api/products/:id
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rowCount } = await pool.query(
            'DELETE FROM public.products_services WHERE id = $1',
            [id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        res.status(204).send(); // No Content for successful deletion
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error(`Error deleting product with ID ${id}:`, error);
        if (error instanceof Error && 'code' in error && error.code === '23503') { // Foreign key violation (product might be in an invoice line item)
            return res.status(409).json({
                error: 'Cannot delete product: associated with existing records (e.g., invoices).',
                detail: error.message
            });
        }
        res.status(500).json({ error: 'Failed to delete product', detail: error instanceof Error ? error.message : String(error) });
    }
});

/* --- Stats API Endpoints --- */

// Helper function to calculate change percentage and type
const calculateChange = (current: number, previous: number) => {
    if (previous === 0 && current === 0) {
        return { changePercentage: 0, changeType: 'neutral' };
    }
    if (previous === 0) { // If previous was 0 and current is not, it's an increase
        return { changePercentage: 100, changeType: 'increase' }; // Or a very large number, but 100% is clear
    }
    const percentage = ((current - previous) / previous) * 100;
    let changeType: 'increase' | 'decrease' | 'neutral' = 'neutral';
    if (percentage > 0) {
        changeType = 'increase';
    } else if (percentage < 0) {
        changeType = 'decrease';
    }
    return { changePercentage: parseFloat(percentage.toFixed(2)), changeType };
};

// Define a common date range for "current" and "previous" periods (e.g., last 30 days vs. prior 30 days)
const getCurrentAndPreviousDateRanges = () => {
    const now = new Date();
    const currentPeriodEnd = now.toISOString();

    const currentPeriodStart = new Date();
    currentPeriodStart.setDate(now.getDate() - 30); // Last 30 days
    const currentPeriodStartISO = currentPeriodStart.toISOString();

    const previousPeriodEnd = currentPeriodStart.toISOString();
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(currentPeriodStart.getDate() - 30); // 30 days before that
    const previousPeriodStartISO = previousPeriodStart.toISOString();

    return {
        currentStart: currentPeriodStartISO,
        currentEnd: currentPeriodEnd,
        previousStart: previousPeriodStartISO,
        previousEnd: previousPeriodEnd
    };
};


// GET Client Count with Change
app.get('/api/stats/clients', async (req, res) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = getCurrentAndPreviousDateRanges();

        const currentResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.customers WHERE created_at >= $1 AND created_at <= $2',
            [currentStart, currentEnd]
        );
        const previousResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.customers WHERE created_at >= $1 AND created_at < $2',
            [previousStart, previousEnd]
        );

        const currentCount = parseInt(currentResult.rows[0].count, 10);
        const previousCount = parseInt(previousResult.rows[0].count, 10);

        const { changePercentage, changeType } = calculateChange(currentCount, previousCount);

        res.json({
            count: currentCount,
            previousCount: previousCount,
            changePercentage: changePercentage,
            changeType: changeType
        });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching client count:', error);
        res.status(500).json({ error: 'Failed to fetch client count', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Quotes Count with Change
app.get('/api/stats/quotes', async (req, res) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = getCurrentAndPreviousDateRanges();

        const currentResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.quotations WHERE created_at >= $1 AND created_at <= $2',
            [currentStart, currentEnd]
        );
        const previousResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.quotations WHERE created_at >= $1 AND created_at < $2',
            [previousStart, previousEnd]
        );

        const currentCount = parseInt(currentResult.rows[0].count, 10);
        const previousCount = parseInt(previousResult.rows[0].count, 10);

        const { changePercentage, changeType } = calculateChange(currentCount, previousCount);

        res.json({
            count: currentCount,
            previousCount: previousCount,
            changePercentage: changePercentage,
            changeType: changeType
        });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching quote count:', error);
        res.status(500).json({ error: 'Failed to fetch quote count', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Invoices Count with Change
app.get('/api/stats/invoices', async (req, res) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = getCurrentAndPreviousDateRanges();

        const currentResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.invoices WHERE created_at >= $1 AND created_at <= $2',
            [currentStart, currentEnd]
        );
        const previousResult = await pool.query(
            'SELECT COUNT(id) AS count FROM public.invoices WHERE created_at >= $1 AND created_at < $2',
            [previousStart, previousEnd]
        );

        const currentCount = parseInt(currentResult.rows[0].count, 10);
        const previousCount = parseInt(previousResult.rows[0].count, 10);

        const { changePercentage, changeType } = calculateChange(currentCount, previousCount);

        res.json({
            count: currentCount,
            previousCount: previousCount,
            changePercentage: changePercentage,
            changeType: changeType
        });
    } catch (error: unknown) // Changed 'err' to 'error: unknown'
    {
        console.error('Error fetching invoice count:', error);
        res.status(500).json({ error: 'Failed to fetch invoice count', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Total Invoice Value with Change
app.get('/api/stats/invoice-value', async (req, res) => {
    try {
        const { currentStart, currentEnd, previousStart, previousEnd } = getCurrentAndPreviousDateRanges();

        const currentResult = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) AS value FROM public.invoices WHERE created_at >= $1 AND created_at <= $2',
            [currentStart, currentEnd]
        );
        const previousResult = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) AS value FROM public.invoices WHERE created_at >= $1 AND created_at < $2',
            [previousStart, previousEnd]
        );

        const currentValue = parseFloat(currentResult.rows[0].value);
        const previousValue = parseFloat(previousResult.rows[0].value);

        const { changePercentage, changeType } = calculateChange(currentValue, previousValue);

        res.json({
            value: currentValue,
            previousValue: previousValue,
            changePercentage: changePercentage,
            changeType: changeType
        });
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching total invoice value:', error);
        res.status(500).json({ error: 'Failed to fetch total invoice value', detail: error instanceof Error ? error.message : String(error) });
    }
});
// STAT APIs
// Helper to format month to YYYY-MM
const formatMonth = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
};

// GET Revenue Trend Data (Profit, Expenses, Revenue by Month)
app.get('/api/charts/revenue-trend', async (req, res) => {
    try {
        // Fetch invoice revenue by month
        // Using 'created_at' for consistency across transaction tables
        const invoicesResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COALESCE(SUM(total_amount), 0) AS revenue
            FROM public.invoices
            GROUP BY month
            ORDER BY month;
        `);

        // Fetch expenses by month (assuming an 'expenses' table with 'amount' and a date column)
        // IMPORTANT: Verify the column name for date in your 'public.expenses' table.
        // It is currently assumed to be 'date'. If it's different (e.g., 'created_at'), please change it.
        const expensesResult = await pool.query(`
            SELECT
                TO_CHAR(date, 'YYYY-MM') AS month,
                COALESCE(SUM(amount), 0) AS expenses
            FROM public.transactions /* Changed to transactions table for expense data */
            WHERE type = 'expense'
            GROUP BY month
            ORDER BY month;
        `);

        const revenueMap = new Map<string, { revenue: number, expenses: number }>();

        // Populate revenue and initialize expenses
        invoicesResult.rows.forEach(row => {
            revenueMap.set(row.month, { revenue: parseFloat(row.revenue), expenses: 0 });
        });

        // Add expenses to the map
        expensesResult.rows.forEach(row => {
            if (revenueMap.has(row.month)) {
                const existing = revenueMap.get(row.month)!;
                existing.expenses = parseFloat(row.expenses);
            } else {
                revenueMap.set(row.month, { revenue: 0, expenses: parseFloat(row.expenses) });
            }
        });

        // Consolidate and calculate profit
        const monthlyData: { month: string; profit: number; expenses: number; revenue: number }[] = [];
        const sortedMonths = Array.from(revenueMap.keys()).sort();

        sortedMonths.forEach(month => {
            const data = revenueMap.get(month)!;
            const profit = data.revenue - data.expenses;
            monthlyData.push({
                month,
                profit: parseFloat(profit.toFixed(2)),
                expenses: parseFloat(data.expenses.toFixed(2)), // Ensure expenses are positive for display
                revenue: parseFloat(data.revenue.toFixed(2))
            });
        });

        res.json(monthlyData);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching revenue trend data:', error);
        res.status(500).json({ error: 'Failed to fetch revenue trend data', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET Transaction Volume Data (Quotes, Invoices, Purchases by Month)
app.get('/api/charts/transaction-volume', async (req, res) => {
    try {
        // Fetch quotes count by month
        // Using 'created_at' as per your provided schema for consistency
        const quotesResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COUNT(id) AS count
            FROM public.quotations
            GROUP BY month
            ORDER BY month;
        `);

        // Fetch invoices count by month
        // Using 'created_at' as per your provided schema for consistency
        const invoicesResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COUNT(id) AS count
            FROM public.invoices
            GROUP BY month
            ORDER BY month;
        `);

        // Fetch purchases count by month
        // Using 'created_at' as per your provided schema for consistency
        const purchasesResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') AS month,
                COUNT(id) AS count
            FROM public.purchases
            GROUP BY month
            ORDER BY month;
        `);

        const monthlyMap = new Map<string, { quotes: number; invoices: number; purchases: number }>();

        // Populate map with all months and initialize counts
        quotesResult.rows.forEach(row => {
            monthlyMap.set(row.month, { quotes: parseInt(row.count, 10), invoices: 0, purchases: 0 });
        });
        purchasesResult.rows.forEach(row => {
            if (monthlyMap.has(row.month)) {
                monthlyMap.get(row.month)!.purchases = parseInt(row.count, 10);
            } else {
                monthlyMap.set(row.month, { quotes: 0, invoices: 0, purchases: parseInt(row.count, 10) });
            }
        });
        invoicesResult.rows.forEach(row => {
            if (monthlyMap.has(row.month)) {
                monthlyMap.get(row.month)!.invoices = parseInt(row.count, 10);
            } else {
                monthlyMap.set(row.month, { quotes: 0, invoices: parseInt(row.count, 10), purchases: 0 });
            }
        });

        // Sort months and convert to array
        const sortedMonths = Array.from(monthlyMap.keys()).sort();
        const monthlyData: { month: string; quotes: number; invoices: number; purchases: number }[] = [];

        sortedMonths.forEach(month => {
            monthlyData.push({
                month,
                quotes: monthlyMap.get(month)?.quotes || 0,
                invoices: monthlyMap.get(month)?.invoices || 0,
                purchases: monthlyMap.get(month)?.purchases || 0,
            });
        });

        res.json(monthlyData);
    } catch (error: unknown) { // Changed 'err' to 'error: unknown'
        console.error('Error fetching transaction volume data:', error);
        res.status(500).json({ error: 'Failed to fetch transaction volume data', detail: error instanceof Error ? error.message : String(error) });
    }
});

// Upload endpoint
app.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { name, type, description, user_id } = req.body;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `/uploads/${file.filename}`;
    const mimeType = file.mimetype;
    const fileSize = file.size;

    const result = await pool.query(
      `INSERT INTO documents (user_id, name, type, description, file_url, file_mime_type, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [user_id, name, type, description, fileUrl, mimeType, fileSize]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Something went wrong', detail: error instanceof Error ? error.message : String(error) });
  }
});

// (Optional) Get all documents
app.get('/documents', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents ORDER BY uploaded_at DESC');
    res.json(result.rows);
  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    res.status(500).json({ error: 'Failed to fetch documents', detail: error instanceof Error ? error.message : String(error) });
  }
});

// Helper function to get status based on progress percentage
const getStatusFromPercentage = (percentage: number): string => {
    if (percentage === 100) {
        return 'Done';
    } else if (percentage >= 75) {
        return 'Review';
    } else if (percentage >= 25) {
        return 'In Progress';
    } else {
        return 'To Do';
    }
};

/* --- Task Management API Endpoints --- */

// POST /api/tasks - Create a new task
app.post('/api/tasks', async (req, res) => {
    const { title, description, priority, due_date, project_id, progress_percentage: clientProgress } = req.body;
    const dummyUserId = 'frontend-user-123';

    if (!title) {
        return res.status(400).json({ error: 'Task title is required.' });
    }

    // Ensure progress_percentage is a number and clamp it between 0 and 100
    const progress_percentage = typeof clientProgress === 'number' ? Math.max(0, Math.min(100, clientProgress)) : 0;
    // Derive status from the provided progress_percentage
    const status = getStatusFromPercentage(progress_percentage);

    try {
        const result = await pool.query(
            `INSERT INTO public.tasks (user_id, title, description, status, priority, due_date, progress_percentage, project_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
            [
                dummyUserId,
                title,
                description || null,
                status, // Use derived status
                priority || 'Medium',
                due_date || null,
                progress_percentage, // Use client's progress
                project_id || null
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (error: unknown) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/tasks - Fetch all tasks for the dummy user, with project details
app.get('/api/tasks', async (req, res) => {
    const dummyUserId = 'frontend-user-123';

    try {
        const result = await pool.query(
            `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.progress_percentage, t.created_at, t.updated_at,
                    t.project_id, p.name AS project_name, p.description AS project_description, p.deadline AS project_deadline,
                    p.status AS project_status, p.assignee AS project_assignee, p.progress_percentage AS project_overall_progress
             FROM public.tasks t
             LEFT JOIN public.projects p ON t.project_id = p.id
             WHERE t.user_id = $1 ORDER BY t.created_at DESC`, // LEFT JOIN to get project details
            [dummyUserId]
        );
        res.json(result.rows);
    } catch (error: unknown) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT /api/tasks/:id - Update an existing task
app.put('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, priority, due_date, project_id, progress_percentage: clientProgress } = req.body;
    const dummyUserId = 'frontend-user-123';

    if (!title) {
        return res.status(400).json({ error: 'Task title is required.' });
    }

    // Ensure progress_percentage is a number and clamp it between 0 and 100
    const progress_percentage = typeof clientProgress === 'number' ? Math.max(0, Math.min(100, clientProgress)) : 0;
    // Derive status from the provided progress_percentage
    const status = getStatusFromPercentage(progress_percentage);

    try {
        const result = await pool.query(
            `UPDATE public.tasks
             SET title = $1, description = $2, status = $3, priority = $4, due_date = $5, progress_percentage = $6, project_id = $7, updated_at = NOW()
             WHERE id = $8 AND user_id = $9 RETURNING *`,
            [
                title,
                description || null,
                status, // Use derived status
                priority || 'Medium',
                due_date || null,
                progress_percentage, // Use client's progress
                project_id || null,
                id,
                dummyUserId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found or unauthorized.' });
        }
        res.json(result.rows[0]);
    } catch (error: unknown) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE /api/tasks/:id - Delete a task (no changes needed here)
app.delete('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const dummyUserId = 'frontend-user-123';

    try {
        const result = await pool.query(
            `DELETE FROM public.tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
            [id, dummyUserId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found or unauthorized.' });
        }
        res.status(204).send(); // No Content
    } catch (error: unknown) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task.', detail: error instanceof Error ? error.message : String(error) });
    }
});

/* --- Project Management API Endpoints --- */

// POST /api/projects - Create a new project
app.post('/api/projects', async (req, res) => {
    const { name, description, deadline, status, assignee, progress_percentage } = req.body;
    // You might want to associate projects with a user, similar to tasks
    // const dummyUserId = 'frontend-user-123';

    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO public.projects (name, description, deadline, status, assignee, progress_percentage, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
            [
                name,
                description || null,
                deadline || null,
                status || 'Not Started',
                assignee || null,
                progress_percentage || 0.00
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (error: unknown) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/projects - Fetch all projects
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, description, deadline, status, assignee, progress_percentage, created_at, updated_at
             FROM public.projects ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (error: unknown) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// PUT /api/projects/:id - Update an existing project
app.put('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, deadline, status, assignee, progress_percentage } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }

    try {
        const result = await pool.query(
            `UPDATE public.projects
             SET name = $1, description = $2, deadline = $3, status = $4, assignee = $5, progress_percentage = $6, updated_at = NOW()
             WHERE id = $7 RETURNING *`,
            [
                name,
                description || null,
                deadline || null,
                status || 'Not Started',
                assignee || null,
                progress_percentage || 0.00,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        res.json(result.rows[0]);
    } catch (error: unknown) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project.', detail: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE /api/projects/:id - Delete a project
app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM public.projects WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        res.status(204).send(); // No Content
    } catch (error: unknown) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project.', detail: error instanceof Error ? error.message : String(error) });
    }
});

/* --- Financial Document Generation API --- */
app.get('/generate-financial-document', async (req, res) => {
  const { documentType, startDate, endDate } = req.query;

  if (!documentType || !startDate || !endDate) {
    return res.status(400).json({ error: 'documentType, startDate, and endDate are required.' });
  }

  // Set response headers for PDF download
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${documentType}-${startDate}-to-${endDate}.pdf"`
  });

  const doc = new PDFDocument();
  doc.pipe(res); // Pipe the PDF directly to the response stream

  try {
    let companyName = "QUANTILYTIX";

    // Helper function to format currency for PDF
    const formatCurrencyForPdf = (amount: number | null | undefined): string => {
      if (amount === null || amount === undefined) return '-'; // Handle null/undefined balances
      if (amount === 0) return '-';
      return parseFloat(amount.toString()).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 });
    };

    // Common function to draw the header for all documents
    const drawDocumentHeader = (doc: any, companyName: string, documentTitle: string, dateString:
string, disclaimerText: string | null = null) => {
      doc.fontSize(16).font('Helvetica-Bold').text(companyName, { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('MANAGEMENT ACCOUNTS', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(documentTitle, { align: 'center' });
      doc.fontSize(10).text(dateString, { align: 'center' });
      doc.moveDown();

      if (disclaimerText) {
        doc.fontSize(8).fillColor('red').text(
          disclaimerText,
          { align: 'center', width: doc.page.width - 100, continued: false }
        );
        doc.fillColor('black'); // Reset text color
        doc.moveDown(0.5);
      }
    };

    // Define common column positions for consistency
    const col1X = 50;
    const col2X = 400; // Aligned for values
    const columnWidth = 100; // For right-aligned columns

    switch (documentType) {
      case 'income-statement': {
        const incomeStatementStartDate = startDate as string;
        const incomeStatementEndDate = endDate as string;

        // Fetch revenue transactions for the period
        const incomeQueryResult = await pool.query(
          `
          SELECT
              t.category,
              SUM(t.amount) AS total_amount
          FROM
              transactions t
          WHERE
              t.type = 'income'
              AND t.date >= $1 AND t.date <= $2 /* Inclusive end date */
          GROUP BY
              t.category;
          `,
          [incomeStatementStartDate, incomeStatementEndDate]
        );
        const incomeCategories = incomeQueryResult.rows;

        let totalSales = 0;
        let interestIncome = 0;
        let otherIncome = 0;
        const detailedIncome: { [key: string]: number } = {}; // To store income by category for display

        incomeCategories.forEach(inc => {
            const amount = parseFloat(inc.total_amount);
            if (inc.category === 'Sales Revenue' || inc.category === 'Trading Income') {
                totalSales += amount;
            } else if (inc.category === 'Interest Income') {
                interestIncome += amount;
            } else {
                // Aggregate other specific income categories
                if (detailedIncome[inc.category]) {
                    detailedIncome[inc.category] += amount;
                } else {
                    detailedIncome[inc.category] = amount;
                }
                otherIncome += amount; // Sum all other income for gross income calculation
            }
        });

        // Fetch Cost of Goods Sold
        const cogsQueryResult = await pool.query(
            `
            SELECT
                SUM(t.amount) AS total_cogs
            FROM
                transactions t
            WHERE
                t.type = 'expense' AND t.category = 'Cost of Goods Sold'
                AND t.date >= $1 AND t.date <= $2;
            `,
            [incomeStatementStartDate, incomeStatementEndDate]
        );
        const costOfGoodsSold = parseFloat(cogsQueryResult.rows[0]?.total_cogs || 0);

        // Fetch operating expenses (excluding COGS)
        const expensesQueryResult = await pool.query(
          `
          SELECT
              t.category,
              SUM(t.amount) AS total_amount
          FROM
              transactions t
          WHERE
              t.type = 'expense' AND t.category != 'Cost of Goods Sold' /* Exclude COGS here */
              AND t.date >= $1 AND t.date <= $2 /* Inclusive end date */
          GROUP BY
              t.category;
          `,
          [incomeStatementStartDate, incomeStatementEndDate]
        );
        const expenses = expensesQueryResult.rows;

        const grossProfit = totalSales - costOfGoodsSold;
        const totalExpensesSum = expenses.reduce((sum, exp) => sum + parseFloat(exp.total_amount), 0);
        const netProfitLoss = (grossProfit + interestIncome + otherIncome) - totalExpensesSum;

        drawDocumentHeader(
          doc,
          companyName,
          'INCOME STATEMENT',
          `FOR THE PERIOD ENDED ${new Date(incomeStatementEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`
        );

        // Table Headers
        doc.font('Helvetica-Bold');
        doc.fillColor('#e2e8f0').rect(col1X, doc.y, doc.page.width - 100, 20).fill(); // Background for header
        doc.fillColor('#4a5568').text('Description', col1X + 5, doc.y + 5);
        doc.text('Amount (R)', col2X, doc.y + 5, { width: columnWidth, align: 'right' });
        doc.moveDown(0.5);
        doc.fillColor('black'); // Reset text color
        doc.font('Helvetica');


        // Sales
        doc.text('Sales', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalSales), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown(0.5);
        doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);

        // Less: Cost of Sales
        doc.text('Less: Cost of Sales', col1X, doc.y);
        doc.text(formatCurrencyForPdf(costOfGoodsSold), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown(0.5);
        doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);

        // Gross Profit/ (Loss)
        doc.font('Helvetica-Bold');
        doc.text('Gross Profit / (Loss)', col1X, doc.y);
        doc.text(formatCurrencyForPdf(grossProfit), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Add: Other Income
        if (Object.keys(detailedIncome).length > 0 || interestIncome > 0) {
          doc.text('Add: Other Income', col1X, doc.y);
          doc.moveDown(0.5);
          if (interestIncome > 0) {
            doc.text(`  Interest Income`, col1X + 20, doc.y);
            doc.text(formatCurrencyForPdf(interestIncome), col2X, doc.y, { width: columnWidth, align: 'right' });
            doc.moveDown(0.5);
          }
          for (const category in detailedIncome) {
            // Only list if it's not Sales Revenue or Interest Income (already handled)
            if (category !== 'Sales Revenue' && category !== 'Interest Income') {
              doc.text(`  ${category}`, col1X + 20, doc.y);
              doc.text(formatCurrencyForPdf(detailedIncome[category]), col2X, doc.y, { width: columnWidth, align: 'right' });
              doc.moveDown(0.5);
            }
          }
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        }

        // Gross Income
        doc.font('Helvetica-Bold');
        doc.text('Gross Income', col1X, doc.y);
        doc.text(formatCurrencyForPdf(grossProfit + interestIncome + otherIncome), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Less: Expenses
        doc.text('Less: Expenses', col1X, doc.y);
        doc.moveDown(0.5);
        expenses.forEach(exp => {
          doc.text(`  ${exp.category}`, col1X + 20, doc.y);
          doc.text(formatCurrencyForPdf(parseFloat(exp.total_amount)), col2X, doc.y, { width: columnWidth, align: 'right' });
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        // Total Expenses
        doc.font('Helvetica-Bold');
        doc.text('Total Expenses', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalExpensesSum), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // NET PROFIT /(LOSS) for the period
        doc.font('Helvetica-Bold');
        // Dynamically set text based on profit or loss
        const netProfitLossText = netProfitLoss >= 0 ? 'NET PROFIT for the period' : 'NET LOSS for the period';
        doc.text(netProfitLossText, col1X, doc.y);
        // Ensure Net Profit/Loss is always positive for display
        doc.text(formatCurrencyForPdf(Math.abs(netProfitLoss)), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(8).fillColor('#4a5568').text(`Statement Period: ${new Date(incomeStatementStartDate).toLocaleDateString('en-GB')} to ${new Date(incomeStatementEndDate).toLocaleDateString('en-GB')}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown();

        break;
      }

      case 'balance-sheet': {
        const balanceSheetEndDate = endDate as string;

        // Fetch all accounts and calculate their proper balances for balance sheet
        const balanceSheetAccountsResult = await pool.query(
          `
          SELECT
              acc.id,
              acc.name,
              acc.type,
              /* Calculate proper debit and credit totals based on account type and transaction type */
              COALESCE(SUM(CASE
                  /* Assets: Increase with debits (expenses like equipment purchases), decrease with credits */
                  WHEN acc.type = 'Asset' AND t.type = 'expense' THEN t.amount /* Money going out increases assets (like equipment purchase) */
                  WHEN acc.type = 'Asset' AND t.type = 'income' THEN -t.amount /* Money coming in decreases specific assets (like asset sale) */
                  /* Liabilities: Increase with credits (taking on debt), decrease with debits (paying off debt) */
                  WHEN acc.type = 'Liability' AND t.type = 'expense' THEN t.amount /* Taking on debt increases liability */
                  WHEN acc.type = 'Liability' AND t.type = 'income' THEN -t.amount /* Paying off debt decreases liability */
                  /* Equity: Increase with credits (profits), decrease with debits (losses/withdrawals) */
                  WHEN acc.type = 'Equity' AND t.type = 'income' THEN t.amount /* Profit increases equity */
                  WHEN acc.type = 'Equity' AND t.type = 'expense' THEN -t.amount /* Losses decrease equity */
                  ELSE 0
              END), 0) AS balance
          FROM
              accounts acc
          LEFT JOIN
              transactions t ON acc.id = t.account_id AND t.date <= $1
          WHERE acc.type IN ('Asset', 'Liability', 'Equity')
          GROUP BY
              acc.id, acc.name, acc.type
          ORDER BY acc.type, acc.name;
          `,
          [balanceSheetEndDate]
        );

        const allAccounts = balanceSheetAccountsResult.rows;
        const assetsAccounts = allAccounts.filter(a => a.type === 'Asset');
        const liabilityAccounts = allAccounts.filter(a => a.type === 'Liability');
        const equityAccounts = allAccounts.filter(a => a.type === 'Equity');

        // Fetch Fixed Assets with their accumulated depreciation
        const fixedAssetsResult = await pool.query(`
            SELECT
                id, name, cost, accumulated_depreciation
            FROM assets
            WHERE date_received <= $1
            ORDER BY name;
        `, [balanceSheetEndDate]);

        let totalFixedAssetsAtCost = 0;
        let totalAccumulatedDepreciation = 0;
        const fixedAssetsToDisplay: { name: string; cost: number; accumulated_depreciation: number; net_book_value: number }[] = [];

        fixedAssetsResult.rows.forEach(asset => {
            const cost = parseFloat(asset.cost);
            const accumulated_depreciation = parseFloat(asset.accumulated_depreciation);
            const net_book_value = cost - accumulated_depreciation;

            totalFixedAssetsAtCost += cost;
            totalAccumulatedDepreciation += accumulated_depreciation;

            fixedAssetsToDisplay.push({
                name: asset.name,
                cost: cost,
                accumulated_depreciation: accumulated_depreciation,
                net_book_value: net_book_value
            });
        });

        // Calculate retained earnings (accumulated profit/loss from all periods up to end date)
        const currentPeriodProfitLossResult = await pool.query(
          `
          SELECT
              COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS retained_earnings
          FROM
              transactions t
          WHERE
              t.date <= $1;
          `,
          [balanceSheetEndDate] // Calculate all profit/loss up to balance sheet date
        );
        const retainedEarnings = parseFloat(currentPeriodProfitLossResult.rows[0].retained_earnings || 0);

        drawDocumentHeader(
          doc,
          companyName,
          'BALANCE SHEET',
          `AS OF ${new Date(balanceSheetEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`
        );

        // ASSETS SECTION
        doc.font('Helvetica-Bold').fontSize(12).text('ASSETS', col1X, doc.y);
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Non-current Assets (Fixed Assets)
        doc.font('Helvetica-Bold').text('Non-current Assets', col1X, doc.y);
        doc.moveDown(0.5);

        if (fixedAssetsToDisplay.length > 0) {
            doc.text('  Fixed Assets at Cost:', col1X + 20, doc.y);
            doc.text(formatCurrencyForPdf(totalFixedAssetsAtCost), col2X, doc.y, { width: columnWidth, align: 'right' });
            doc.moveDown(0.5);

            doc.text('  Less: Accumulated Depreciation', col1X + 20, doc.y);
            doc.text(formatCurrencyForPdf(totalAccumulatedDepreciation), col2X, doc.y, { width: columnWidth, align: 'right' });
            doc.moveDown(0.5);
            doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
            doc.moveDown(0.5);

            doc.font('Helvetica-Bold');
            doc.text('Net Book Value of Fixed Assets', col1X + 20, doc.y);
            doc.text(formatCurrencyForPdf(totalFixedAssetsAtCost - totalAccumulatedDepreciation), col2X, doc.y, { width: columnWidth, align: 'right' });
            doc.moveDown();
            doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
            doc.moveDown(0.5);
            doc.font('Helvetica');
        } else {
            doc.text('  No Fixed Assets to display.', col1X + 20, doc.y);
            doc.moveDown(1);
        }

        doc.font('Helvetica-Bold');
        doc.text('Total Non-current Assets', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalFixedAssetsAtCost - totalAccumulatedDepreciation), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Current Assets
        doc.font('Helvetica-Bold').text('Current Assets', col1X, doc.y);
        doc.moveDown(0.5);
        let totalCurrentAssets = 0;
        assetsAccounts.filter(a => a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('receivable')).forEach(asset => {
          doc.text(`  ${asset.name}`, col1X + 20, doc.y);
          doc.text(formatCurrencyForPdf(asset.balance), col2X, doc.y, { width: columnWidth, align: 'right' });
          totalCurrentAssets += parseFloat(asset.balance);
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        doc.font('Helvetica-Bold');
        doc.text('Total Current Assets', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalCurrentAssets), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold').fontSize(12);
        const totalAssets = (totalFixedAssetsAtCost - totalAccumulatedDepreciation) + totalCurrentAssets;
        doc.text('Total Assets', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalAssets), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown(2);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown();


        // EQUITY AND LIABILITIES SECTION
        doc.font('Helvetica-Bold').fontSize(12).text('EQUITY AND LIABILITIES', col1X, doc.y);
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Capital and Reserves
        doc.font('Helvetica-Bold').text('Capital and Reserves', col1X, doc.y);
        doc.moveDown(0.5);
        let totalEquityAccountsBalance = 0;
        equityAccounts.forEach(eq => {
          doc.text(`  ${eq.name}`, col1X + 20, doc.y);
          doc.text(formatCurrencyForPdf(eq.balance), col2X, doc.y, { width: columnWidth, align: 'right' });
          totalEquityAccountsBalance += parseFloat(eq.balance);
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        // Add Current Period Profit/Loss to Equity
        // This represents the retained earnings for the current period
        doc.text(`  Retained Earnings`, col1X + 20, doc.y);
        doc.text(formatCurrencyForPdf(retainedEarnings), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown(0.5);
        doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold');
        const totalEquity = totalEquityAccountsBalance + retainedEarnings;
        doc.text('Total Equity', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalEquity), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');

        // Non - Current Liabilities
        doc.font('Helvetica-Bold').text('Non-Current Liabilities', col1X, doc.y);
        doc.moveDown(0.5);
        let totalNonCurrentLiabilities = 0;
        liabilityAccounts.filter(a => a.name.toLowerCase().includes('loan') || a.name.toLowerCase().includes('long-term')).forEach(lib => {
          doc.text(`  ${lib.name}`, col1X + 20, doc.y);
          doc.text(formatCurrencyForPdf(lib.balance), col2X, doc.y, { width: columnWidth, align: 'right' });
          totalNonCurrentLiabilities += parseFloat(lib.balance);
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        doc.font('Helvetica-Bold');
        doc.text('Total Non-Current Liabilities', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalNonCurrentLiabilities), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');


        // Current Liabilities
        doc.font('Helvetica-Bold').text('Current Liabilities', col1X, doc.y);
        doc.moveDown(0.5);
        let totalCurrentLiabilities = 0;
        liabilityAccounts.filter(a => a.name.toLowerCase().includes('payable') || a.name.toLowerCase().includes('current liability') || a.name.toLowerCase().includes('credit facility')).forEach(lib => {
          doc.text(`  ${lib.name}`, col1X + 20, doc.y);
          doc.text(formatCurrencyForPdf(lib.balance), col2X, doc.y, { width: columnWidth, align: 'right' });
          totalCurrentLiabilities += parseFloat(lib.balance);
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        doc.font('Helvetica-Bold');
        doc.text('Total Current Liabilities', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalCurrentLiabilities), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold').fontSize(12);
        const totalEquityAndLiabilities = totalEquity + totalNonCurrentLiabilities + totalCurrentLiabilities;
        doc.text('Total Equity and Liabilities', col1X, doc.y);
        doc.text(formatCurrencyForPdf(totalEquityAndLiabilities), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown(2);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(8).fillColor('#4a5568').text(`Statement Period: ${new Date(startDate as string).toLocaleDateString('en-GB')} to ${new Date(endDate as string).toLocaleDateString('en-GB')}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown();

        break;
      }

      case 'trial-balance': {
        const trialBalanceStartDate = startDate as string;
        const trialBalanceEndDate = endDate as string;

        // Define column positions for trial balance specifically, before use
        const accountNameX = 50;
        const debitX = 350;
        const creditX = 500;
        // columnWidth is already defined globally as 100

        // Step 1: Calculate proper debit/credit balances for each account
        // Modified query to use t.category + t.description for Income/Expense display names
        const netBalancesResult = await pool.query(
          `
          SELECT
              // Use transaction category + description for Income/Expense, otherwise use account name
              CASE
                  WHEN acc.type = 'Income' AND t.category IS NOT NULL THEN COALESCE(t.category, 'Uncategorized Income') || COALESCE(' - ' || t.description, '')
                  WHEN acc.type = 'Expense' AND t.category IS NOT NULL THEN COALESCE(t.category, 'Uncategorized Expense') || COALESCE(' - ' || t.description, '')
                  ELSE acc.name
              END AS account_display_name,
              acc.type AS account_type,
              // Calculate the net balance for each account/category/description combination
              COALESCE(SUM(
                  CASE
                      // For Asset & Expense: Debits increase (+), Credits decrease (-)
                      WHEN acc.type IN ('Asset', 'Expense') THEN
                          CASE
                              WHEN t.type = 'expense' THEN t.amount
                              WHEN t.type = 'income' THEN -t.amount
                              ELSE 0
                          END
                      // For Liability, Equity, Income: Credits increase (+), Debits decrease (-)
                      WHEN acc.type IN ('Liability', 'Equity', 'Income') THEN
                          CASE
                              WHEN t.type = 'income' THEN t.amount
                              WHEN t.type = 'expense' THEN -t.amount
                              ELSE 0
                          END
                      ELSE 0
                  END
              ), 0) AS account_balance
          FROM
              accounts acc
          LEFT JOIN
              transactions t ON acc.id = t.account_id AND t.date <= $1
          GROUP BY
              CASE
                  WHEN acc.type = 'Income' AND t.category IS NOT NULL THEN COALESCE(t.category, 'Uncategorized Income') || COALESCE(' - ' || t.description, '')
                  WHEN acc.type = 'Expense' AND t.category IS NOT NULL THEN COALESCE(t.category, 'Uncategorized Expense') || COALESCE(' - ' || t.description, '')
                  ELSE acc.name
              END,
              acc.type
          HAVING
              COALESCE(SUM(
                  CASE
                      WHEN acc.type IN ('Asset', 'Expense') THEN
                          CASE WHEN t.type = 'expense' THEN t.amount WHEN t.type = 'income' THEN -t.amount ELSE 0 END
                      WHEN acc.type IN ('Liability', 'Equity', 'Income') THEN
                          CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END
                      ELSE 0
                  END
              ), 0) != 0 /* Only include accounts with a non-zero balance */
          ORDER BY
              account_type, account_display_name;
          `,
          [trialBalanceEndDate]
        );

        let trialAccounts = netBalancesResult.rows.map(account => {
          const accountBalance = parseFloat(String(account.account_balance || 0));
          let debitAmount = 0;
          let creditAmount = 0;

          // Determine normal balance side and place amounts accordingly
          if (account.account_type === 'Asset' || account.account_type === 'Expense') {
            // Assets and Expenses have normal debit balances
            if (accountBalance >= 0) {
              debitAmount = accountBalance;
            } else {
              creditAmount = Math.abs(accountBalance); // If negative, it's a credit balance
            }
          } else if (account.account_type === 'Liability' || account.account_type === 'Equity' || account.account_type === 'Income') {
            // Liabilities, Equity, and Income have normal credit balances
            if (accountBalance >= 0) {
              creditAmount = accountBalance;
            } else {
              debitAmount = Math.abs(accountBalance); // If negative, it's a debit balance
            }
          }

          return {
            account_display_name: account.account_display_name,
            account_type: account.account_type, // Keep for sorting/debugging
            debitAmount,
            creditAmount
          };
        });

        // Filter out accounts with zero debit and zero credit to keep the report clean
        trialAccounts = trialAccounts.filter(account => account.debitAmount !== 0 || account.creditAmount !== 0);

        // Calculate totals for rendering
        const totalDebit = trialAccounts.reduce((sum, acc) => sum + acc.debitAmount, 0);
        const totalCredit = trialAccounts.reduce((sum, acc) => sum + acc.creditAmount, 0);

        drawDocumentHeader(
          doc,
          companyName,
          'TRIAL BALANCE',
          `AS OF ${new Date(trialBalanceEndDate).toLocaleDateString('en-GB')}`,
          'Disclaimer: This trial balance is based on the provided bank statement and assumptions about transaction categorization that are LLM based utilising relevant accounting libraries.'
        );

        // Table Headers
        doc.font('Helvetica-Bold');
        doc.fillColor('#e2e8f0').rect(col1X, doc.y, doc.page.width - 100, 20).fill(); // Background for header
        doc.fillColor('#4a5568').text('Account Name', accountNameX + 5, doc.y + 5);
        doc.text('Debit (R)', debitX, doc.y + 5, { width: columnWidth, align: 'right' });
        doc.text('Credit (R)', creditX, doc.y + 5, { width: columnWidth, align: 'right' });
        doc.moveDown(0.5);
        doc.fillColor('black'); // Reset text color
        doc.font('Helvetica');


        // === Render Accounts to PDF ===
        trialAccounts.forEach(account => {
          doc.text(account.account_display_name, accountNameX, doc.y);
          doc.text(
            formatCurrencyForPdf(account.debitAmount),
            debitX, doc.y, { width: columnWidth, align: 'right' });

          doc.text(
            formatCurrencyForPdf(account.creditAmount),
            creditX, doc.y, { width: columnWidth, align: 'right' });
          doc.moveDown(0.5);
          doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(creditX + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
        });

        // === Render Totals ===
        doc.font('Helvetica-Bold');
        doc.fillColor('#e2e8f0').rect(col1X, doc.y, doc.page.width - 100, 20).fill(); // Background for totals
        doc.fillColor('#4a5568').text('Total', col1X + 5, doc.y + 5);
        doc.text(formatCurrencyForPdf(totalDebit),
          debitX, doc.y + 5, { width: columnWidth, align: 'right' });
        doc.text(formatCurrencyForPdf(totalCredit),
          creditX, doc.y + 5, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.fillColor('black'); // Reset text color
        doc.font('Helvetica');
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(creditX + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(creditX + columnWidth, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(8).fillColor('#4a5568').text(`Statement Period: ${new Date(trialBalanceStartDate).toLocaleDateString('en-GB')} to ${new Date(trialBalanceEndDate).toLocaleDateString('en-GB')}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown();

        break;
      }

      case 'cash-flow-statement': {
        type TransactionRow = {
          type: string;
          category: string;
          amount: number;
        };

        const classify = (row: { category: string }): 'operating' | 'investing' | 'financing' => {
          const cat = (row.category || '').toLowerCase();
          if (['equipment', 'property', 'asset', 'vehicle'].some(k => cat.includes(k))) return 'investing';
          if (['loan', 'members loan', 'shareholders loan', 'credit facility'].some(k => cat.includes(k))) return 'financing';
          return 'operating';
        };

        const cashFlows: { operating: TransactionRow[]; investing: TransactionRow[]; financing: TransactionRow[] } = {
          operating: [],
          investing: [],
          financing: [],
        };

        const rowsResult = await pool.query(
          `SELECT type, category, amount FROM transactions WHERE date >= $1 AND date <= $2 AND (type = 'income' OR type = 'expense');`,
          [startDate, endDate]
        );
        const rows: TransactionRow[] = rowsResult.rows;

        rows.forEach((row) => {
          const section = classify(row);
          const amount = row.type === 'income' ? parseFloat(row.amount as any) : -parseFloat(row.amount as any);
          cashFlows[section].push({ ...row, amount });
        });

        const renderSection = (title: string, items: TransactionRow[]) => {
          doc.font('Helvetica-Bold').fontSize(12).text(title, col1X, doc.y);
          doc.moveDown(0.5);
          doc.font('Helvetica');

          let total = 0;
          items.forEach(item => {
            doc.text(`  ${item.category || 'Uncategorized'}`, col1X + 20, doc.y);
            doc.text(formatCurrencyForPdf(item.amount), col2X, doc.y, { width: columnWidth, align: 'right' });
            total += item.amount;
            doc.moveDown(0.5);
            doc.lineWidth(0.2).strokeColor('#e2e8f0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
            doc.moveDown(0.5);
          });

          doc.font('Helvetica-Bold');
          doc.text(`Net ${title}`, col1X, doc.y);
          doc.text(formatCurrencyForPdf(total), col2X, doc.y, { width: columnWidth, align: 'right' });
          doc.moveDown(1);
          doc.lineWidth(0.5).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
          doc.moveDown(0.5);
          doc.font('Helvetica');

          return total;
        };

        drawDocumentHeader(
          doc,
          companyName,
          'CASH FLOW STATEMENT',
          `FOR THE PERIOD ENDED ${new Date(endDate.toString()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`
        );

        const totalOperating = renderSection('Operating Activities', cashFlows.operating);
        const totalInvesting = renderSection('Investing Activities', cashFlows.investing);
        const totalFinancing = renderSection(
          'Financing Activities',
          cashFlows.financing
        );

        const netIncreaseInCash = totalOperating + totalInvesting + totalFinancing;

        doc.font('Helvetica-Bold').fontSize(12).text('Net Increase / (Decrease) in Cash', col1X, doc.y);
        doc.text(formatCurrencyForPdf(netIncreaseInCash), col2X, doc.y, { width: columnWidth, align: 'right' });
        doc.moveDown();
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown(0.5);
        doc.lineWidth(1).strokeColor('#a0aec0').moveTo(col1X, doc.y).lineTo(col2X + columnWidth, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(8).fillColor('#4a5568').text(`Statement Period: ${new Date(startDate as string).toLocaleDateString('en-GB')} to ${new Date(endDate as string).toLocaleDateString('en-GB')}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown();

        break;
      }


      default:
        doc.text('Document type not supported.', { align: 'center' });
        doc.end();
        return;
    }

    doc.end();

  } catch (error: unknown) { // Changed 'err' to 'error: unknown'
    console.error(`Error generating ${documentType}:`, error);
    res.removeHeader('Content-Disposition');
    res.writeHead(500, { 'Content-Type': 'application/json' });

    if (error instanceof Error) {
      res.end(JSON.stringify({ error: `Failed to generate ${documentType}`, details: error.message }));
    } else {
      res.end(JSON.stringify({ error: `Failed to generate ${documentType}`, details: String(error) }));
    }
  }
});


// Assuming app and PORT are defined elsewhere in your server file
// app.listen(PORT, () => {
//   console.log(`Node server running on http://localhost:${PORT}`);
// });



app.listen(PORT, () => {
  console.log(`Node server running on http://localhost:${PORT}`);
});

