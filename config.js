// Environment configuration for frontend
window.BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : 'https://pdf-expense-tracker-api.onrender.com';

console.log('Backend URL configured:', window.BACKEND_URL);

// Check for GoGain integration parameters
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('token')) {
    console.log('🔗 GoGain integration detected');
}
