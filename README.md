# PDF Expense Tracker

AI-powered PDF expense extraction service for French bank statements (Société Générale format).

## Features

- 🤖 **AI-powered extraction** using OpenAI GPT-4o
- 📄 **French bank statement support** (Société Générale)
- 🎯 **DÉBIT column detection** - Only extracts expenses, not income
- 🏷️ **Automatic categorization** - Business expense categories
- 🌐 **REST API** - Easy integration with other applications
- ⚡ **Universal column detection** - Works with any monthly PDF

## Architecture

- **Backend**: Node.js/Express API (Deploy to Render)
- **Frontend**: Static HTML/JS (Deploy to Vercel)
- **AI**: OpenAI GPT-4o for extraction and categorization

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/extract-transactions` - Extract transactions from PDF text
- `POST /api/categorize-transactions` - Categorize extracted transactions

## Environment Variables

```bash
OPENAI_API_KEY=your_openai_api_key_here
FRONTEND_URL=https://your-vercel-app.vercel.app
NODE_ENV=production
PORT=3001
```

## Local Development

```bash
npm install
npm start
```

Visit `http://localhost:3001/expense-tracker.html`

## Deployment

### Backend (Render)
1. Connect GitHub repository
2. Set environment variables
3. Deploy with `npm start`

### Frontend (Vercel)
1. Connect GitHub repository  
2. Deploy static files
3. Update `config.js` with backend URL

## Integration

Perfect for integration with expense management apps like GoGain. Use the REST API to extract and categorize bank statement transactions automatically.

## License

MIT
