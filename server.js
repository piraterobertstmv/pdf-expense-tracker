const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// CORS configuration - Allow all origins for now to fix CORS issues
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' })); // Increase limit for PDF text
// Remove static file serving for production API-only backend
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static('.')); // Only serve static files in development
}

// Root endpoint - API identification
app.get('/', (req, res) => {
    res.json({
        name: 'PDF Expense Tracker API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            extract: '/api/extract-transactions',
            categorize: '/api/categorize-transactions'
        },
        frontend: 'https://pdf-expense-tracker.vercel.app'
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('Health check requested');
    res.json({ 
        status: 'OK', 
        message: 'PDF Expense Tracker API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// OpenAI API proxy endpoint
app.post('/api/extract-transactions', async (req, res) => {
    try {
        const { pdfText } = req.body;
        
        if (!pdfText) {
            return res.status(400).json({ error: 'PDF text is required' });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured' });
        }

        console.log('🤖 Processing PDF text with AI...');
        console.log('📄 PDF text length:', pdfText.length);

        const prompt = buildExtractionPrompt(pdfText);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert at extracting financial data from French bank statements. You understand Société Générale formats perfectly and can identify debit transactions (expenses) accurately."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
                
                // Handle specific OpenAI errors with user-friendly messages
                if (response.status === 503) {
                    errorMessage = 'OpenAI API is temporarily unavailable. Please try again in a few minutes.';
                } else if (response.status === 429) {
                    errorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
                } else if (response.status === 401) {
                    errorMessage = 'OpenAI API authentication failed. Please check API key.';
                } else if (response.status === 500) {
                    errorMessage = 'OpenAI API internal error. Please try again.';
                }
            } catch (parseError) {
                // If we can't parse the error, use status text
                errorMessage = response.statusText || errorMessage;
            }
            
            console.error('❌ OpenAI API Error:', response.status, errorMessage);
            return res.status(response.status).json({ 
                error: `OpenAI API error: ${errorMessage}`,
                details: 'The AI service is temporarily unavailable. Please try again in a few minutes.'
            });
        }

        const data = await response.json();
        const extractedData = data.choices[0].message.content;
        
        console.log('🤖 AI Response received:', extractedData.substring(0, 200) + '...');
        
        // Parse AI response
        const transactions = parseAIResponse(extractedData);
        
        console.log(`✅ Successfully extracted ${transactions.length} transactions`);
        
        res.json({ 
            success: true, 
            transactions,
            message: `Extracted ${transactions.length} debit transactions`
        });

    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

// Categorization endpoint
app.post('/api/categorize-transactions', async (req, res) => {
    try {
        const { transactions } = req.body;
        
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ error: 'Transactions array is required' });
        }

        console.log('🤖 Categorizing', transactions.length, 'transactions...');

        const categories = [
            'MASSE SALARIALE', 'FRAIS BANQUE', 'INTERNET', 'ASSURANCE', 
            'LOYER CABINET', 'GYM', 'CHARGES SOCIALES', 'LEASING MOTO',
            'LEASING VOITURE', 'MUTUELLE', 'MATERIEL CABINET', 
            'LOGICIEL CABINET', 'PREVOYANCE', 'TPE BANQUE', 'AUTRES'
        ];

        const prompt = buildCategorizationPrompt(transactions, categories);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system", 
                        content: "You are an expert at categorizing French business expenses. You understand French transaction descriptions and can categorize them accurately."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
                
                // Handle specific OpenAI errors
                if (response.status === 503) {
                    errorMessage = 'OpenAI API is temporarily unavailable. Please try again in a few minutes.';
                } else if (response.status === 429) {
                    errorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
                } else if (response.status === 401) {
                    errorMessage = 'OpenAI API authentication failed. Please check API key.';
                } else if (response.status === 500) {
                    errorMessage = 'OpenAI API internal error. Please try again.';
                }
            } catch (parseError) {
                errorMessage = response.statusText || errorMessage;
            }
            
            console.error('❌ OpenAI Categorization API Error:', response.status, errorMessage);
            return res.status(response.status).json({ 
                error: `OpenAI API error: ${errorMessage}`,
                details: 'The AI categorization service is temporarily unavailable. Please try again in a few minutes.'
            });
        }

        const data = await response.json();
        const categorizedData = JSON.parse(data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

        // Apply categorization to transactions
        const categorizedTransactions = transactions.map((tx, index) => {
            const categorization = categorizedData.categorized.find(c => c.index === index + 1);
            return {
                ...tx,
                category: categorization?.category || 'AUTRES',
                confidence: categorization?.confidence || 'low'
            };
        });

        res.json({ 
            success: true, 
            transactions: categorizedTransactions,
            message: `Categorized ${categorizedTransactions.length} transactions`
        });

    } catch (error) {
        console.error('❌ Categorization error:', error);
        res.status(500).json({ 
            error: 'Categorization failed', 
            message: error.message 
        });
    }
});

// Helper functions
function buildExtractionPrompt(pdfText) {
    return `
You are analyzing a Société Générale bank statement. ONLY extract transactions that have amounts in the DÉBIT column (outflows/expenses). NEVER extract transactions from the CRÉDIT column (inflows).
CRITICAL RULE: DÉBIT ONLY - NO CRÉDIT TRANSACTIONS
- DÉBIT column = Money going OUT (expenses) ✅ EXTRACT THESE
- CRÉDIT column = Money coming IN (income) ❌ NEVER EXTRACT THESE

TABLE STRUCTURE:
Date | Valeur | Nature de l'opération | Débit | Crédit

VISUAL IDENTIFICATION:
- Look at each transaction line
- If amount appears in DÉBIT column (left side) → EXTRACT
- If amount appears in CRÉDIT column (right side) → SKIP

DÉBIT TRANSACTIONS TO EXTRACT (expenses/outflows):
✅ "VIR INSTANTANE EMIS NET POUR: [Name]" → Salary payments (DÉBIT)
✅ "PRELEVEMENT EUROPEEN DE: [Company]" → Direct debits (DÉBIT)0'¡008
✅ "CARTE X2148 [Store]" → Card purchases (DÉBIT)
✅ "PRELEVEMENT [Service]" → Service payments (DÉBIT)

CRÉDIT TRANSACTIONS TO SKIP (income/inflows):
❌ "REMISE CB" → Card refunds (CRÉDIT) - DO NOT EXTRACT
❌ "VIREMENT RECU" → Received transfers (CRÉDIT) - DO NOT EXTRACT
❌ "AVANTAGE COMMERCIAL COTIS VISA BUSINESS" → Credit/cashback (CRÉDIT) - DO NOT EXTRACT
❌ "VIR INST RE" → Received transfers (CRÉDIT) - DO NOT EXTRACT
SPECIFIC EXAMPLES FROM YOUR PDF:
✅ EXTRACT: "24/01/2025 CARTE X2148 23/01 CARREFOUR CITY    11,04" (DÉBIT column)
❌ SKIP: "25/01/2025 AVANTAGE COMMERCIAL COTIS VISA BUSINESS    9,94" (CRÉDIT column)
✅ EXTRACT: "27/01/2025 CARTE X2148 24/01 MAGASINS NICOL    97,00" (DÉBIT column)
❌ SKIP: "27/01/2025 REMISE CB 24/01 R70304    179,37" (CRÉDIT column)

BANK STATEMENT TEXT:
${pdfText}

EXTRACTION PROCESS:
1. Scan each line with a date (DD/MM/YYYY)
2. Identify if the amount is in DÉBIT or CRÉDIT column
3. ONLY extract if amount is in DÉBIT column
4. Preserve exact French formatting: "2 000,00", "1 360,46", "89,50"

CLIENT EXTRACTION RULES:
Extract clear client names from transaction descriptions. NEVER use "Unknown Client".

CLIENT IDENTIFICATION PATTERNS:
✅ "VIR INSTANTANE EMIS NET POUR: [NAME]" → Client = [NAME]
✅ "PRELEVEMENT EUROPEEN DE: [COMPANY]" → Client = [COMPANY] 
✅ "CARTE X2148 DD/MM [STORE NAME]" → Client = [STORE NAME]
✅ "PRELEVEMENT [SERVICE PROVIDER]" → Client = [SERVICE PROVIDER]
✅ "PRELEVEMENT EUROPEEN [NUMBER] [COMPANY]" → Client = [COMPANY]
✅ "[COMPANY NAME] REF: [NUMBER]" → Client = [COMPANY NAME]
✅ "TPE [MERCHANT NAME]" → Client = [MERCHANT NAME]
✅ "FRAIS [SERVICE TYPE]" → Client = "BANK FEES"
✅ "COTISATION [SERVICE]" → Client = [SERVICE]
✅ "COMMISSION [SERVICE]" → Client = [SERVICE]
✅ "ABONNEMENT [SERVICE]" → Client = [SERVICE]

ADVANCED EXTRACTION RULES:
- Extract company names even with reference numbers
- Remove technical codes/numbers from client names
- Use meaningful business names, not transaction codes
- For fees/charges, use descriptive client names

COMMON CLIENT PATTERNS:
- Business names: "CARREFOUR CITY", "MAGASINS NICOL", "SUMUP"
- Service providers: "ORANGE BUSINESS SERVICES", "SOCIETE GENERALE"
- People names: "M. JORGE GOENAGA PEREZ", "Ana STEFANOVIC"
- Government: "URSSAF", "DGFIP", "IMPOTS"
- Banks: "SOCIETE GENERALE", "BNP PARIBAS"
- Fees: "BANK FEES", "CARD FEES", "ACCOUNT FEES"

CLIENT EXTRACTION EXAMPLES:
"CARTE X2148 01/02 SUMUP" → Client: "SUMUP"
"VIR INSTANTANE EMIS NET POUR: Ana STEFANOVIC" → Client: "Ana STEFANOVIC"  
"PRELEVEMENT EUROPEEN ORANGE BUSINESS SERVICES" → Client: "ORANGE BUSINESS SERVICES"
"PRELEVEMENT EUROPEEN 325960010 URSSAF" → Client: "URSSAF"
"TPE BANQUE SOCIETE GENERALE" → Client: "SOCIETE GENERALE"
"FRAIS TENUE DE COMPTE" → Client: "BANK FEES"
"COTISATION CARTE VISA" → Client: "VISA FEES"
"COMMISSION INTERVENTION" → Client: "BANK FEES"

If client name is unclear, use the main business/service mentioned in description.

Return ONLY DÉBIT transactions in this JSON format:
{
  "transactions": [
    {
      "date": "02/01/2025",
      "valeur": "02/01/2025", 
      "description": "VIR INSTANTANE EMIS NET POUR: M. JORGE GOENAGA PEREZ",
      "amount": "2 000,00",
      "client": "M. JORGE GOENAGA PEREZ",
      "type": "debit"
    }
  ]
}

ENHANCED COLUMN DETECTION - DÉBIT ONLY EXTRACTION:

CRITICAL RULE: Extract ONLY if amount appears in DÉBIT column (4th column position)

TABLE STRUCTURE ANALYSIS:
Date | Valeur | Nature de l'opération | Débit | Crédit

PRECISE COLUMN DETECTION METHOD:
1. Each transaction line has this exact pattern:
   "DD/MM/YYYY DD/MM/YYYY [Description text] [DÉBIT amount or empty] [CRÉDIT amount or empty]"

2. DÉBIT Column Identification:
   ✅ EXTRACT: Amount appears BEFORE any trailing spaces at line end
   ✅ EXTRACT: Amount is LEFT-ALIGNED in the amount area
   ✅ EXTRACT: Line ends with: "...description AMOUNT" (no trailing amount)

3. CRÉDIT Column Identification:
   ❌ SKIP: Amount appears AFTER significant spacing
   ❌ SKIP: Amount is RIGHT-ALIGNED at very end of line
   ❌ SKIP: Line has pattern: "...description        AMOUNT" (right-aligned)

EXACT EXAMPLES FROM YOUR FEBRUARY PDF:

✅ DÉBIT PATTERNS (EXTRACT THESE):
"03/02/2025 03/02/2025 CARTE X2148 01/02 SUMUP 14,00"
"04/02/2025 04/02/2025 VIR INSTANTANE EMIS NET POUR: Ana STEFANOVIC 1 360,46"
"05/02/2025 05/02/2025 PRELEVEMENT EUROPEEN 325960010 3 869,00"
"10/02/2025 10/02/2025 CARTE X2148 10/02 FRANKPRIX 5065 10,95"

❌ CRÉDIT PATTERNS (SKIP THESE):
"27/02/2025 27/02/2025 REMISE CB 24/01 R70304 CT36631988501                    179,37"
"28/02/2025 28/02/2025 VIR INST RE 552893677541                               480,00"
"07/02/2025 07/02/2025 REMISE CB 06/02 R44894 CT36631988501                   284,34"

SPACING PATTERN ANALYSIS:
- DÉBIT: Amount follows description with 1-3 spaces
- CRÉDIT: Amount follows description with 10+ spaces (right-aligned)

SPACING ANALYSIS:
- DÉBIT amounts: Appear immediately after description with minimal spacing
- CRÉDIT amounts: Appear after significant whitespace/padding at line end

EXTRACTION VALIDATION:
For each potential transaction:
1. Locate the amount in the line
2. Check spacing pattern before the amount
3. If minimal spacing = DÉBIT ✅ EXTRACT
4. If extensive spacing = CRÉDIT ❌ SKIP

FINAL VALIDATION: Every extracted amount must be from DÉBIT column - check spacing pattern not just amount presence`;
}

function buildCategorizationPrompt(transactions, categories) {
    return `
Categorize these French PROFESSIONAL business transactions based on real Société Générale statement patterns.

AVAILABLE CATEGORIES:
${categories.join(', ')}

ENHANCED CATEGORIZATION RULES (based on real statement analysis):
- **VIR INSTANTANE EMIS NET POUR**: [Person Name] = MASSE SALARIALE (salary payments)
- **PRELEVEMENT EUROPEEN** + company names = Match to appropriate category:
  - GG CORPORATE, ORANGE, SFR, FREE = INTERNET
  - ASSURANCE, MAIF, MACIF, AXA = ASSURANCE  
  - URSSAF, CHARGES SOCIALES = CHARGES SOCIALES
  - Bank names, SOCIETE GENERALE = FRAIS BANQUE
- **CARTE X2148** + store names:
  - CARREFOUR, supermarkets = MATERIEL CABINET (supplies)
  - Gym, fitness centers = GYM
  - Gas stations, parking = LEASING VOITURE (car expenses)
- **REMISE CB** = Credit transactions, categorize by merchant
- **PRELEVEMENT** + service names = Match to service type

REAL EXAMPLES FROM STATEMENT:
- "VIR INSTANTANE EMIS NET POUR: M. JORGE GOENAGA PEREZ" → MASSE SALARIALE
- "PRELEVEMENT EUROPEEN DE: GG CORPORATE" → INTERNET  
- "CARTE X2148 CARREFOUR CITY" → MATERIEL CABINET
- "PRELEVEMENT EUROPEEN URSSAF" → CHARGES SOCIALES

TRANSACTIONS TO CATEGORIZE:
${transactions.map((tx, i) => `${i+1}. ${tx.description} - ${tx.amount}`).join('\n')}

Return JSON format:
{
  "categorized": [
    {
      "index": 1,
      "category": "CATEGORY_NAME", 
      "confidence": "high/medium/low"
    }
  ]
}`;
}

function parseAIResponse(aiResponse) {
    try {
        // Clean the response (remove markdown formatting if present)
        let cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Handle truncated JSON by attempting to fix common issues
        if (!cleanResponse.endsWith('}') && !cleanResponse.endsWith(']')) {
            console.log('⚠️ Detected truncated JSON response, attempting to fix...');
            
            // Find the last complete transaction
            const lastCompleteTransaction = cleanResponse.lastIndexOf('    }');
            if (lastCompleteTransaction !== -1) {
                cleanResponse = cleanResponse.substring(0, lastCompleteTransaction + 5) + '\n  ]\n}';
            }
        }
        
        const data = JSON.parse(cleanResponse);
        
        if (!data.transactions || !Array.isArray(data.transactions)) {
            throw new Error("Invalid AI response format - missing transactions array");
        }

        console.log(`✅ Successfully parsed ${data.transactions.length} transactions from AI response`);

        return data.transactions.map((tx, index) => ({
            date: tx.date,
            valeur: tx.valeur || tx.date,
            description: tx.description,
            amount: tx.amount,
            client: tx.client, // Include AI-extracted client name
            type: tx.type || 'debit'
        }));
        
    } catch (error) {
        console.error('❌ Failed to parse AI response:', error);
        console.log('Raw AI response length:', aiResponse.length);
        console.log('Raw AI response (last 500 chars):', aiResponse.slice(-500));
        throw new Error(`Failed to parse AI response: ${error.message}`);
    }
}

// Start server
app.listen(PORT, () => {
        console.log(`🚀 PDF Expense Tracker API running on port ${PORT}`);
        console.log(`📄 Frontend available at https://pdf-expense-tracker.vercel.app`);
        console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
        console.log(`🌐 API URL: https://pdf-expense-tracker-api.onrender.com`);
    });

module.exports = app;
