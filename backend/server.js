require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

const Routes = require('./routes/Routes');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MONGODB success");
    })
    .catch((error) => {
        console.error("Error in Connection:", error);
    });

app.use('/api/auth', Routes);

app.get('/', (req, res) =>{
    res.send('Welcome to Neighbourhood Help App Home Page');
});

app.listen(5000, () => {
    console.log("Server is Running perfectly on 5000");
});

// test data



