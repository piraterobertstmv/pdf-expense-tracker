/**
 * PDF Extractor for French Bank Statements
 * Specifically designed for Société Générale format
 */

class BankStatementExtractor {
    constructor() {
        this.costCategories = [
            'ASSURANCE',
            'CHARGES SOCIALES', 
            'CREDIT CABINET',
            'FRAIS BANQUE',
            'GYM',
            'INTERNET',
            'LEASING MOTO',
            'LEASING VOITURE',
            'LOGICIEL CABINET',
            'LOYER CABINET',
            'MASSE SALARIALE',
            'MATERIEL CABINET',
            'MUTUELLE',
            'MUTUELLE SALARIÉ',
            'PREVOYANCE',
            'TPE BANQUE',
            'URSSAF/CHARGES SOCIALES'
        ];
    }

    /**
     * Extract text from PDF using PDF.js
     * @param {File} pdfFile - The uploaded PDF file
     * @returns {Promise<string>} Extracted text content
     */
    async extractTextFromPDF(pdfFile) {
        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            return fullText;
        } catch (error) {
            console.error('Error extracting PDF text:', error);
            throw new Error('Failed to extract text from PDF');
        }
    }

    /**
     * Parse French bank statement text to extract transactions
     * @param {string} text - Raw text from PDF
     * @returns {Array} Array of transaction objects
     */
    parseTransactions(text) {
        const transactions = [];
        const lines = text.split('\n');
        
        console.log('Parsing transactions from', lines.length, 'lines');
        
        // Look for transaction patterns in the text
        // Simplified patterns that work with the actual PDF format
        const patterns = [
            // Very flexible pattern: Date Date Description Amount (with or without spaces in amount)
            /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:\s?\d{3})*,\d{2}|\d+,\d{2})/g,
            // Even more flexible: just look for dates and amounts
            /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d[\d\s]*,\d{2})/g,
            // Fallback: single date with description and amount
            /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:\s?\d{3})*,\d{2}|\d+,\d{2})/g
        ];
        
        // Try each pattern
        patterns.forEach((pattern, index) => {
            console.log(`Trying pattern ${index + 1}:`);
            let match;
            while ((match = pattern.exec(text)) !== null) {
                let date, valeur, nature, amount;
                
                if (match.length === 5) {
                    // Standard format: Date Date Description Amount
                    [, date, valeur, nature, amount] = match;
                } else if (match.length === 4) {
                    // Compact format: Date Description Amount
                    [, date, nature, amount] = match;
                    valeur = date; // Use same date for valeur
                }
                
                console.log('Found potential transaction:', { 
                    pattern: index + 1, 
                    date, 
                    valeur, 
                    nature: nature.substring(0, 50), 
                    amount 
                });
                
                // Check if we already have this transaction (avoid duplicates)
                const isDuplicate = transactions.some(t => 
                    t.date === date && 
                    t.debit === amount && 
                    (t.nature.substring(0, 30) === nature.substring(0, 30) || 
                     nature.substring(0, 30).includes(t.nature.substring(0, 30)))
                );
                
                if (!isDuplicate) {
                    // Determine if it's a debit or credit based on context
                    const isDebit = this.isDebitTransaction(match[0], nature);
                    
                console.log(`Transaction analysis:`, {
                    nature: nature.substring(0, 40),
                    raw_amount: amount,
                    formatted_amount: amount + '€',
                    classified_as: isDebit ? 'DEBIT' : 'CREDIT'
                });
                    
                    if (isDebit) {
                        transactions.push({
                            date,
                            valeur,
                            nature: nature.trim(),
                            debit: amount,
                            credit: null
                        });
                        console.log('✅ Added debit transaction:', nature.substring(0, 40));
                    } else {
                        transactions.push({
                            date,
                            valeur,
                            nature: nature.trim(),
                            debit: null,
                            credit: amount
                        });
                        console.log('❌ Skipped credit transaction:', nature.substring(0, 40));
                    }
                } else {
                    console.log('🔄 Skipped duplicate transaction:', nature.substring(0, 40));
                }
            }
        });
        
        // Always try line-by-line parsing as additional backup
        console.log('Regex found', transactions.length, 'transactions, trying line-by-line as backup');
        const lineByLineTransactions = this.parseTransactionsLineByLine(lines);
        
        // Merge results, avoiding duplicates
        lineByLineTransactions.forEach(newTx => {
            const isDuplicate = transactions.some(existingTx => 
                existingTx.date === newTx.date && 
                existingTx.debit === newTx.debit &&
                existingTx.nature.substring(0, 20) === newTx.nature.substring(0, 20)
            );
            if (!isDuplicate) {
                transactions.push(newTx);
            }
        });
        
        console.log('Total transactions found:', transactions.length);
        return transactions.filter(t => t.debit); // Only return debit transactions
    }
    
    /**
     * Fallback line-by-line parsing method
     * @param {Array} lines - Array of text lines
     * @returns {Array} Array of transaction objects
     */
    parseTransactionsLineByLine(lines) {
        const transactions = [];
        let inOperationsSection = false;
        
        console.log('Starting line-by-line parsing...');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for operations section
            if (line.includes('RELEVÉ DES OPÉRATIONS') || 
                line.includes('RELEVE DES OPERATIONS') ||
                (line.includes('Date') && line.includes('Valeur'))) {
                inOperationsSection = true;
                console.log('Found operations section at line', i);
                continue;
            }
            
            if (!inOperationsSection || line.length === 0) continue;
            
            // Look for any line with amounts (more aggressive)
            const amountMatch = line.match(/(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/);
            if (amountMatch && /\d{2}\/\d{2}\/\d{4}/.test(line)) {
                console.log('Found potential transaction line:', line.substring(0, 100));
                
                // Try to parse this line directly
                const transaction = this.parseTransactionLine(line);
                if (transaction && transaction.debit) {
                    transactions.push(transaction);
                    console.log('Line-by-line found:', transaction.nature.substring(0, 30), transaction.debit);
                }
            }
            
            // Also try the original approach for date-starting lines
            if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) {
                // Try to combine with next few lines to get complete transaction
                let fullTransaction = line;
                let j = i + 1;
                while (j < lines.length && j < i + 3) {
                    const nextLine = lines[j].trim();
                    if (nextLine && !/^\d{2}\/\d{2}\/\d{4}/.test(nextLine)) {
                        fullTransaction += ' ' + nextLine;
                        j++;
                    } else {
                        break;
                    }
                }
                
                // Only try if we don't have an amount in the original line
                if (!/(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/.test(line)) {
                    console.log('Trying to parse combined line:', fullTransaction.substring(0, 100));
                    
                    const transaction = this.parseTransactionLine(fullTransaction);
                    if (transaction && transaction.debit) {
                        transactions.push(transaction);
                        console.log('Line-by-line combined found:', transaction.nature.substring(0, 30));
                    }
                }
                
                i = j - 1; // Skip the lines we already processed
            }
        }
        
        console.log('Line-by-line parsing found', transactions.length, 'transactions');
        return transactions;
    }

    /**
     * Parse a single transaction line
     * @param {string} line - Current line
     * @param {string} nextLine - Next line for context
     * @returns {Object|null} Transaction object or null
     */
    parseTransactionLine(line, nextLine = '') {
        // French date pattern: DD/MM/YYYY
        const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
        const dates = line.match(datePattern);
        
        if (!dates || dates.length < 1) {
            return null;
        }
        
        // Amount patterns (French format: 1 234,56)
        const amountPattern = /(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d+)/g;
        const amounts = line.match(amountPattern);
        
        if (!amounts) {
            return null;
        }
        
        // Extract transaction details
        const date = dates[0];
        const valeur = dates[1] || dates[0];
        
        // Find the nature of operation (text between dates and amounts)
        let nature = line;
        dates.forEach(d => nature = nature.replace(d, ''));
        amounts.forEach(a => nature = nature.replace(a, ''));
        nature = nature.trim().replace(/\s+/g, ' ');
        
        // Determine if it's debit or credit based on position and context
        const lastAmount = amounts[amounts.length - 1];
        const isDebit = this.isDebitTransaction(line, nature);
        
        return {
            date,
            valeur,
            nature,
            debit: isDebit ? lastAmount : null,
            credit: !isDebit ? lastAmount : null
        };
    }

    /**
     * Check if line contains a date
     * @param {string} line - Line to check
     * @returns {boolean} True if line starts with a date
     */
    isDateLine(line) {
        return /^\d{2}\/\d{2}\/\d{4}/.test(line.trim());
    }

    /**
     * Start a new transaction object
     * @param {string} line - Line containing date
     * @returns {Object} New transaction object
     */
    startNewTransaction(line) {
        const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        return {
            date: dateMatch ? dateMatch[0] : '',
            valeur: '',
            nature: '',
            debit: null,
            credit: null
        };
    }

    /**
     * Add information to existing transaction
     * @param {Object} transaction - Transaction object to update
     * @param {string} line - Line to add
     */
    addToTransaction(transaction, line) {
        // Check for second date (valeur date)
        const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch && !transaction.valeur) {
            transaction.valeur = dateMatch[0];
        }
        
        // Check for amounts
        const amountMatch = line.match(/(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d+)/g);
        if (amountMatch) {
            const amount = amountMatch[amountMatch.length - 1];
            if (this.isDebitTransaction(line, transaction.nature)) {
                transaction.debit = amount;
            } else {
                transaction.credit = amount;
            }
        }
        
        // Add to nature description
        let cleanLine = line;
        if (dateMatch) {
            dateMatch.forEach(d => cleanLine = cleanLine.replace(d, ''));
        }
        if (amountMatch) {
            amountMatch.forEach(a => cleanLine = cleanLine.replace(a, ''));
        }
        
        cleanLine = cleanLine.trim();
        if (cleanLine && !transaction.nature.includes(cleanLine)) {
            transaction.nature += ' ' + cleanLine;
        }
    }

    /**
     * Determine if transaction is a debit based on context
     * @param {string} line - Transaction line
     * @param {string} nature - Nature of transaction
     * @returns {boolean} True if debit transaction
     */
    isDebitTransaction(line, nature) {
        const debitKeywords = [
            'PRELEVEMENT',
            'VIREMENT EMIS',
            'VIR EMIS', 
            'VIR INSTANTANE EMIS',
            'FRAIS',
            'COMMISSION',
            'COTISATION',
            'ABONNEMENT',
            'FACTURE',
            'PAIEMENT',
            'RETRAIT',
            'CARTE',
            'CB ',
            'CHEQUE',
            'ACHAT',
            'LOCATION',
            'LOYER',
            'ASSURANCE',
            'MUTUELLE',
            'INTERNET',
            'TELEPHONE',
            'ELECTRICITE',
            'GAZ',
            'EAU',
            'SALAIRE',
            'PAIE',
            'REMUNERATION',
            'VIREMENT SALAIRE',
            'VIREMENT PAIE',
            'MASSE SALARIALE'
        ];
        
        // Credit keywords (money coming in) - be very specific
        const creditKeywords = [
            'VIREMENT RECU',
            'VIR RECU',
            'VIR INSTANTANE RECU', 
            'REMISE CB',
            'VERSEMENT RECU',
            'DEPOT ESPECE',
            'ENCAISSEMENT'
        ];
        
        const upperLine = (line + ' ' + nature).toUpperCase();
        
        // Check for credits first (be strict about credits)
        if (creditKeywords.some(keyword => upperLine.includes(keyword))) {
            return false;
        }
        
        // Check for debits (be more lenient about debits)
        if (debitKeywords.some(keyword => upperLine.includes(keyword))) {
            return true;
        }
        
        // Default assumption: if it has an amount and no clear credit indicator, it's likely a debit
        // This is because most transactions in business accounts are expenses
        return true;
    }

    /**
     * Categorize transaction based on nature description
     * @param {string} nature - Transaction description
     * @returns {Object} Category and confidence level
     */
    categorizeTransaction(nature) {
        const upperNature = nature.toUpperCase();
        
        // Exact matches first
        for (const category of this.costCategories) {
            if (upperNature.includes(category)) {
                return { category, confidence: 'high' };
            }
        }
        
        // Fuzzy matching rules - improved for better categorization
        const fuzzyRules = {
            'MASSE SALARIALE': ['VIR INSTANTANE EMIS NET', 'VIREMENT SALAIRE', 'PAIE', 'REMUNERATION', 'SALAIRE'],
            'FRAIS BANQUE': ['FRAIS', 'BANCAIRE', 'COMMISSION', 'AGIOS', 'COTISATION CARTE', 'TENUE COMPTE'],
            'INTERNET': ['ORANGE', 'SFR', 'BOUYGUES', 'FREE', 'TELECOM', 'INTERNET', 'MOBILE', 'FIBRE'],
            'ASSURANCE': ['ASSURANCE', 'ASSUR', 'MAIF', 'MACIF', 'AXA', 'ALLIANZ', 'GENERALI'],
            'LOYER CABINET': ['LOYER', 'LOCATION', 'BAIL', 'IMMOBILIER', 'CABINET', 'LOCAL'],
            'GYM': ['GYM', 'FITNESS', 'SPORT', 'CLUB', 'SALLE DE SPORT', 'MUSCULATION'],
            'CHARGES SOCIALES': ['URSSAF', 'SOCIAL', 'COTISATION', 'SECU', 'RETRAITE', 'POLE EMPLOI'],
            'LEASING MOTO': ['LEASING.*MOTO', 'LOCATION.*MOTO', 'SCOOTER', 'DEUX ROUES'],
            'LEASING VOITURE': ['LEASING.*VOITURE', 'LOCATION.*VEHICULE', 'AUTO', 'VOITURE'],
            'MUTUELLE': ['MUTUELLE', 'COMPLEMENTAIRE', 'SANTE', 'MEDICAL'],
            'MATERIEL CABINET': ['MATERIEL', 'EQUIPEMENT', 'FOURNITURE', 'MOBILIER'],
            'LOGICIEL CABINET': ['LOGICIEL', 'SOFTWARE', 'LICENCE', 'ABONNEMENT.*INFORMATIQUE'],
            'PREVOYANCE': ['PREVOYANCE', 'DECES', 'INVALIDITE', 'INCAPACITE'],
            'TPE BANQUE': ['TPE', 'TERMINAL', 'PAIEMENT', 'MONETIQUE']
        };
        
        for (const [category, keywords] of Object.entries(fuzzyRules)) {
            for (const keyword of keywords) {
                const regex = new RegExp(keyword, 'i');
                if (regex.test(upperNature)) {
                    return { category, confidence: 'medium' };
                }
            }
        }
        
        return { category: 'AUTRES', confidence: 'low' };
    }

    /**
     * Extract client name from transaction description
     * @param {string} nature - Transaction description
     * @returns {string} Extracted client name
     */
    extractClientName(nature) {
        // Handle VIR INSTANTANE EMIS NET (salary payments)
        if (nature.includes('VIR INSTANTANE EMIS NET')) {
            const match = nature.match(/POUR:\s*([^0-9\n]+)/i);
            if (match) {
                return match[1].trim().replace(/\s+/g, ' ');
            }
            return 'Salary Payment';
        }
        
        // Handle PRELEVEMENT EUROPEEN
        if (nature.includes('PRELEVEMENT EUROPEEN')) {
            const match = nature.match(/DE:\s*([^0-9\n]+)/i);
            if (match) {
                return match[1].trim().replace(/\s+/g, ' ');
            }
        }
        
        // Remove common prefixes
        let cleanNature = nature
            .replace(/^(PRELEVEMENT|VIREMENT|PAIEMENT)\s*/i, '')
            .replace(/^(EUROPEEN\s*)?SEPA\s*/i, '')
            .replace(/^(INSTANTANE\s*)?EMIS\s*NET\s*/i, '')
            .replace(/^(DE|DU|LA|LE|LES):\s*/i, '')
            .replace(/^(POUR|PAR):\s*/i, '');
        
        // Extract meaningful company name parts
        const words = cleanNature.split(/\s+/);
        const meaningfulWords = words.filter(word => 
            word.length > 2 && 
            !word.match(/^\d/) && 
            !word.match(/^(DE|DU|LA|LE|LES|POUR|PAR|ET|OU|AVEC|SANS|REF|DATE|MOTIF)$/i)
        );
        
        // Take more words for better company names
        const clientName = meaningfulWords.slice(0, 5).join(' ').trim();
        
        // Clean up common patterns
        return clientName
            .replace(/\s+/g, ' ')
            .replace(/[^a-zA-ZÀ-ÿ0-9\s\-\.]/g, ' ')
            .trim() || 'Unknown Client';
    }

    /**
     * Determine movement type from transaction description
     * @param {string} nature - Transaction description
     * @returns {string} Movement type
     */
    determineMovementType(nature) {
        const upperNature = nature.toUpperCase();
        
        if (upperNature.includes('PRELEVEMENT')) return 'direct_debit';
        if (upperNature.includes('VIREMENT')) return 'transfer';
        if (upperNature.includes('CARTE') || upperNature.includes('CB')) return 'card';
        if (upperNature.includes('CHEQUE')) return 'check';
        
        return 'other';
    }

    /**
     * Determine transaction frequency
     * @param {string} nature - Transaction description
     * @returns {string} Frequency type
     */
    determineFrequency(nature) {
        const upperNature = nature.toUpperCase();
        
        const monthlyKeywords = ['LOYER', 'ABONNEMENT', 'ASSURANCE', 'MUTUELLE', 'INTERNET', 'TELEPHONE'];
        const occasionalKeywords = ['ACHAT', 'FACTURE', 'REPARATION', 'MAINTENANCE'];
        
        for (const keyword of monthlyKeywords) {
            if (upperNature.includes(keyword)) return 'monthly';
        }
        
        for (const keyword of occasionalKeywords) {
            if (upperNature.includes(keyword)) return 'occasional';
        }
        
        return 'unknown';
    }

    /**
     * Process extracted transactions into structured expense data
     * @param {Array} transactions - Raw transactions from PDF
     * @returns {Array} Processed expense objects
     */
    processTransactions(transactions) {
        return transactions.map((transaction, index) => {
            const categorization = this.categorizeTransaction(transaction.nature);
            const clientName = this.extractClientName(transaction.nature);
            const movementType = this.determineMovementType(transaction.nature);
            const frequency = this.determineFrequency(transaction.nature);
            
            // Convert amount format (French to standard) - preserve exact format
            const amountStr = transaction.debit.replace(/\s/g, ''); // Remove spaces
            const amount = parseFloat(amountStr.replace(',', '.'));
            
            return {
                index: index + 1,
                date: transaction.date,
                center: '', // Manual entry required
                client: clientName,
                amountWithTaxes: amountStr + '€',
                amountWithoutTaxes: '', // Manual calculation required
                worker: '', // Manual entry required
                taxes: '', // Manual calculation required
                typeOfTransaction: 'cost',
                typeOfMovement: movementType,
                frequency: frequency,
                typeOfClient: 'service',
                service: categorization.category,
                confidence: categorization.confidence,
                rawNature: transaction.nature // Keep original for reference
            };
        });
    }
}

// Export for use in HTML file
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BankStatementExtractor;
} else {
    window.BankStatementExtractor = BankStatementExtractor;
}
