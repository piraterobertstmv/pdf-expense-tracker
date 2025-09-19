// Environment configuration for frontend
window.BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : 'https://YOUR_RENDER_APP.onrender.com';

console.log('Backend URL configured:', window.BACKEND_URL);
