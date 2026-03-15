const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (request, response) =>{
    response.send('Welcome to Neighbourhood Help App Home Page');
});

app.listen(5000, () => {
    console.log(" Server is Running perfectly on 5000");

});