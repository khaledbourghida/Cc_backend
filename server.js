const express = require('express');
const cors = require('cors');
// const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api' , require('./routes/auth'));
// app.use('/Auth' , express.static('C:/Users/HP/Desktop/Cc/public/Auth'));

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});