/**
 * AI-Powered PDF Transaction Extractor
 * Uses OpenAI API for intelligent extraction of French bank statements
 */

class AITransactionExtractor {
    constructor(apiKey = null) {
        this.apiKey = apiKey || this.getAPIKeyFromUser();
        this.baseURL = 'https://api.openai.com/v1/chat/completions';
    }

    /**
     * Get API key from user input
     */
    getAPIKeyFromUser() {
        const apiKey = prompt("Please enter your OpenAI API key for intelligent transaction extraction:");
        if (!apiKey) {
            throw new Error("OpenAI API key is required for AI extraction");
        }
        return apiKey;
    }

    /**
     * Extract transactions using AI
     * @param {string} pdfText - Raw text from PDF
     * @returns {Promise<Array>} Array of extracted transactions
     */
    async extractTransactions(pdfText) {
        console.log('🤖 Starting AI-powered extraction...');
        
        const prompt = this.buildExtractionPrompt(pdfText);
        
        try {
            const response = await fetch(this.baseURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // Cost-effective model
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
                    temperature: 0.1, // Low temperature for consistent extraction
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const extractedData = data.choices[0].message.content;
            
            console.log('🤖 AI Response received:', extractedData.substring(0, 200) + '...');
            
            return this.parseAIResponse(extractedData);
            
        } catch (error) {
            console.error('❌ AI extraction failed:', error);
            throw new Error(`AI extraction failed: ${error.message}`);
        }
    }

    /**
     * Build the extraction prompt for the AI
     * @param {string} pdfText - Raw PDF text
     * @returns {string} Formatted prompt
     */
    buildExtractionPrompt(pdfText) {
        return `
You are analyzing a Société Générale bank statement. I need you to extract ALL transactions that appear in the DEBIT column (expenses/money going out).

EXACT PDF FORMAT I'm seeing:
- Table with columns: Date | Valeur | Nature de l'opération | Débit | Crédit
- Amounts in French format: 2 000,00 or 1 360,46 or 60,00
- Dates in DD/MM/YYYY format
- Only extract transactions that have amounts in the DÉBIT column

SPECIFIC TRANSACTION TYPES TO INCLUDE:
1. "VIR INSTANTANE EMIS NET POUR: [Name]" with amounts like "2 000,00"
2. "PRELEVEMENT EUROPEEN [Details]" with amounts like "186,39" 
3. "CARTE X2148 [Store name]" with amounts like "11,24"
4. "REMISE CB [Details]" ONLY if in DÉBIT column
5. Any other transaction with amount in DÉBIT column

EXAMPLES FROM YOUR PDF FORMAT:
- "02/01/2025 02/01/2025 VIR INSTANTANE EMIS NET POUR: M. JORGE GOENAGA PEREZ ... 2 000,00" → Extract this
- "06/01/2025 06/01/2025 PRELEVEMENT EUROPEEN 031906338 DE: GG CORPORATE ... 186,39" → Extract this  
- "24/01/2025 24/01/2025 CARTE X2148 23/01 CARREFOUR CITY ... 11,24" → Extract this
- Ignore any line that has amount in CRÉDIT column only

BANK STATEMENT TEXT:
${pdfText}

Look for the pattern: DATE DATE DESCRIPTION ... AMOUNT in the text above.
Extract EVERY transaction that has a DÉBIT amount. Return in this JSON format:
{
  "transactions": [
    {
      "date": "02/01/2025",
      "valeur": "02/01/2025",
      "description": "VIR INSTANTANE EMIS NET POUR: M. JORGE GOENAGA PEREZ",
      "amount": "2 000,00",
      "type": "debit"
    }
  ]
}

CRITICAL RULES:
- Keep amounts EXACTLY as shown (2 000,00 not 2000.00)
- Include complete description text
- Only transactions from DÉBIT column
- Include ALL débit transactions, even small ones like 8,00€
- Preserve French formatting exactly`;
    }

    /**
     * Parse AI response into transaction objects
     * @param {string} aiResponse - JSON response from AI
     * @returns {Array} Parsed transactions
     */
    parseAIResponse(aiResponse) {
        try {
            // Clean the response (remove markdown formatting if present)
            let cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const data = JSON.parse(cleanResponse);
            
            if (!data.transactions || !Array.isArray(data.transactions)) {
                throw new Error("Invalid AI response format");
            }

            console.log(`🤖 AI extracted ${data.transactions.length} transactions`);
            
            return data.transactions.map((tx, index) => ({
                date: tx.date,
                valeur: tx.valeur || tx.date,
                nature: tx.description,
                debit: tx.amount,
                credit: null,
                source: 'AI'
            }));
            
        } catch (error) {
            console.error('❌ Failed to parse AI response:', error);
            console.log('Raw AI response:', aiResponse);
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
    }

    /**
     * Categorize transactions using AI
     * @param {Array} transactions - Extracted transactions
     * @returns {Promise<Array>} Categorized transactions
     */
    async categorizeTransactions(transactions) {
        console.log('🤖 Starting AI categorization...');
        
        const categories = [
            'MASSE SALARIALE', 'FRAIS BANQUE', 'INTERNET', 'ASSURANCE', 
            'LOYER CABINET', 'GYM', 'CHARGES SOCIALES', 'LEASING MOTO',
            'LEASING VOITURE', 'MUTUELLE', 'MATERIEL CABINET', 
            'LOGICIEL CABINET', 'PREVOYANCE', 'TPE BANQUE', 'AUTRES'
        ];

        const prompt = `
Please categorize these French business transactions into the appropriate categories.

AVAILABLE CATEGORIES:
${categories.join(', ')}

CATEGORIZATION RULES:
- VIR INSTANTANE EMIS NET = MASSE SALARIALE (salary payments)
- PRELEVEMENT + ORANGE/SFR/FREE = INTERNET
- PRELEVEMENT + ASSURANCE/MAIF/MACIF = ASSURANCE
- LOYER/LOCATION = LOYER CABINET
- GYM/FITNESS/SPORT = GYM
- URSSAF/CHARGES SOCIALES = CHARGES SOCIALES
- If unsure, use AUTRES

TRANSACTIONS TO CATEGORIZE:
${transactions.map((tx, i) => `${i+1}. ${tx.nature} - ${tx.debit}`).join('\n')}

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

        try {
            const response = await fetch(this.baseURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
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
                    max_tokens: 2000
                })
            });

            const data = await response.json();
            const categorizedData = JSON.parse(data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

            // Apply categorization to transactions
            return transactions.map((tx, index) => {
                const categorization = categorizedData.categorized.find(c => c.index === index + 1);
                return {
                    ...tx,
                    category: categorization?.category || 'AUTRES',
                    confidence: categorization?.confidence || 'low'
                };
            });

        } catch (error) {
            console.error('❌ AI categorization failed:', error);
            // Return transactions with default categorization
            return transactions.map(tx => ({
                ...tx,
                category: 'AUTRES',
                confidence: 'low'
            }));
        }
    }

    /**
     * Extract client names using AI
     * @param {Array} transactions - Transactions to process
     * @returns {Promise<Array>} Transactions with extracted client names
     */
    async extractClientNames(transactions) {
        console.log('🤖 Extracting client names with AI...');

        const prompt = `
Please extract the client/company names from these French bank transaction descriptions.

EXTRACTION RULES:
- For "VIR INSTANTANE EMIS NET POUR: M. JOHN DOE" → extract "M. JOHN DOE"
- For "PRELEVEMENT EUROPEEN DE: ORANGE BUSINESS" → extract "ORANGE BUSINESS"  
- For "CARTE X2148 CARREFOUR CITY" → extract "CARREFOUR CITY"
- Remove prefixes like "DE:", "POUR:", "PRELEVEMENT", etc.
- Extract the actual business/person name

TRANSACTIONS:
${transactions.map((tx, i) => `${i+1}. ${tx.nature}`).join('\n')}

Return JSON format:
{
  "clients": [
    {
      "index": 1,
      "client_name": "Extracted Name"
    }
  ]
}`;

        try {
            const response = await fetch(this.baseURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert at extracting business names and client names from French bank transaction descriptions."
                        },
                        {
                            role: "user", 
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 1500
                })
            });

            const data = await response.json();
            const clientData = JSON.parse(data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());

            // Apply client names to transactions
            return transactions.map((tx, index) => {
                const clientInfo = clientData.clients.find(c => c.index === index + 1);
                return {
                    ...tx,
                    client_name: clientInfo?.client_name || 'Unknown Client'
                };
            });

        } catch (error) {
            console.error('❌ Client name extraction failed:', error);
            return transactions.map(tx => ({
                ...tx,
                client_name: 'Unknown Client'
            }));
        }
    }

    /**
     * Full AI processing pipeline
     * @param {string} pdfText - Raw PDF text
     * @returns {Promise<Array>} Fully processed transactions
     */
    async processTransactions(pdfText) {
        try {
            console.log('🤖 Starting full AI processing pipeline...');
            
            // Step 1: Extract transactions
            const transactions = await this.extractTransactions(pdfText);
            
            if (transactions.length === 0) {
                throw new Error('No transactions extracted by AI');
            }
            
            // Step 2: Categorize transactions
            const categorizedTransactions = await this.categorizeTransactions(transactions);
            
            // Step 3: Extract client names
            const finalTransactions = await this.extractClientNames(categorizedTransactions);
            
            console.log(`🤖 AI processing complete: ${finalTransactions.length} transactions processed`);
            
            return finalTransactions;
            
        } catch (error) {
            console.error('❌ AI processing pipeline failed:', error);
            throw error;
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AITransactionExtractor;
} else {
    window.AITransactionExtractor = AITransactionExtractor;
}
